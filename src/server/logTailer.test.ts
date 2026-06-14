import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
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
