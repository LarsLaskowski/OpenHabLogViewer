import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// main.ts resolves all of its control elements at module scope (via the
// instanceof-checked lookups), so the DOM — mirroring the ids and element
// types of index.html — and the element constructors must be installed as
// globals before the module is imported.
const dom = new JSDOM(
  `<!doctype html>
  <html>
    <head>
      <link id="app-favicon" rel="icon" href="./assets/openHAB_appicon.svg" />
    </head>
    <body>
      <img id="app-brand-image" src="./assets/openHAB_workswith.svg" alt="openHAB logo" />
      <div id="connection-status"></div>
      <section id="controls-panel">
        <select id="source-filter"><option value="all">Both</option></select>
        <select id="level-filter"><option value="all">All</option></select>
        <input id="text-filter" type="search" />
        <select id="theme-select"><option value="light">Light</option></select>
        <select id="order-select"><option value="newest-first">Newest first</option></select>
        <input id="auto-scroll" type="checkbox" />
        <input id="pause-toggle" type="checkbox" />
        <input id="hide-source-toggle" type="checkbox" />
        <button id="clear-button" type="button">Clear</button>
        <div id="source-status-list"></div>
      </section>
      <main id="log-container"></main>
    </body>
  </html>`,
  { url: 'http://localhost/' }
);

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
