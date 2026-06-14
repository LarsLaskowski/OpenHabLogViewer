import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderConnectionStatus, renderLogLines, renderSourceStatuses } from './render.js';
import { ConnectionState, LogLine, SourceStatus } from './state.js';

// render.ts uses the global `document`; back it with jsdom before any render call.
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document as unknown as Document;

function header(id: number, overrides: Partial<LogLine> = {}): LogLine {
  return {
    id,
    source: 'events',
    fileName: 'events.log',
    rawLine: `r${id}`,
    receivedAt: '',
    isTimestamped: true,
    timestamp: '2026-06-13T10:00:00.000Z',
    level: 'INFO',
    logger: 'logger',
    message: `m${id}`,
    isContinuation: false,
    groupId: `events-${id}`,
    ...overrides
  };
}

function continuation(id: number, overrides: Partial<LogLine> = {}): LogLine {
  return {
    id,
    source: 'events',
    fileName: 'events.log',
    rawLine: `cont ${id}`,
    receivedAt: '',
    isTimestamped: false,
    timestamp: null,
    level: null,
    logger: null,
    message: `cont ${id}`,
    isContinuation: true,
    groupId: null,
    ...overrides
  };
}

const messages = (target: HTMLElement): (string | null | undefined)[] =>
  Array.from(target.children).map((child) => child.querySelector('.message-cell')?.textContent);

describe('renderConnectionStatus', () => {
  it('sets the label and class for each connection state', () => {
    const cases: [ConnectionState, string][] = [
      ['connected', 'Connected'],
      ['reconnecting', 'Reconnecting'],
      ['error', 'Connection failed'],
      ['connecting', 'Connecting']
    ];
    for (const [stateValue, label] of cases) {
      const el = document.createElement('div');
      renderConnectionStatus(el, stateValue);
      assert.equal(el.textContent, label);
      assert.ok(el.classList.contains(`connection-${stateValue}`));
    }
  });
});

describe('renderSourceStatuses', () => {
  it('renders a chip per source with its state class, symbol and file name', () => {
    const target = document.createElement('div');
    const statuses: SourceStatus[] = [
      { source: 'events', fileName: 'events.log', state: 'watching', message: '', updatedAt: '' },
      { source: 'openhab', fileName: 'openhab.log', state: 'missing', message: 'File not found', updatedAt: '' }
    ];
    renderSourceStatuses(target, statuses);

    assert.equal(target.children.length, 2);
    const [first, second] = Array.from(target.children);
    assert.ok(first.classList.contains('status-chip'));
    assert.ok(first.classList.contains('state-watching'));
    assert.equal(first.querySelector('.status-indicator')?.textContent, '●');
    assert.equal(first.querySelector('.status-file-name')?.textContent, 'events.log');
    assert.ok(second.classList.contains('state-missing'));
    assert.equal(second.querySelector('.status-indicator')?.textContent, '!');
  });

  it('clears previous chips on re-render', () => {
    const target = document.createElement('div');
    renderSourceStatuses(target, [{ source: 'events', fileName: 'events.log', state: 'idle', message: '', updatedAt: '' }]);
    renderSourceStatuses(target, [{ source: 'openhab', fileName: 'openhab.log', state: 'watching', message: '', updatedAt: '' }]);
    assert.equal(target.children.length, 1);
    assert.equal(target.querySelector('.status-file-name')?.textContent, 'openhab.log');
  });
});

describe('renderLogLines reconciliation', () => {
  it('reuses existing row nodes by id and reconciles additions/removals', () => {
    const container = document.createElement('main');

    renderLogLines(container, [header(1), header(2)], false, 'oldest-first', false);
    assert.equal(container.children.length, 2);
    const node1 = container.children[0];

    renderLogLines(container, [header(1), header(2), header(3)], false, 'oldest-first', false);
    assert.equal(container.children.length, 3);
    assert.equal(container.children[0], node1, 'row for id 1 should be reused, not recreated');
    assert.deepEqual(messages(container), ['m1', 'm2', 'm3']);

    renderLogLines(container, [header(2), header(3)], false, 'oldest-first', false);
    assert.deepEqual(messages(container), ['m2', 'm3']);
  });
});

describe('createLogLineElement (via renderLogLines)', () => {
  it('renders header rows with badge cells and continuation rows with placeholders', () => {
    const container = document.createElement('main');
    renderLogLines(container, [header(1), continuation(2)], false, 'oldest-first', false);

    const head = container.children[0];
    assert.ok(head.classList.contains('head-line'));
    assert.ok(head.classList.contains('source-events'));
    assert.ok(head.classList.contains('level-info'));
    assert.equal(head.querySelector('.source-badge')?.textContent, 'events.log');
    assert.equal(head.querySelector('.level-badge')?.textContent, 'INFO');
    assert.match(head.querySelector('.time-cell')?.textContent ?? '', /^\d{2}:\d{2}:\d{2}\.\d{3}$/);

    const cont = container.children[1];
    assert.ok(cont.classList.contains('continuation'));
    assert.equal(cont.querySelectorAll('.placeholder-cell').length, 4);
    assert.equal(cont.querySelector('.message-cell')?.textContent, 'cont 2');
  });

  it('formats known logger names, script loggers and *Event types', () => {
    const container = document.createElement('main');
    renderLogLines(
      container,
      [
        header(1, { logger: 'ItemCommandEvent' }),
        header(2, { logger: 'org.openhab.core.model.script.myrules' }),
        header(3, { logger: 'com.example.SomethingHappenedEvent' })
      ],
      false,
      'oldest-first',
      false
    );

    const loggerText = (index: number): string | null | undefined =>
      container.children[index].querySelector('.logger-cell')?.textContent;
    assert.equal(loggerText(0), 'Item command');
    assert.equal(loggerText(1), 'myrules');
    assert.equal(loggerText(2), 'Something Happened');
  });

  it('strips the (source: …) hint from the message when requested', () => {
    const container = document.createElement('main');
    renderLogLines(container, [header(1, { message: 'hello (source: zigbee) world' })], false, 'oldest-first', true);
    assert.equal(container.querySelector('.message-cell')?.textContent, 'hello world');
  });
});
