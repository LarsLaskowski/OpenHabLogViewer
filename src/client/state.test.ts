import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIENT_MAX_RENDERED_LINES_CAP,
  createInitialState,
  getEffectiveClientMaxRenderedLines
} from './state.js';

describe('getEffectiveClientMaxRenderedLines', () => {
  it('keeps a valid value below the cap', () => {
    assert.equal(getEffectiveClientMaxRenderedLines(100), 100);
  });

  it('clamps values above the cap to the cap', () => {
    assert.equal(getEffectiveClientMaxRenderedLines(5000), CLIENT_MAX_RENDERED_LINES_CAP);
    assert.equal(CLIENT_MAX_RENDERED_LINES_CAP, 500);
  });

  it('returns exactly the cap when given the cap', () => {
    assert.equal(getEffectiveClientMaxRenderedLines(500), 500);
  });

  it('falls back to the cap for non-positive or non-integer input', () => {
    assert.equal(getEffectiveClientMaxRenderedLines(0), CLIENT_MAX_RENDERED_LINES_CAP);
    assert.equal(getEffectiveClientMaxRenderedLines(-10), CLIENT_MAX_RENDERED_LINES_CAP);
    assert.equal(getEffectiveClientMaxRenderedLines(12.5), CLIENT_MAX_RENDERED_LINES_CAP);
    assert.equal(getEffectiveClientMaxRenderedLines(Number.NaN), CLIENT_MAX_RENDERED_LINES_CAP);
  });
});

describe('createInitialState', () => {
  it('provides the documented client-side defaults', () => {
    const state = createInitialState();
    assert.equal(state.theme, 'light');
    assert.equal(state.logOrder, 'newest-first');
    assert.equal(state.autoScroll, true);
    assert.equal(state.paused, false);
    assert.equal(state.connectionState, 'connecting');
    assert.equal(state.clientMaxRenderedLines, 500);
    assert.deepEqual(state.lines, []);
    assert.deepEqual(state.filters, { source: 'all', level: 'all', query: '', hideSourceInMessage: true });
  });

  it('seeds an idle placeholder status for both sources', () => {
    const state = createInitialState();
    assert.equal(state.statuses.events.state, 'idle');
    assert.equal(state.statuses.events.fileName, 'events.log');
    assert.equal(state.statuses.openhab.state, 'idle');
    assert.equal(state.statuses.openhab.fileName, 'openhab.log');
  });

  it('returns an independent object on each call', () => {
    const a = createInitialState();
    const b = createInitialState();
    a.lines.push({} as never);
    a.filters.query = 'changed';
    assert.deepEqual(b.lines, []);
    assert.equal(b.filters.query, '');
  });
});
