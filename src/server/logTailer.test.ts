import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LogTailer } from './logTailer.js';
import { LogLineParser } from './logLineParser.js';
import { LogLineDraft, SourceStatus } from './types.js';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface Harness {
  dir: string;
  filePath: string;
  lines: LogLineDraft[];
  statuses: SourceStatus[];
  tailer: LogTailer;
}

function makeHarness(fileName = 'events.log', initialLinesPerFile = 500): Harness {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ohlv-tailer-'));
  const filePath = path.join(dir, fileName);
  const lines: LogLineDraft[] = [];
  const statuses: SourceStatus[] = [];
  const tailer = new LogTailer({
    sourceConfig: { source: 'events', fileName, filePath },
    initialLinesPerFile,
    parser: new LogLineParser(),
    onLines: (batch) => lines.push(...batch),
    onStatus: (status) => statuses.push(status),
    pollIntervalMs: 20
  });
  return { dir, filePath, lines, statuses, tailer };
}

async function cleanup(h: Harness): Promise<void> {
  await h.tailer.stop();
  rmSync(h.dir, { recursive: true, force: true });
}

// Collects unhandled promise rejections while a test runs. Registering the
// listener also disables Node's default crash-on-rejection behavior, so the
// test can assert on the collected rejections instead of dying.
function captureUnhandledRejections(): { rejections: unknown[]; dispose: () => void } {
  const rejections: unknown[] = [];
  const listener = (reason: unknown): void => {
    rejections.push(reason);
  };
  process.on('unhandledRejection', listener);
  return {
    rejections,
    dispose: () => {
      process.off('unhandledRejection', listener);
    }
  };
}

describe('LogTailer', () => {
  it('returns the last lines and a watching status on initial load', async () => {
    const h = makeHarness();
    try {
      writeFileSync(h.filePath, 'a\nb\nc\n');
      const initial = await h.tailer.start();
      assert.deepEqual(initial.map((l) => l.rawLine), ['a', 'b', 'c']);
      assert.ok(h.statuses.some((s) => s.state === 'watching'));
    } finally {
      await cleanup(h);
    }
  });

  it('emits appended lines while tailing', async () => {
    const h = makeHarness();
    try {
      writeFileSync(h.filePath, '');
      await h.tailer.start();
      appendFileSync(h.filePath, 'live line\n');
      await delay(150);
      assert.ok(h.lines.some((l) => l.rawLine === 'live line'));
    } finally {
      await cleanup(h);
    }
  });

  it('reports a missing status when the file does not exist', async () => {
    const h = makeHarness('nope.log');
    try {
      const initial = await h.tailer.start();
      assert.deepEqual(initial, []);
      assert.ok(h.statuses.some((s) => s.state === 'missing'));
    } finally {
      await cleanup(h);
    }
  });

  it('detects truncation and re-reads from the start', async () => {
    const h = makeHarness();
    try {
      writeFileSync(h.filePath, 'one\ntwo\nthree\n');
      await h.tailer.start();
      writeFileSync(h.filePath, 'short\n'); // smaller than the previous offset
      await delay(150);
      assert.ok(h.statuses.some((s) => s.state === 'rotated'));
      assert.ok(h.lines.some((l) => l.rawLine === 'short'));
    } finally {
      await cleanup(h);
    }
  });

  it('detects rotation to a new file and tails the replacement from the start', async () => {
    const h = makeHarness();
    try {
      writeFileSync(h.filePath, 'old line\n');
      await h.tailer.start();

      // Classic logrotate move: rename the current file away and create a new
      // one under the same name. Both calls run synchronously in one tick, so
      // the next sync sees the replacement file (new inode) directly.
      renameSync(h.filePath, `${h.filePath}.1`);
      writeFileSync(h.filePath, 'fresh line\n');
      await delay(200);

      assert.ok(h.statuses.some((s) => s.state === 'rotated'));
      assert.ok(h.lines.some((l) => l.rawLine === 'fresh line'));
    } finally {
      await cleanup(h);
    }
  });

  it('reattaches when a missing file reappears', async () => {
    const h = makeHarness();
    try {
      writeFileSync(h.filePath, 'before\n');
      await h.tailer.start();

      rmSync(h.filePath);
      await delay(150);
      assert.ok(h.statuses.some((s) => s.state === 'missing'));

      writeFileSync(h.filePath, 'after\n');
      await delay(200);
      assert.ok(h.statuses.some((s) => s.message.startsWith('Reattached')));
      assert.ok(h.lines.some((l) => l.rawLine === 'after'));
    } finally {
      await cleanup(h);
    }
  });

  it('decodes multi-byte UTF-8 characters split across sync cycles', async () => {
    const h = makeHarness();
    try {
      writeFileSync(h.filePath, '');
      await h.tailer.start();

      // 'ü' encodes as 0xC3 0xBC; append the two halves in separate sync
      // cycles so the byte sequence is split at a poll boundary.
      const encoded = Buffer.from('Küche änderte sich\n', 'utf8');
      appendFileSync(h.filePath, encoded.subarray(0, 2)); // 'K' + first byte of 'ü'
      await delay(150);
      appendFileSync(h.filePath, encoded.subarray(2));
      await delay(150);

      assert.ok(
        h.lines.some((l) => l.rawLine === 'Küche änderte sich'),
        `expected an intact line, got: ${JSON.stringify(h.lines.map((l) => l.rawLine))}`
      );
    } finally {
      await cleanup(h);
    }
  });

  it('survives a post-stat open() failure while tailing and recovers (issue #129)', async () => {
    const h = makeHarness();
    const capture = captureUnhandledRejections();
    try {
      writeFileSync(h.filePath, 'first\n');
      await h.tailer.start();

      // Force the exact failure mode of the stat→open race deterministically:
      // replace the log file with a directory of the same name. stat() keeps
      // succeeding, but the by-path open() inside sync() then rejects
      // (EISDIR), just like ENOENT when logrotate renames the file away
      // between the two calls.
      rmSync(h.filePath);
      mkdirSync(h.filePath);
      await delay(200);
      assert.ok(
        h.statuses.some((s) => s.state === 'error' || s.state === 'missing'),
        `expected an error/missing status, got: ${JSON.stringify(h.statuses.map((s) => s.state))}`
      );

      // Once a regular file is back, the tailer must resume emitting lines.
      // Assert on a line appended after the replacement file has been picked
      // up: the replacement may reuse the old file's inode (common on tmpfs),
      // in which case rotation is not detected and the first read starts at
      // the stale offset — but appended lines must flow again either way.
      rmSync(h.filePath, { recursive: true, force: true });
      writeFileSync(h.filePath, 'recovered file content\n');
      await delay(150);
      appendFileSync(h.filePath, 'appended after recovery\n');
      await delay(200);
      assert.ok(
        h.lines.some((l) => l.rawLine === 'appended after recovery'),
        `expected the tailer to recover, got: ${JSON.stringify(h.lines.map((l) => l.rawLine))}`
      );

      assert.deepEqual(capture.rejections, []);
    } finally {
      capture.dispose();
      await cleanup(h);
    }
  });

  it('resolves start() with no lines when the post-stat read fails, then self-heals (issue #129)', async () => {
    const h = makeHarness();
    const capture = captureUnhandledRejections();
    try {
      // A directory at the log path makes stat() succeed while the open()
      // inside readLastLines rejects — the startup variant of the race.
      mkdirSync(h.filePath);
      const initial = await h.tailer.start();
      assert.deepEqual(initial, []);
      assert.ok(h.statuses.some((s) => s.state === 'error'));

      // The initial load is retried by the next sync cycles, so the tailer
      // starts emitting lines once a regular file appears.
      rmSync(h.filePath, { recursive: true, force: true });
      writeFileSync(h.filePath, 'after startup failure\n');
      await delay(200);
      assert.ok(
        h.lines.some((l) => l.rawLine === 'after startup failure'),
        `expected the tailer to self-heal, got: ${JSON.stringify(h.lines.map((l) => l.rawLine))}`
      );
      assert.ok(h.statuses.some((s) => s.state === 'watching'));

      assert.deepEqual(capture.rejections, []);
    } finally {
      capture.dispose();
      await cleanup(h);
    }
  });

  it('maps ENOENT thrown after a successful stat to a missing status and reattaches (issue #129)', async () => {
    const h = makeHarness();
    const capture = captureUnhandledRejections();
    try {
      writeFileSync(h.filePath, 'before\n');
      await h.tailer.start();

      // Drive the error handler directly with the rejection produced when the
      // file vanishes between stat() and open(): the tailer must report the
      // file as missing and reset so the next sync re-attaches.
      const enoent = Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
      (h.tailer as unknown as { handleSyncError(error: unknown): void }).handleSyncError(enoent);
      assert.equal(h.statuses.at(-1)?.state, 'missing');

      appendFileSync(h.filePath, 'still here\n');
      await delay(200);
      assert.ok(h.statuses.some((s) => s.message.startsWith('Reattached')));
      assert.ok(h.lines.some((l) => l.rawLine === 'still here'));

      assert.deepEqual(capture.rejections, []);
    } finally {
      capture.dispose();
      await cleanup(h);
    }
  });

  it('survives an FSWatcher error event and keeps tailing via polling (issue #131)', async () => {
    const h = makeHarness();
    const capture = captureUnhandledRejections();
    let uncaught: unknown = null;
    const onUncaught = (error: unknown): void => {
      uncaught = error;
    };
    process.on('uncaughtException', onUncaught);
    try {
      writeFileSync(h.filePath, 'first\n');
      await h.tailer.start();

      const internals = h.tailer as unknown as {
        watcher: (import('node:fs').FSWatcher & { emit(event: string, ...args: unknown[]): boolean }) | null;
      };
      assert.ok(internals.watcher, 'expected a watcher after start()');

      // Simulate a runtime watcher failure (directory removed, EMFILE, …),
      // delivered asynchronously as an 'error' event. Without a registered
      // listener this would be rethrown as an uncaught exception and crash.
      internals.watcher.emit('error', new Error('simulated inotify failure'));

      // (a) no crash, and (c) the watcher field is cleared.
      assert.equal(uncaught, null);
      assert.equal(internals.watcher, null);

      // (b) appended lines are still picked up by the poll loop.
      appendFileSync(h.filePath, 'after watcher error\n');
      await delay(200);
      assert.ok(
        h.lines.some((l) => l.rawLine === 'after watcher error'),
        `expected polling to keep tailing, got: ${JSON.stringify(h.lines.map((l) => l.rawLine))}`
      );

      assert.deepEqual(capture.rejections, []);
    } finally {
      process.off('uncaughtException', onUncaught);
      capture.dispose();
      await cleanup(h);
    }
  });

  it('self-heals the watcher after an error, ignoring a late error from the old instance (issue #131)', async () => {
    // Poll fast enough that the ~WATCHER_RETRY_POLLS (30) cycle delay before a
    // re-attach elapses within the test.
    const h = makeHarness('events.log', 500);
    try {
      writeFileSync(h.filePath, 'first\n');
      await h.tailer.start();

      const internals = h.tailer as unknown as {
        watcher: (import('node:fs').FSWatcher & { emit(event: string, ...args: unknown[]): boolean }) | null;
      };
      const oldWatcher = internals.watcher;
      assert.ok(oldWatcher, 'expected a watcher after start()');

      oldWatcher.emit('error', new Error('first failure'));
      assert.equal(internals.watcher, null);

      // The poll loop re-establishes the watch after the retry countdown.
      await delay(1000);
      const newWatcher = internals.watcher;
      assert.ok(newWatcher, 'expected the watcher to be re-established');
      assert.notEqual(newWatcher, oldWatcher);

      // A late error from the already-replaced old instance must not tear down
      // the healthy new watcher.
      oldWatcher.emit('error', new Error('late failure from old instance'));
      assert.equal(internals.watcher, newWatcher);
    } finally {
      await cleanup(h);
    }
  });

  it('does not load a huge unterminated line into memory on bootstrap (byte cap)', async () => {
    const h = makeHarness();
    try {
      // 12 MB single line, no newline: exceeds MAX_TAIL_SCAN_BYTES (8 MB).
      writeFileSync(h.filePath, 'A'.repeat(12 * 1024 * 1024));
      const initial = await h.tailer.start();
      // The leading partial line is dropped, so nothing is surfaced and we did not OOM.
      assert.deepEqual(initial, []);
    } finally {
      await cleanup(h);
    }
  });
});
