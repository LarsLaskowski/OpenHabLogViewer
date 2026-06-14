import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DerivedLogView } from './derivedLogView.js';
import { ClientState, LogLine } from './state.js';

function line(id: number, overrides: Partial<LogLine> = {}): LogLine {
  return {
    id,
    source: 'events',
    fileName: 'events.log',
    rawLine: `raw ${id}`,
    receivedAt: '',
    isTimestamped: true,
    timestamp: null,
    level: 'INFO',
    logger: 'logger',
    message: `raw ${id}`,
    isContinuation: false,
    groupId: null,
    ...overrides
  };
}

function filters(overrides: Partial<ClientState['filters']> = {}): ClientState['filters'] {
  return { source: 'all', level: 'all', query: '', hideSourceInMessage: true, ...overrides };
}

const ids = (lines: LogLine[]): number[] => lines.map((l) => l.id);

describe('DerivedLogView ordering', () => {
  it('returns all lines reversed for newest-first', () => {
    const view = new DerivedLogView(filters());
    assert.deepEqual(ids(view.getDisplayLines([line(1), line(2), line(3)], 'newest-first')), [3, 2, 1]);
  });

  it('returns lines in buffer order for oldest-first', () => {
    const view = new DerivedLogView(filters());
    assert.deepEqual(ids(view.getDisplayLines([line(1), line(2), line(3)], 'oldest-first')), [1, 2, 3]);
  });
});

describe('DerivedLogView filtering', () => {
  it('applies source and level filters', () => {
    const lines = [
      line(1, { source: 'events', level: 'INFO' }),
      line(2, { source: 'openhab', level: 'ERROR' }),
      line(3, { source: 'events', level: 'ERROR' })
    ];

    const view = new DerivedLogView(filters({ source: 'events', level: 'ERROR' }));
    assert.deepEqual(ids(view.getDisplayLines(lines, 'oldest-first')), [3]);
  });

  it('setFilters reports whether the filter key actually changed', () => {
    const view = new DerivedLogView(filters());
    assert.equal(view.setFilters(filters({ query: 'abc' })), true);
    assert.equal(view.setFilters(filters({ query: 'abc' })), false);
    assert.equal(view.queryLength, 3);
  });
});

describe('DerivedLogView cache state', () => {
  it('moves through recompute-filters -> hit -> recompute-order', () => {
    const view = new DerivedLogView(filters());
    assert.equal(view.cacheState(), 'recompute-filters');

    view.getDisplayLines([line(1)], 'newest-first');
    assert.equal(view.cacheState(), 'hit');

    view.markOrderDirty();
    assert.equal(view.cacheState(), 'recompute-order');

    view.getDisplayLines([line(1)], 'oldest-first');
    assert.equal(view.setFilters(filters({ level: 'WARN' })), true);
    assert.equal(view.cacheState(), 'recompute-filters');
  });
});

describe('DerivedLogView incremental updates', () => {
  it('unshifts appended lines for newest-first', () => {
    const view = new DerivedLogView(filters());
    view.getDisplayLines([line(1), line(2)], 'newest-first'); // establish cache -> [2,1]
    view.applyBufferedDelta([line(3)], [], 'newest-first');
    assert.deepEqual(ids(view.getDisplayLines([line(1), line(2), line(3)], 'newest-first')), [3, 2, 1]);
  });

  it('appends and evicts for oldest-first', () => {
    const view = new DerivedLogView(filters());
    view.getDisplayLines([line(1), line(2), line(3)], 'oldest-first');
    view.applyBufferedDelta([line(4)], [line(1)], 'oldest-first'); // drop oldest, add newest
    assert.deepEqual(ids(view.getDisplayLines([line(2), line(3), line(4)], 'oldest-first')), [2, 3, 4]);
  });

  it('excludes appended lines that do not match the active filter', () => {
    const view = new DerivedLogView(filters({ level: 'ERROR' }));
    view.getDisplayLines([line(1, { level: 'ERROR' })], 'oldest-first');
    view.applyBufferedDelta([line(2, { level: 'INFO' })], [], 'oldest-first');
    assert.deepEqual(ids(view.getDisplayLines([line(1, { level: 'ERROR' }), line(2, { level: 'INFO' })], 'oldest-first')), [1]);
  });

  it('reset clears the cached view', () => {
    const view = new DerivedLogView(filters());
    view.getDisplayLines([line(1), line(2)], 'newest-first');
    view.reset();
    assert.equal(view.cacheState(), 'recompute-filters');
    assert.deepEqual(ids(view.getDisplayLines([line(9)], 'newest-first')), [9]);
  });
});
