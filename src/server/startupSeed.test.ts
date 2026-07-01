import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LogBuffer } from './logBuffer.js';
import { createSeededLinePusher, sortInitialLines } from './startupSeed.js';
import { LogLine, LogLineDraft } from './types.js';

function draft(overrides: Partial<LogLineDraft> = {}): LogLineDraft {
  return {
    source: 'events',
    fileName: 'events.log',
    rawLine: 'raw',
    receivedAt: '2026-01-01T00:00:00.000Z',
    isTimestamped: true,
    timestamp: '2026-01-01T00:00:00.000Z',
    level: 'INFO',
    logger: 'logger',
    message: 'message',
    isContinuation: false,
    groupId: 'events-1',
    ...overrides
  };
}

describe('sortInitialLines', () => {
  it('orders lines from different sources by timestamp', () => {
    const sorted = sortInitialLines([
      draft({ rawLine: 'e2', timestamp: '2026-01-01T00:00:02.000Z' }),
      draft({ rawLine: 'o1', source: 'openhab', timestamp: '2026-01-01T00:00:01.000Z' }),
      draft({ rawLine: 'e3', timestamp: '2026-01-01T00:00:03.000Z' })
    ]);
    assert.deepEqual(sorted.map((line) => line.rawLine), ['o1', 'e2', 'e3']);
  });

  it('keeps timestampless lines with the last timestamped line of their source', () => {
    const sorted = sortInitialLines([
      draft({ rawLine: 'e1', timestamp: '2026-01-01T00:00:01.000Z' }),
      draft({ rawLine: 'e1-cont', timestamp: null, isTimestamped: false, isContinuation: true }),
      draft({ rawLine: 'o0', source: 'openhab', timestamp: '2026-01-01T00:00:00.000Z' })
    ]);
    assert.deepEqual(sorted.map((line) => line.rawLine), ['o0', 'e1', 'e1-cont']);
  });

  it('sorts timestampless lines with no prior header first', () => {
    const sorted = sortInitialLines([
      draft({ rawLine: 'e1', timestamp: '2026-01-01T00:00:01.000Z' }),
      draft({ rawLine: 'orphan', source: 'openhab', timestamp: null, isTimestamped: false })
    ]);
    assert.deepEqual(sorted.map((line) => line.rawLine), ['orphan', 'e1']);
  });

  it('breaks timestamp ties by the original index', () => {
    const timestamp = '2026-01-01T00:00:01.000Z';
    const sorted = sortInitialLines([
      draft({ rawLine: 'first', timestamp }),
      draft({ rawLine: 'second', source: 'openhab', timestamp }),
      draft({ rawLine: 'third', timestamp })
    ]);
    assert.deepEqual(sorted.map((line) => line.rawLine), ['first', 'second', 'third']);
  });
});

describe('createSeededLinePusher', () => {
  function makePusher(): {
    buffer: LogBuffer;
    broadcasts: LogLine[];
    pusher: ReturnType<typeof createSeededLinePusher>;
  } {
    const buffer = new LogBuffer(100);
    const broadcasts: LogLine[] = [];
    const pusher = createSeededLinePusher(buffer, {
      broadcast: (_event, data) => broadcasts.push(data as LogLine)
    });
    return { buffer, broadcasts, pusher };
  }

  it('queues live lines that arrive before the seed and flushes them after it', () => {
    const { buffer, broadcasts, pusher } = makePusher();

    pusher.pushLiveLines([draft({ rawLine: 'live-early' })]);
    assert.equal(buffer.getItems().length, 0);
    assert.equal(broadcasts.length, 0);

    pusher.seedInitialLines([draft({ rawLine: 'seed-1' }), draft({ rawLine: 'seed-2' })]);

    // Seed lines get the lowest ids; the queued live line follows them.
    assert.deepEqual(buffer.getItems().map((line) => line.rawLine), ['seed-1', 'seed-2', 'live-early']);
    assert.deepEqual(broadcasts.map((line) => line.rawLine), ['live-early']);
  });

  it('pushes and broadcasts live lines directly once seeded', () => {
    const { buffer, broadcasts, pusher } = makePusher();

    pusher.seedInitialLines([]);
    pusher.pushLiveLines([draft({ rawLine: 'live-1' }), draft({ rawLine: 'live-2' })]);

    assert.deepEqual(buffer.getItems().map((line) => line.rawLine), ['live-1', 'live-2']);
    assert.deepEqual(broadcasts.map((line) => line.rawLine), ['live-1', 'live-2']);
    assert.equal(broadcasts[0].id, 1);
  });
});
