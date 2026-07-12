import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LogBuffer } from './logBuffer.js';
import { LogLineDraft } from './types.js';

function draft(overrides: Partial<LogLineDraft> = {}): LogLineDraft {
  return {
    source: 'events',
    fileName: 'events.log',
    rawLine: 'x',
    receivedAt: '2026-01-01T00:00:00.000Z',
    isTimestamped: true,
    timestamp: '2026-01-01T00:00:00.000Z',
    level: 'INFO',
    logger: 'logger',
    message: 'x',
    isContinuation: false,
    groupId: 'events-1',
    ...overrides
  };
}

describe('LogBuffer', () => {
  it('assigns monotonically increasing ids starting at 1', () => {
    const buffer = new LogBuffer(10);
    const a = buffer.push(draft());
    const b = buffer.push(draft());
    assert.equal(a.id, 1);
    assert.equal(b.id, 2);
  });

  it('reports an empty range before anything is pushed', () => {
    const buffer = new LogBuffer(10);
    assert.deepEqual(buffer.getRange(), { oldestId: null, newestId: null, totalLines: 0 });
    assert.deepEqual(buffer.getItems(), []);
  });

  it('evicts the oldest lines beyond capacity while keeping ids stable', () => {
    const buffer = new LogBuffer(3);
    for (let i = 0; i < 5; i += 1) {
      buffer.push(draft({ message: `m${i}` }));
    }

    const items = buffer.getItems();
    assert.deepEqual(items.map((line) => line.id), [3, 4, 5]);
    assert.deepEqual(buffer.getRange(), { oldestId: 3, newestId: 5, totalLines: 3 });
  });

  it('getItems(limit) returns the most recent N lines', () => {
    const buffer = new LogBuffer(100);
    for (let i = 0; i < 5; i += 1) {
      buffer.push(draft());
    }
    assert.deepEqual(buffer.getItems(2).map((line) => line.id), [4, 5]);
  });

  it('getItemsAfterId returns only lines newer than the cursor', () => {
    const buffer = new LogBuffer(100);
    for (let i = 0; i < 5; i += 1) {
      buffer.push(draft());
    }
    assert.deepEqual(buffer.getItemsAfterId(3).map((line) => line.id), [4, 5]);
    assert.deepEqual(buffer.getItemsAfterId(5), []);
    // A cursor older than everything currently buffered returns all current lines.
    assert.deepEqual(buffer.getItemsAfterId(0).map((line) => line.id), [1, 2, 3, 4, 5]);
  });

  it('getItemsAfterId caps the copy to the newest maxItems lines after the cursor', () => {
    const buffer = new LogBuffer(100);
    for (let i = 0; i < 20; i += 1) {
      buffer.push(draft());
    }

    // Without a cap the cursor at id 5 yields ids 6..20 (15 lines).
    assert.equal(buffer.getItemsAfterId(5).length, 15);
    // With maxItems the copy is bounded to the newest maxItems of those lines.
    assert.deepEqual(buffer.getItemsAfterId(5, 3).map((line) => line.id), [18, 19, 20]);
    // A cap larger than the available count leaves the result unchanged.
    assert.deepEqual(buffer.getItemsAfterId(17, 10).map((line) => line.id), [18, 19, 20]);
  });

  it('keeps the logical order and ids correct after wrapping around capacity', () => {
    const buffer = new LogBuffer(3);
    for (let i = 0; i < 10; i += 1) {
      buffer.push(draft({ message: `m${i}` }));
    }

    assert.deepEqual(buffer.getItems().map((line) => line.id), [8, 9, 10]);
    assert.deepEqual(buffer.getItems(2).map((line) => line.id), [9, 10]);
    assert.deepEqual(buffer.getRange(), { oldestId: 8, newestId: 10, totalLines: 3 });
  });

  it('getItemsAfterId honors eviction once the buffer has wrapped', () => {
    const buffer = new LogBuffer(3);
    for (let i = 0; i < 6; i += 1) {
      buffer.push(draft());
    }

    // Only ids 4..6 remain buffered after eviction.
    assert.deepEqual(buffer.getItemsAfterId(4).map((line) => line.id), [5, 6]);
    assert.deepEqual(buffer.getItemsAfterId(6), []);
    // A cursor older than everything buffered returns all current lines.
    assert.deepEqual(buffer.getItemsAfterId(0).map((line) => line.id), [4, 5, 6]);
  });

  it('returns copies so callers cannot mutate the internal store', () => {
    const buffer = new LogBuffer(10);
    buffer.push(draft());
    const first = buffer.getItems();
    first.push(draft() as never);
    assert.equal(buffer.getRange().totalLines, 1);
  });
});
