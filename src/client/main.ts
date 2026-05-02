import { applyFilters } from './filters.js';
import { renderConnectionStatus, renderLogLines, renderSourceStatuses } from './render.js';
import {
  BootstrapResponse,
  ClientState,
  FiltersState,
  LogLine,
  LogOrder,
  SourceStatus,
  Theme,
  createInitialState
} from './state.js';

const state = createInitialState();
const UI_PREFERENCES_STORAGE_KEY = 'openhab-log-viewer.ui-preferences';
const THEME_STORAGE_KEY = 'openhab-log-viewer.theme';
const LOG_ORDER_STORAGE_KEY = 'openhab-log-viewer.log-order';

const connectionStatusElement = getRequiredElement('connection-status');
const controlsElement = getRequiredElement('controls-panel');
const sourceStatusListElement = getRequiredElement('source-status-list');
const logContainerElement = getRequiredElement('log-container');
const sourceFilterElement = getRequiredInput<HTMLSelectElement>('source-filter');
const levelFilterElement = getRequiredInput<HTMLSelectElement>('level-filter');
const textFilterElement = getRequiredInput<HTMLInputElement>('text-filter');
const themeSelectElement = getRequiredInput<HTMLSelectElement>('theme-select');
const orderSelectElement = getRequiredInput<HTMLSelectElement>('order-select');
const autoScrollElement = getRequiredInput<HTMLInputElement>('auto-scroll');
const pauseToggleElement = getRequiredInput<HTMLInputElement>('pause-toggle');
const clearButtonElement = getRequiredInput<HTMLButtonElement>('clear-button');
const faviconElement = getRequiredLink('app-favicon');
const brandImageElement = getRequiredImage('app-brand-image');

void bootstrap();

async function bootstrap(): Promise<void> {
  applyStoredPreferences(loadStoredPreferences());
  applyTheme(state.theme);
  applyLogOrderLayout(state.logOrder);
  syncControlsFromState();
  renderConnectionStatus(connectionStatusElement, state.connectionState);

  const response = await fetch('/api/bootstrap');
  const payload = (await response.json()) as BootstrapResponse;

  state.clientMaxRenderedLines = payload.config.clientMaxRenderedLines;
  state.lines = payload.lines.slice(-state.clientMaxRenderedLines);
  for (const status of payload.statuses) {
    state.statuses[status.source] = status;
  }

  bindControls();
  renderAll();
  connectStream();
}

function bindControls(): void {
  sourceFilterElement.addEventListener('change', () => {
    state.filters.source = sourceFilterElement.value as typeof state.filters.source;
    persistPreferences();
    renderAll();
  });

  levelFilterElement.addEventListener('change', () => {
    state.filters.level = levelFilterElement.value as typeof state.filters.level;
    persistPreferences();
    renderAll();
  });

  textFilterElement.addEventListener('input', () => {
    state.filters.query = textFilterElement.value;
    persistPreferences();
    renderAll();
  });

  themeSelectElement.addEventListener('change', () => {
    state.theme = parseTheme(themeSelectElement.value);
    applyTheme(state.theme);
    persistPreferences();
  });

  orderSelectElement.addEventListener('change', () => {
    state.logOrder = parseLogOrder(orderSelectElement.value);
    applyLogOrderLayout(state.logOrder);
    persistPreferences();
    renderAll();
  });

  autoScrollElement.addEventListener('change', () => {
    state.autoScroll = autoScrollElement.checked;
    persistPreferences();
    renderAll();
  });

  pauseToggleElement.addEventListener('change', () => {
    state.paused = pauseToggleElement.checked;
    persistPreferences();
    if (!state.paused) {
      renderAll();
    }
  });

  clearButtonElement.addEventListener('click', () => {
    state.lines = [];
    renderAll();
  });
}

function connectStream(): void {
  const stream = new EventSource('/api/stream');

  stream.addEventListener('open', () => {
    state.connectionState = 'connected';
    renderConnectionStatus(connectionStatusElement, state.connectionState);
  });

  stream.addEventListener('error', () => {
    state.connectionState = 'reconnecting';
    renderConnectionStatus(connectionStatusElement, state.connectionState);
  });

  stream.addEventListener('source-status', (event) => {
    const status = JSON.parse((event as MessageEvent<string>).data) as SourceStatus;
    state.statuses[status.source] = status;
    renderSourceStatuses(sourceStatusListElement, Object.values(state.statuses));
  });

  stream.addEventListener('log-line', (event) => {
    const line = JSON.parse((event as MessageEvent<string>).data) as LogLine;
    state.lines.push(line);
    if (state.lines.length > state.clientMaxRenderedLines) {
      state.lines.splice(0, state.lines.length - state.clientMaxRenderedLines);
    }

    if (!state.paused) {
      renderLogLines(logContainerElement, getDisplayLines(), state.autoScroll, state.logOrder);
    }
  });
}

function renderAll(): void {
  renderConnectionStatus(connectionStatusElement, state.connectionState);
  renderSourceStatuses(sourceStatusListElement, Object.values(state.statuses));
  renderLogLines(logContainerElement, getDisplayLines(), state.autoScroll, state.logOrder);
}

function getRequiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }

  return element;
}

function getRequiredInput<T extends HTMLElement>(id: string): T {
  return getRequiredElement(id) as T;
}

function getRequiredImage(id: string): HTMLImageElement {
  const element = getRequiredElement(id);
  if (!(element instanceof HTMLImageElement)) {
    throw new Error(`Expected image element: ${id}`);
  }

  return element;
}

function getRequiredLink(id: string): HTMLLinkElement {
  const element = getRequiredElement(id);
  if (!(element instanceof HTMLLinkElement)) {
    throw new Error(`Expected link element: ${id}`);
  }

  return element;
}

function applyStoredPreferences(preferences: StoredUiPreferences): void {
  state.filters = preferences.filters;
  state.theme = preferences.theme;
  state.logOrder = preferences.logOrder;
  state.autoScroll = preferences.autoScroll;
  state.paused = preferences.paused;
}

function syncControlsFromState(): void {
  sourceFilterElement.value = state.filters.source;
  levelFilterElement.value = state.filters.level;
  textFilterElement.value = state.filters.query;
  themeSelectElement.value = state.theme;
  orderSelectElement.value = state.logOrder;
  autoScrollElement.checked = state.autoScroll;
  pauseToggleElement.checked = state.paused;
}

function persistPreferences(): void {
  const preferences: StoredUiPreferences = {
    filters: state.filters,
    theme: state.theme,
    logOrder: state.logOrder,
    autoScroll: state.autoScroll,
    paused: state.paused
  };

  localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  localStorage.setItem(THEME_STORAGE_KEY, state.theme);
  localStorage.setItem(LOG_ORDER_STORAGE_KEY, state.logOrder);
}

function loadStoredPreferences(): StoredUiPreferences {
  const storedValue = localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
  const parsedValue = parseStoredPreferences(storedValue);

  return {
    filters: parsedValue?.filters ?? createInitialState().filters,
    theme: parsedValue?.theme ?? loadStoredTheme(),
    logOrder: parsedValue?.logOrder ?? loadStoredLogOrder(),
    autoScroll: parsedValue?.autoScroll ?? true,
    paused: parsedValue?.paused ?? false
  };
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
    query: typeof candidate.query === 'string' ? candidate.query : ''
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

function loadStoredTheme(): Theme {
  return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
}

function parseOptionalTheme(value: unknown): Theme | undefined {
  return value === 'light' || value === 'dark' ? value : undefined;
}

function parseTheme(value: unknown): Theme {
  return value === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  faviconElement.href = theme === 'dark' ? './assets/openHAB_darkBG_appicon.svg' : './assets/openHAB_appicon.svg';
  brandImageElement.src = theme === 'dark' ? './assets/openHAB_workswith_darkBG.svg' : './assets/openHAB_workswith.svg';
}

function applyLogOrderLayout(logOrder: LogOrder): void {
  controlsElement.classList.toggle('sticky-oldest-first', logOrder === 'oldest-first');
}

function loadStoredLogOrder(): LogOrder {
  return parseLogOrder(localStorage.getItem(LOG_ORDER_STORAGE_KEY));
}

function parseOptionalLogOrder(value: unknown): LogOrder | undefined {
  return value === 'newest-first' || value === 'oldest-first' ? value : undefined;
}

function parseLogOrder(value: unknown): LogOrder {
  return value === 'oldest-first' ? 'oldest-first' : 'newest-first';
}

function getDisplayLines(): LogLine[] {
  const filteredLines = applyFilters(state.lines, state.filters);
  return state.logOrder === 'newest-first' ? filteredLines.reverse() : filteredLines;
}

interface StoredUiPreferences {
  filters: FiltersState;
  theme: Theme;
  logOrder: LogOrder;
  autoScroll: ClientState['autoScroll'];
  paused: ClientState['paused'];
}
