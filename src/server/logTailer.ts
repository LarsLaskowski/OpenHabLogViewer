import { FSWatcher, Stats, watch } from 'node:fs';
import { dirname } from 'node:path';
import { clearInterval, setInterval } from 'node:timers';
import { open, stat } from 'node:fs/promises';
import { LogLineDraft, SourceConfig, SourceState, SourceStatus } from './types.js';
import { LogLineParser } from './logLineParser.js';

// Bound the amount of appended data processed in a single sync cycle. A larger
// delta — a log burst between two polls, a backfilled file, or a file replaced
// in place by a much larger one (same inode, so rotation is not detected) — is
// treated like a rotation: we skip ahead and reload only the tail instead of
// loading the whole difference into memory at once.
const MAX_SYNC_DELTA_BYTES = 8 * 1024 * 1024;

// Cap a single unterminated line. A writer that never emits a trailing newline
// (or binary garbage in the log) must not be able to grow `pendingChunk`
// without bound; once it exceeds this size we force-flush it as its own row.
const MAX_PENDING_CHUNK_CHARS = 1024 * 1024;

interface LogTailerOptions {
  sourceConfig: SourceConfig;
  initialLinesPerFile: number;
  parser: LogLineParser;
  onLines: (lines: LogLineDraft[]) => void;
  onStatus: (status: SourceStatus) => void;
  pollIntervalMs?: number;
}

export class LogTailer {
  private readonly pollIntervalMs: number;
  private readonly sourceConfig: SourceConfig;
  private readonly parser: LogLineParser;
  private readonly onLines: (lines: LogLineDraft[]) => void;
  private readonly onStatus: (status: SourceStatus) => void;
  private readonly initialLinesPerFile: number;

  private offset = 0;
  private currentFileKey: string | null = null;
  private pendingChunk = '';
  private syncInFlight = false;
  private syncQueued = false;
  private hasLoadedInitialLines = false;
  private currentState: SourceState = 'idle';
  private currentMessage = '';
  private pollTimer: NodeJS.Timeout | null = null;
  private watcher: FSWatcher | null = null;

  constructor(options: LogTailerOptions) {
    this.sourceConfig = options.sourceConfig;
    this.initialLinesPerFile = options.initialLinesPerFile;
    this.parser = options.parser;
    this.onLines = options.onLines;
    this.onStatus = options.onStatus;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
  }

  async start(): Promise<LogLineDraft[]> {
    const initialLines = await this.loadInitialLines();
    this.startWatchingDirectory();
    this.pollTimer = setInterval(() => {
      void this.sync();
    }, this.pollIntervalMs);

    return initialLines;
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.watcher?.close();
    this.watcher = null;
  }

  private async loadInitialLines(): Promise<LogLineDraft[]> {
    const fileStats = await this.safeStat();
    if (!fileStats) {
      return [];
    }

    const lines = await readLastLines(this.sourceConfig.filePath, this.initialLinesPerFile);
    this.offset = fileStats.size;
    this.currentFileKey = toFileKey(fileStats);
    this.hasLoadedInitialLines = true;
    this.emitStatus('watching', `Watching ${this.sourceConfig.fileName}`);

    return lines.map((line) => this.parser.parse(this.sourceConfig, line));
  }

  private startWatchingDirectory(): void {
    const directory = dirname(this.sourceConfig.filePath);
    try {
      this.watcher = watch(directory, { persistent: false }, (_event: string, fileName: string | Buffer | null) => {
        // Trigger only on events for our own file. `!fileName` covers platforms that
        // do not report the filename; renames/rotations of the watched file are still
        // caught by the filename match and the periodic poll fallback. Events for other
        // files in the log directory (audit logs, logrotate backups) are ignored.
        if (!fileName || fileName.toString() === this.sourceConfig.fileName) {
          void this.sync();
        }
      });
    } catch {
      console.error(`[tailer] Unable to watch directory: ${directory}`);
      this.emitStatus('error', `Cannot watch log directory for ${this.sourceConfig.fileName}`);
    }
  }

  private async handleInitialLoad(fileStats: Stats, nextFileKey: string): Promise<void> {
    const initialLines = await readLastLines(this.sourceConfig.filePath, this.initialLinesPerFile);
    this.offset = fileStats.size;
    this.currentFileKey = nextFileKey;
    this.hasLoadedInitialLines = true;
    this.emitStatus('watching', `Watching ${this.sourceConfig.fileName}`);
    if (initialLines.length > 0) {
      this.onLines(initialLines.map((line) => this.parser.parse(this.sourceConfig, line)));
    }
  }

  private async handleReattach(fileStats: Stats, nextFileKey: string): Promise<void> {
    const reattachedLines = await readLastLines(this.sourceConfig.filePath, this.initialLinesPerFile);
    this.offset = fileStats.size;
    this.currentFileKey = nextFileKey;
    this.pendingChunk = '';
    this.emitStatus('watching', `Reattached to ${this.sourceConfig.fileName}`);
    if (reattachedLines.length > 0) {
      this.onLines(reattachedLines.map((line) => this.parser.parse(this.sourceConfig, line)));
    }
  }

  private async skipAheadToTail(fileStats: Stats, nextFileKey: string, delta: number): Promise<void> {
    const tailLines = await readLastLines(this.sourceConfig.filePath, this.initialLinesPerFile);
    this.offset = fileStats.size;
    this.currentFileKey = nextFileKey;
    this.pendingChunk = '';
    this.emitStatus(
      'rotated',
      `Skipped ${formatBytes(delta)} backlog for ${this.sourceConfig.fileName}; showing latest lines`
    );
    if (tailLines.length > 0) {
      this.onLines(tailLines.map((line) => this.parser.parse(this.sourceConfig, line)));
    }
  }

  private async sync(): Promise<void> {
    if (this.syncInFlight) {
      this.syncQueued = true;
      return;
    }

    this.syncInFlight = true;
    try {
      const fileStats = await this.safeStat();
      if (!fileStats) {
        return;
      }

      const nextFileKey = toFileKey(fileStats);

      if (!this.hasLoadedInitialLines) {
        await this.handleInitialLoad(fileStats, nextFileKey);
        return;
      }

      if (!this.currentFileKey) {
        await this.handleReattach(fileStats, nextFileKey);
        return;
      }

      if (this.currentFileKey !== nextFileKey) {
        this.currentFileKey = nextFileKey;
        this.offset = 0;
        this.pendingChunk = '';
        this.emitStatus('rotated', `Detected rotation for ${this.sourceConfig.fileName}`);
      }

      if (fileStats.size < this.offset) {
        this.offset = 0;
        this.pendingChunk = '';
        this.emitStatus('rotated', `Detected truncation for ${this.sourceConfig.fileName}`);
      }

      if (fileStats.size === this.offset) {
        if (this.currentState !== 'watching') {
          this.emitStatus('watching', `Watching ${this.sourceConfig.fileName}`);
        }
        return;
      }

      const delta = fileStats.size - this.offset;
      if (delta > MAX_SYNC_DELTA_BYTES) {
        await this.skipAheadToTail(fileStats, nextFileKey, delta);
        return;
      }

      const nextChunk = await readRange(this.sourceConfig.filePath, this.offset, delta);
      this.offset = fileStats.size;
      this.currentFileKey = nextFileKey;

      const completedLines = this.consumeChunk(nextChunk);
      if (completedLines.length > 0) {
        this.emitStatus('watching', `Watching ${this.sourceConfig.fileName}`);
        this.onLines(completedLines.map((line) => this.parser.parse(this.sourceConfig, line)));
      }
    } finally {
      this.syncInFlight = false;
      if (this.syncQueued) {
        this.syncQueued = false;
        void this.sync();
      }
    }
  }

  private consumeChunk(chunk: string): string[] {
    const normalized = `${this.pendingChunk}${chunk}`.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const parts = normalized.split('\n');

    if (normalized.endsWith('\n')) {
      this.pendingChunk = '';
      parts.pop();
      return parts;
    }

    this.pendingChunk = parts.pop() ?? '';
    if (this.pendingChunk.length > MAX_PENDING_CHUNK_CHARS) {
      // The current physical line has no terminating newline yet but already
      // exceeds the cap. Force-flush it as its own row so the partial buffer
      // cannot grow without bound; any remainder starts a fresh pending line.
      parts.push(this.pendingChunk);
      this.pendingChunk = '';
    }
    return parts;
  }

  private async safeStat(): Promise<Stats | null> {
    try {
      return await stat(this.sourceConfig.filePath);
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : 'UNKNOWN';

      if (code === 'ENOENT') {
        this.offset = 0;
        this.currentFileKey = null;
        this.pendingChunk = '';
        console.log(`[tailer] ${this.sourceConfig.filePath}: ENOENT`);
        this.emitStatus('missing', `File not found: ${this.sourceConfig.fileName}`);
        return null;
      }

      if (code === 'EACCES' || code === 'EPERM') {
        console.log(`[tailer] ${this.sourceConfig.filePath}: ${code}`);
        this.emitStatus('permission-denied', `Permission denied: ${this.sourceConfig.fileName}`);
        return null;
      }

      this.emitStatus('error', `Error reading ${this.sourceConfig.fileName}: ${code}`);
      return null;
    }
  }

  private emitStatus(state: SourceState, message: string): void {
    if (this.currentState === state && this.currentMessage === message) {
      return;
    }

    this.currentState = state;
    this.currentMessage = message;
    this.onStatus({
      source: this.sourceConfig.source,
      fileName: this.sourceConfig.fileName,
      state,
      message,
      updatedAt: new Date().toISOString()
    });
  }
}

function toFileKey(fileStats: Stats): string {
  return `${fileStats.dev}:${fileStats.ino}`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

async function readRange(filePath: string, offset: number, length: number): Promise<string> {
  if (length <= 0) {
    return '';
  }

  const fileHandle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await fileHandle.read(buffer, 0, length, offset);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await fileHandle.close();
  }
}

async function readLastLines(filePath: string, maxLines: number): Promise<string[]> {
  const fileHandle = await open(filePath, 'r');
  try {
    const fileStats = await fileHandle.stat();
    if (fileStats.size === 0) {
      return [];
    }

    const chunkSize = 64 * 1024;
    let position = fileStats.size;
    const chunks: Buffer[] = [];
    let normalizedText = '';

    while (position > 0) {
      const size = Math.min(chunkSize, position);
      position -= size;

      const buffer = Buffer.alloc(size);
      const { bytesRead } = await fileHandle.read(buffer, 0, size, position);
      chunks.unshift(buffer.subarray(0, bytesRead));

      normalizedText = Buffer.concat(chunks).toString('utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const completeLines = normalizedText.endsWith('\n')
        ? normalizedText.split('\n').length - 1
        : normalizedText.split('\n').length - 2;

      if (completeLines >= maxLines) {
        break;
      }
    }

    const parts = normalizedText.split('\n');
    if (normalizedText.endsWith('\n')) {
      parts.pop();
    }

    return parts.slice(-maxLines);
  } finally {
    await fileHandle.close();
  }
}
