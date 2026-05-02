import { applyFilters } from './filters.js';
import { renderConnectionStatus, renderLogLines, renderSourceStatuses } from './render.js';
import { BootstrapResponse, LogLine, LogOrder, SourceStatus, Theme, createInitialState } from './state.js';

const state = createInitialState();
const THEME_STORAGE_KEY = 'openhab-log-viewer.theme';
const LOG_ORDER_STORAGE_KEY = 'openhab-log-viewer.log-order';

const connectionStatusElement = getRequiredElement('connection-status');
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

void bootstrap();

async function bootstrap(): Promise<void> {
  state.theme = loadStoredTheme();
  state.logOrder = loadStoredLogOrder();
  applyTheme(state.theme);
  themeSelectElement.value = state.theme;
  orderSelectElement.value = state.logOrder;
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
    renderAll();
  });

  levelFilterElement.addEventListener('change', () => {
    state.filters.level = levelFilterElement.value as typeof state.filters.level;
    renderAll();
  });

  textFilterElement.addEventListener('input', () => {
    state.filters.query = textFilterElement.value;
    renderAll();
  });

  themeSelectElement.addEventListener('change', () => {
    state.theme = parseTheme(themeSelectElement.value);
    applyTheme(state.theme);
    localStorage.setItem(THEME_STORAGE_KEY, state.theme);
  });

  orderSelectElement.addEventListener('change', () => {
    state.logOrder = parseLogOrder(orderSelectElement.value);
    localStorage.setItem(LOG_ORDER_STORAGE_KEY, state.logOrder);
    renderAll();
  });

  autoScrollElement.addEventListener('change', () => {
    state.autoScroll = autoScrollElement.checked;
    renderAll();
  });

  pauseToggleElement.addEventListener('change', () => {
    state.paused = pauseToggleElement.checked;
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

function loadStoredTheme(): Theme {
  const storedValue = localStorage.getItem(THEME_STORAGE_KEY);
  return parseTheme(storedValue);
}

function parseTheme(value: string | null): Theme {
  return value === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

function loadStoredLogOrder(): LogOrder {
  const storedValue = localStorage.getItem(LOG_ORDER_STORAGE_KEY);
  return parseLogOrder(storedValue);
}

function parseLogOrder(value: string | null): LogOrder {
  return value === 'oldest-first' ? 'oldest-first' : 'newest-first';
}

function getDisplayLines(): LogLine[] {
  const filteredLines = applyFilters(state.lines, state.filters);
  return state.logOrder === 'newest-first' ? filteredLines.reverse() : filteredLines;
}
