import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

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

// Importing the module executes the element lookups; a missing or wrongly
// typed element would throw here. init() is deliberately NOT called: it would
// start the bootstrap fetch / SSE machinery, which needs a running server.
const { init } = await import('./main.js');

describe('main module', () => {
  it('resolves all required control elements at import time and exports init', () => {
    assert.equal(typeof init, 'function');
  });
});
