import { FSWatcher, Stats, watch } from 'node:fs';
import { dirname } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
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

// Bound the bytes scanned backward when reading the tail of a file for
// bootstrap / reattach / skip-ahead. `readLastLines` normally stops once it has
// seen enough line terminators, but a file with very few or no newlines (a huge
// single line, or binary garbage) would otherwise be read entirely into memory.
// This cap bounds that cost; when it is hit we keep only the bytes scanned so
// far and drop the leading partial line.
const MAX_TAIL_SCAN_BYTES = 8 * 1024 * 1024;

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
  // Persistent decoder for the streamed byte ranges: a multi-byte UTF-8
  // character split across two sync cycles must be buffered here instead of
  // being decoded per range, which would turn both halves into U+FFFD.
  private utf8Decoder = new StringDecoder('utf8');
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

    try {
      const { lines, size } = await readLastLines(this.sourceConfig.filePath, this.initialLinesPerFile);
      this.offset = size;
      this.currentFileKey = toFileKey(fileStats);
      this.hasLoadedInitialLines = true;
      this.emitStatus('watching', `Watching ${this.sourceConfig.fileName}`);

      return lines.map((line) => this.parser.parse(this.sourceConfig, line));
    } catch (error) {
      // The file can disappear between the successful stat() and the open()
      // inside readLastLines (e.g. logrotate renaming it away). Report the
      // failure instead of rejecting start(); `hasLoadedInitialLines` stays
      // false so the next sync() cycle retries via handleInitialLoad().
      this.handleSyncError(error);
      return [];
    }
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

  private async handleInitialLoad(nextFileKey: string): Promise<void> {
    const { lines, size } = await readLastLines(this.sourceConfig.filePath, this.initialLinesPerFile);
    this.offset = size;
    this.currentFileKey = nextFileKey;
    this.hasLoadedInitialLines = true;
    this.emitStatus('watching', `Watching ${this.sourceConfig.fileName}`);
    if (lines.length > 0) {
      this.onLines(lines.map((line) => this.parser.parse(this.sourceConfig, line)));
    }
  }

  private async handleReattach(nextFileKey: string): Promise<void> {
    const { lines, size } = await readLastLines(this.sourceConfig.filePath, this.initialLinesPerFile);
    this.offset = size;
    this.currentFileKey = nextFileKey;
    this.resetPartialLine();
    this.emitStatus('watching', `Reattached to ${this.sourceConfig.fileName}`);
    if (lines.length > 0) {
      this.onLines(lines.map((line) => this.parser.parse(this.sourceConfig, line)));
    }
  }

  private async skipAheadToTail(nextFileKey: string, delta: number): Promise<void> {
    const { lines, size } = await readLastLines(this.sourceConfig.filePath, this.initialLinesPerFile);
    this.offset = size;
    this.currentFileKey = nextFileKey;
    this.resetPartialLine();
    this.emitStatus(
      'rotated',
      `Skipped ${formatBytes(delta)} backlog for ${this.sourceConfig.fileName}; showing latest lines`
    );
    if (lines.length > 0) {
      this.onLines(lines.map((line) => this.parser.parse(this.sourceConfig, line)));
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
        await this.handleInitialLoad(nextFileKey);
        return;
      }

      if (!this.currentFileKey) {
        await this.handleReattach(nextFileKey);
        return;
      }

      if (this.currentFileKey !== nextFileKey) {
        this.currentFileKey = nextFileKey;
        this.offset = 0;
        this.resetPartialLine();
        this.emitStatus('rotated', `Detected rotation for ${this.sourceConfig.fileName}`);
      }

      if (fileStats.size < this.offset) {
        this.offset = 0;
        this.resetPartialLine();
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
        await this.skipAheadToTail(nextFileKey, delta);
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
    } catch (error) {
      // Every caller invokes sync() fire-and-forget (poll timer, fs.watch
      // callback, queued re-run below), so a rejection escaping here would be
      // an unhandled promise rejection and terminate the process. This mainly
      // catches I/O errors from the by-path open() calls after a successful
      // stat(), e.g. when logrotate renames the file away in between.
      this.handleSyncError(error);
    } finally {
      this.syncInFlight = false;
      if (this.syncQueued) {
        this.syncQueued = false;
        void this.sync();
      }
    }
  }

  // Discard any partially accumulated line together with any partial multi-byte
  // sequence held by the decoder. Required whenever the next read no longer
  // continues the previously read bytes (rotation, truncation, reattach,
  // skip-ahead, missing file).
  private resetPartialLine(): void {
    this.pendingChunk = '';
    this.utf8Decoder = new StringDecoder('utf8');
  }

  private consumeChunk(chunk: Buffer): string[] {
    const normalized = `${this.pendingChunk}${this.utf8Decoder.write(chunk)}`
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n');
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
      this.handleSyncError(error);
      return null;
    }
  }

  // Maps I/O errors from stat/open/read onto a source status. ENOENT resets
  // the tailer so the next cycle re-attaches via the `!this.currentFileKey`
  // branch in sync() once the file is back.
  private handleSyncError(error: unknown): void {
    const code = error instanceof Error && 'code' in error ? String(error.code) : 'UNKNOWN';

    if (code === 'ENOENT') {
      this.offset = 0;
      this.currentFileKey = null;
      this.resetPartialLine();
      console.log(`[tailer] ${this.sourceConfig.filePath}: ENOENT`);
      this.emitStatus('missing', `File not found: ${this.sourceConfig.fileName}`);
      return;
    }

    if (code === 'EACCES' || code === 'EPERM') {
      console.log(`[tailer] ${this.sourceConfig.filePath}: ${code}`);
      this.emitStatus('permission-denied', `Permission denied: ${this.sourceConfig.fileName}`);
      return;
    }

    this.emitStatus('error', `Error reading ${this.sourceConfig.fileName}: ${code}`);
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

// Returns the raw bytes so the caller can decode them through its persistent
// StringDecoder; decoding each range independently here would corrupt a
// multi-byte character that spans two ranges.
async function readRange(filePath: string, offset: number, length: number): Promise<Buffer> {
  if (length <= 0) {
    return Buffer.alloc(0);
  }

  const fileHandle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await fileHandle.read(buffer, 0, length, offset);
    return buffer.subarray(0, bytesRead);
  } finally {
    await fileHandle.close();
  }
}

interface TailRead {
  lines: string[];
  // File size observed while reading the tail. Callers use this as the next read
  // offset so that bytes appended after this point are picked up by the next
  // sync cycle instead of being re-emitted (which would duplicate rows).
  size: number;
}

async function readLastLines(filePath: string, maxLines: number): Promise<TailRead> {
  const fileHandle = await open(filePath, 'r');
  try {
    const fileStats = await fileHandle.stat();
    if (fileStats.size === 0) {
      return { lines: [], size: fileStats.size };
    }

    const chunkSize = 64 * 1024;
    let position = fileStats.size;
    const chunks: Buffer[] = [];
    let newlineCount = 0;
    let scannedBytes = 0;
    let scanTruncated = false;

    while (position > 0) {
      const size = Math.min(chunkSize, position);
      position -= size;

      const buffer = Buffer.alloc(size);
      const { bytesRead } = await fileHandle.read(buffer, 0, size, position);
      const chunk = buffer.subarray(0, bytesRead);
      chunks.unshift(chunk);
      scannedBytes += chunk.length;

      // Count newline bytes in this raw chunk only. `\n` (0x0A) never occurs as
      // a UTF-8 continuation byte, so a byte scan is safe and avoids decoding,
      // normalizing and splitting the whole accumulated tail on every iteration
      // (issue #66). Each line terminator marks one complete line, which is all
      // we need to decide when enough lines have been collected.
      for (const byte of chunk) {
        if (byte === 0x0a) {
          newlineCount += 1;
        }
      }

      if (newlineCount >= maxLines) {
        break;
      }

      // Stop before the accumulated tail can grow without bound on a file with
      // too few newlines. If we stop here mid-file, the leading line is partial
      // and is dropped below.
      if (scannedBytes >= MAX_TAIL_SCAN_BYTES) {
        scanTruncated = position > 0;
        break;
      }
    }

    // Decode and normalize the collected tail exactly once, after the loop.
    const normalizedText = Buffer.concat(chunks).toString('utf8').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    const parts = normalizedText.split('\n');
    if (normalizedText.endsWith('\n')) {
      parts.pop();
    }

    // When the scan stopped at the byte cap rather than a start-of-file or
    // line-terminator boundary, the first element was cut mid-line; drop it so
    // we never surface a partial line. (In the normal case `slice(-maxLines)`
    // already discards any leading partial.)
    if (scanTruncated && parts.length > 0) {
      parts.shift();
    }

    return { lines: parts.slice(-maxLines), size: fileStats.size };
  } finally {
    await fileHandle.close();
  }
}
