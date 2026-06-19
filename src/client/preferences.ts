import { ClientState, FiltersState, LogOrder, Theme, createInitialState } from './state.js';

// Minimal storage surface so the module can be exercised without a real
// localStorage (e.g. in unit tests).
export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StoredUiPreferences {
  filters: FiltersState;
  theme: Theme;
  logOrder: LogOrder;
  autoScroll: ClientState['autoScroll'];
  paused: ClientState['paused'];
}

const UI_PREFERENCES_STORAGE_KEY = 'openhab-log-viewer.ui-preferences';
const THEME_STORAGE_KEY = 'openhab-log-viewer.theme';
const LOG_ORDER_STORAGE_KEY = 'openhab-log-viewer.log-order';

// Cap the persisted query so an extreme value cannot bloat localStorage or
// risk hitting the storage quota on its own.
const MAX_STORED_QUERY_LENGTH = 1000;

export function loadStoredPreferences(storage: PreferenceStorage): StoredUiPreferences {
  const parsedValue = parseStoredPreferences(storage.getItem(UI_PREFERENCES_STORAGE_KEY));

  return {
    filters: parsedValue?.filters ?? createInitialState().filters,
    theme: parsedValue?.theme ?? parseTheme(storage.getItem(THEME_STORAGE_KEY)),
    logOrder: parsedValue?.logOrder ?? parseLogOrder(storage.getItem(LOG_ORDER_STORAGE_KEY)),
    autoScroll: parsedValue?.autoScroll ?? true,
    paused: parsedValue?.paused ?? false
  };
}

export function persistStoredPreferences(preferences: StoredUiPreferences, storage: PreferenceStorage): void {
  const cappedPreferences = capPreferencesQuery(preferences);

  // localStorage.setItem can throw (private-browsing mode, exceeded quota).
  // This runs from a debounce timer and the pagehide handler, so swallow the
  // error to keep those flows from crashing; preferences just won't persist.
  try {
    storage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(cappedPreferences));
    storage.setItem(THEME_STORAGE_KEY, cappedPreferences.theme);
    storage.setItem(LOG_ORDER_STORAGE_KEY, cappedPreferences.logOrder);
  } catch {
    console.warn('Unable to persist UI preferences to storage.');
  }
}

function capPreferencesQuery(preferences: StoredUiPreferences): StoredUiPreferences {
  if (preferences.filters.query.length <= MAX_STORED_QUERY_LENGTH) {
    return preferences;
  }

  return {
    ...preferences,
    filters: {
      ...preferences.filters,
      query: preferences.filters.query.slice(0, MAX_STORED_QUERY_LENGTH)
    }
  };
}

export function parseTheme(value: unknown): Theme {
  return value === 'dark' ? 'dark' : 'light';
}

export function parseLogOrder(value: unknown): LogOrder {
  return value === 'oldest-first' ? 'oldest-first' : 'newest-first';
}

function parseStoredPreferences(value: string | null): Partial<StoredUiPreferences> | null {
  if (!value) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    console.warn('Ignoring invalid stored UI preferences.');
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const candidate = parsed as Record<string, unknown>;

  return {
    filters: parseStoredFilters(candidate.filters),
    theme: parseOptionalTheme(candidate.theme),
    logOrder: parseOptionalLogOrder(candidate.logOrder),
    autoScroll: typeof candidate.autoScroll === 'boolean' ? candidate.autoScroll : undefined,
    paused: typeof candidate.paused === 'boolean' ? candidate.paused : undefined
  };
}

function parseStoredFilters(value: unknown): FiltersState | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  return {
    source: parseSourceFilter(candidate.source),
    level: parseLevelFilter(candidate.level),
    query: typeof candidate.query === 'string' ? candidate.query : '',
    hideSourceInMessage: typeof candidate.hideSourceInMessage === 'boolean' ? candidate.hideSourceInMessage : true
  };
}

function parseSourceFilter(value: unknown): FiltersState['source'] {
  return value === 'events' || value === 'openhab' ? value : 'all';
}

function parseLevelFilter(value: unknown): FiltersState['level'] {
  return value === 'TRACE' || value === 'DEBUG' || value === 'INFO' || value === 'WARN' || value === 'ERROR'
    ? value
    : 'all';
}

function parseOptionalTheme(value: unknown): Theme | undefined {
  return value === 'light' || value === 'dark' ? value : undefined;
}

function parseOptionalLogOrder(value: unknown): LogOrder | undefined {
  return value === 'newest-first' || value === 'oldest-first' ? value : undefined;
}
