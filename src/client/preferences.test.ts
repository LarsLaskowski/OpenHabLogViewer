import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PreferenceStorage,
  StoredUiPreferences,
  loadStoredPreferences,
  parseLogOrder,
  parseTheme,
  persistStoredPreferences
} from './preferences.js';

class FakeStorage implements PreferenceStorage {
  private store = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) {
      this.store.set(key, value);
    }
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const UI_KEY = 'openhab-log-viewer.ui-preferences';
const THEME_KEY = 'openhab-log-viewer.theme';
const ORDER_KEY = 'openhab-log-viewer.log-order';

describe('parseTheme / parseLogOrder', () => {
  it('parses known values and defaults otherwise', () => {
    assert.equal(parseTheme('dark'), 'dark');
    assert.equal(parseTheme('light'), 'light');
    assert.equal(parseTheme('nonsense'), 'light');
    assert.equal(parseTheme(null), 'light');

    assert.equal(parseLogOrder('oldest-first'), 'oldest-first');
    assert.equal(parseLogOrder('newest-first'), 'newest-first');
    assert.equal(parseLogOrder('nonsense'), 'newest-first');
  });
});

describe('loadStoredPreferences', () => {
  it('returns documented defaults for empty storage', () => {
    const prefs = loadStoredPreferences(new FakeStorage());
    assert.deepEqual(prefs, {
      filters: { source: 'all', level: 'all', query: '', hideSourceInMessage: true },
      theme: 'light',
      logOrder: 'newest-first',
      autoScroll: true,
      paused: false
    });
  });

  it('parses a complete stored preference blob', () => {
    const stored: StoredUiPreferences = {
      filters: { source: 'openhab', level: 'WARN', query: 'boom', hideSourceInMessage: false },
      theme: 'dark',
      logOrder: 'oldest-first',
      autoScroll: false,
      paused: true
    };
    const prefs = loadStoredPreferences(new FakeStorage({ [UI_KEY]: JSON.stringify(stored) }));
    assert.deepEqual(prefs, stored);
  });

  it('falls back to the separate theme/order keys when the main blob is absent', () => {
    const prefs = loadStoredPreferences(new FakeStorage({ [THEME_KEY]: 'dark', [ORDER_KEY]: 'oldest-first' }));
    assert.equal(prefs.theme, 'dark');
    assert.equal(prefs.logOrder, 'oldest-first');
    assert.equal(prefs.autoScroll, true);
  });

  it('ignores invalid JSON and returns defaults', () => {
    const prefs = loadStoredPreferences(new FakeStorage({ [UI_KEY]: '{not valid json' }));
    assert.equal(prefs.theme, 'light');
    assert.equal(prefs.filters.source, 'all');
  });

  it('sanitizes garbage filter fields to safe defaults', () => {
    const prefs = loadStoredPreferences(
      new FakeStorage({ [UI_KEY]: JSON.stringify({ filters: { source: 'nope', level: 42, query: 5 } }) })
    );
    assert.deepEqual(prefs.filters, { source: 'all', level: 'all', query: '', hideSourceInMessage: true });
  });
});

describe('persistStoredPreferences', () => {
  it('writes the main blob plus the theme and order keys', () => {
    const storage = new FakeStorage();
    const prefs: StoredUiPreferences = {
      filters: { source: 'events', level: 'INFO', query: '', hideSourceInMessage: true },
      theme: 'dark',
      logOrder: 'oldest-first',
      autoScroll: true,
      paused: false
    };
    persistStoredPreferences(prefs, storage);

    assert.equal(storage.getItem(THEME_KEY), 'dark');
    assert.equal(storage.getItem(ORDER_KEY), 'oldest-first');
    assert.deepEqual(JSON.parse(storage.getItem(UI_KEY) as string), prefs);
  });

  it('round-trips through load', () => {
    const storage = new FakeStorage();
    const prefs: StoredUiPreferences = {
      filters: { source: 'openhab', level: 'ERROR', query: 'x', hideSourceInMessage: false },
      theme: 'dark',
      logOrder: 'oldest-first',
      autoScroll: false,
      paused: true
    };
    persistStoredPreferences(prefs, storage);
    assert.deepEqual(loadStoredPreferences(storage), prefs);
  });
});
