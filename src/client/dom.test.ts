import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { getRequiredElement, getRequiredTypedElement } from './dom.js';

const dom = new JSDOM('<!doctype html><html><body><select id="a-select"></select><div id="a-div"></div></body></html>');
globalThis.document = dom.window.document as unknown as Document;

describe('getRequiredElement', () => {
  it('returns the element for an existing id', () => {
    assert.equal(getRequiredElement('a-div').id, 'a-div');
  });

  it('throws for a missing id', () => {
    assert.throws(() => getRequiredElement('nope'), /Missing required element: nope/);
  });
});

describe('getRequiredTypedElement', () => {
  it('returns the element when the type matches', () => {
    const element = getRequiredTypedElement('a-select', dom.window.HTMLSelectElement as unknown as typeof HTMLSelectElement);
    assert.equal(element.id, 'a-select');
  });

  it('throws a TypeError when the element has a different type', () => {
    assert.throws(
      () => getRequiredTypedElement('a-div', dom.window.HTMLSelectElement as unknown as typeof HTMLSelectElement),
      /Expected HTMLSelectElement element: a-div/
    );
  });
});
