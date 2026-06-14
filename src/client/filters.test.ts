import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPreparedLogFilters,
  createPreparedLogFilterKey,
  matchesPreparedLogFilters,
  prepareLogFilters
} from './filters.js';
import { ClientState, LogLine } from './state.js';

function line(overrides: Partial<LogLine> = {}): LogLine {
  return {
    id: 1,
    source: 'events',
    fileName: 'events.log',
    rawLine: 'Hello World from events',
    receivedAt: '',
    isTimestamped: true,
    timestamp: null,
    level: 'INFO',
    logger: 'logger',
    message: 'Hello World from events',
    isContinuation: false,
    groupId: null,
    ...overrides
  };
}

function filters(overrides: Partial<ClientState['filters']> = {}): ClientState['filters'] {
  return { source: 'all', level: 'all', query: '', hideSourceInMessage: true, ...overrides };
}

describe('prepareLogFilters', () => {
  it('trims and lowercases the query and keeps source/level', () => {
    const prepared = prepareLogFilters(filters({ source: 'events', level: 'WARN', query: '  FooBar ' }));
    assert.deepEqual(prepared, { source: 'events', level: 'WARN', query: 'foobar' });
  });
});

describe('createPreparedLogFilterKey', () => {
  it('builds a stable key from source, level and query', () => {
    const key = createPreparedLogFilterKey({ source: 'openhab', level: 'ERROR', query: 'abc' });
    assert.equal(key, 'openhab|ERROR|abc');
  });
});

describe('matchesPreparedLogFilters', () => {
  it('passes everything when all filters are "all" and query is empty', () => {
    assert.equal(matchesPreparedLogFilters(line(), prepareLogFilters(filters())), true);
  });

  it('filters by source', () => {
    const prepared = prepareLogFilters(filters({ source: 'openhab' }));
    assert.equal(matchesPreparedLogFilters(line({ source: 'events' }), prepared), false);
    assert.equal(matchesPreparedLogFilters(line({ source: 'openhab' }), prepared), true);
  });

  it('filters by level', () => {
    const prepared = prepareLogFilters(filters({ level: 'ERROR' }));
    assert.equal(matchesPreparedLogFilters(line({ level: 'INFO' }), prepared), false);
    assert.equal(matchesPreparedLogFilters(line({ level: 'ERROR' }), prepared), true);
  });

  it('matches the query case-insensitively against rawLine', () => {
    const prepared = prepareLogFilters(filters({ query: 'WORLD' }));
    assert.equal(matchesPreparedLogFilters(line({ rawLine: 'hello world' }), prepared), true);
    assert.equal(matchesPreparedLogFilters(line({ rawLine: 'nothing here' }), prepared), false);
  });

  it('combines all active filters with AND semantics', () => {
    const prepared = prepareLogFilters(filters({ source: 'events', level: 'WARN', query: 'boom' }));
    assert.equal(matchesPreparedLogFilters(line({ source: 'events', level: 'WARN', rawLine: 'boom!' }), prepared), true);
    assert.equal(matchesPreparedLogFilters(line({ source: 'events', level: 'INFO', rawLine: 'boom!' }), prepared), false);
  });
});

describe('applyPreparedLogFilters', () => {
  it('returns only the matching lines', () => {
    const lines = [
      line({ id: 1, source: 'events', rawLine: 'alpha' }),
      line({ id: 2, source: 'openhab', rawLine: 'beta' }),
      line({ id: 3, source: 'events', rawLine: 'gamma' })
    ];
    const prepared = prepareLogFilters(filters({ source: 'events' }));
    assert.deepEqual(applyPreparedLogFilters(lines, prepared).map((l) => l.id), [1, 3]);
  });
});
