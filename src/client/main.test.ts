import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import type { LogLine } from './state.js';

// main.ts resolves all of its control elements at module scope (via the
// instanceof-checked lookups), so the DOM and the element constructors must be
// installed as globals before the module is imported. The real index.html is
// loaded so the test cannot silently diverge from the shipped markup; jsdom
// does not execute the module script or fetch the referenced assets.
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/' });

globalThis.document = dom.window.document as unknown as Document;
globalThis.location = dom.window.location as unknown as Location;
globalThis.localStorage = dom.window.localStorage as unknown as Storage;
globalThis.HTMLElement = dom.window.HTMLElement as unknown as typeof HTMLElement;
globalThis.HTMLSelectElement = dom.window.HTMLSelectElement as unknown as typeof HTMLSelectElement;
globalThis.HTMLInputElement = dom.window.HTMLInputElement as unknown as typeof HTMLInputElement;
globalThis.HTMLButtonElement = dom.window.HTMLButtonElement as unknown as typeof HTMLButtonElement;
globalThis.HTMLLinkElement = dom.window.HTMLLinkElement as unknown as typeof HTMLLinkElement;
globalThis.HTMLImageElement = dom.window.HTMLImageElement as unknown as typeof HTMLImageElement;

// jsdom does not implement requestAnimationFrame; appendBufferedLine only
// schedules rendering indirectly in production, but guard against any RAF use
// so the test does not depend on the browser scheduler.
globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
  callback(0);
  return 0;
}) as typeof requestAnimationFrame;

// Importing the module executes the element lookups; a missing or wrongly
// typed element would throw here. init() is deliberately NOT called: it would
// start the bootstrap fetch / SSE machinery, which needs a running server.
const { init, __testables } = await import('./main.js');

function makeLine(id: number): LogLine {
  return {
    id,
    source: 'events',
    fileName: 'events.log',
    rawLine: `line ${id}`,
    receivedAt: '2026-01-01T00:00:00.000Z',
    isTimestamped: true,
    timestamp: '2026-01-01T00:00:00.000Z',
    level: 'INFO',
    logger: 'logger',
    message: `line ${id}`,
    isContinuation: false,
    groupId: 'events-1'
  };
}

describe('main module', () => {
  it('resolves all required control elements at import time and exports init', () => {
    assert.equal(typeof init, 'function');
  });

  it('recovers from a server restart line-id reset without dropping new lines (issue #130)', () => {
    const { state, syncState, applyResyncPayload, appendBufferedLine } = __testables;

    // The page outlived a server restart: state.lines still holds stale
    // pre-restart lines with large ids, and lastSeenLineId is stuck high.
    state.lines = [makeLine(5000), makeLine(5001)];
    syncState.lastSeenLineId = 5001;

    // The restarted server answers the resync with a fresh snapshot whose ids
    // start at 1 again (mode: reset, cursor-not-available).
    applyResyncPayload({
      lines: [makeLine(1), makeLine(2), makeLine(3)],
      statuses: [],
      mode: 'reset',
      resetReason: 'cursor-not-available',
      cursor: {
        oldestAvailableId: 1,
        newestAvailableId: 3,
        lastIncludedId: 3,
        limit: 500,
        totalBufferedLines: 3,
        truncated: false,
        requestedAfterId: 5001
      }
    });

    // (a) no stale pre-restart line survives.
    assert.deepEqual(state.lines.map((l) => l.id), [1, 2, 3]);
    // (b) lastSeenLineId tracks the fresh snapshot, not the stale maximum.
    assert.equal(syncState.lastSeenLineId, 3);
    // (c) the next live line with a small id is appended, not rejected as a dup.
    assert.equal(appendBufferedLine(makeLine(4)), true);
    assert.deepEqual(state.lines.map((l) => l.id), [1, 2, 3, 4]);
  });
});
