import {
  applyPreparedLogFilters,
  createPreparedLogFilterKey,
  matchesPreparedLogFilters,
  prepareLogFilters
} from './filters.js';
import { createClientPerformanceMonitor } from './performance.js';
import { renderConnectionStatus, renderLogLines, renderSourceStatuses } from './render.js';
import {
  BootstrapResponse,
  getEffectiveClientMaxRenderedLines,
  ClientState,
  FiltersState,
  LogLine,
  LogOrder,
  ResyncResponse,
  SourceStatus,
  SyncCursor,
  Theme,
  createInitialState
} from './state.js';
import type { PreparedLogFilters } from './filters.js';
import type { CompleteClientTiming, PerformanceMetricDetails } from './performance.js';

const state = createInitialState();
const UI_PREFERENCES_STORAGE_KEY = 'openhab-log-viewer.ui-preferences';
const THEME_STORAGE_KEY = 'openhab-log-viewer.theme';
const LOG_ORDER_STORAGE_KEY = 'openhab-log-viewer.log-order';
const SEARCH_INPUT_DEBOUNCE_MS = 150;
const UI_PREFERENCES_PERSIST_DEBOUNCE_MS = 250;
const VISIBILITY_RESYNC_IDLE_THRESHOLD_MS = 30_000;
const HIDDEN_TAB_BUFFERED_LINE_LIMIT = 250;
const performanceMonitor = createClientPerformanceMonitor();

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
const hideSourceToggleElement = getRequiredInput<HTMLInputElement>('hide-source-toggle');
const clearButtonElement = getRequiredInput<HTMLButtonElement>('clear-button');
const faviconElement = getRequiredLink('app-favicon');
const brandImageElement = getRequiredImage('app-brand-image');
let initialStreamOpenTiming: CompleteClientTiming | null = null;
let reconnectTiming: CompleteClientTiming | null = null;
let hasSeenStreamOpen = false;
let hiddenSinceMs: number | null = document.visibilityState === 'hidden' ? performance.now() : null;
let pendingVisibleRenderSinceMs: number | null = null;
let pendingVisibleSseSinceMs: number | null = null;
let pendingVisibleConnectionSinceMs: number | null = null;
let searchInputDebounceHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
let preferencesPersistDebounceHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
const pendingLiveRender: PendingLiveRenderState = {
  frameId: null,
  logLines: false,
  logLineCount: 0,
  sourceStatuses: false,
  sourceStatusCount: 0
};
const hiddenTabState: HiddenTabState = {
  connectionDirty: false,
  logLinesDirty: false,
  pendingResync: false,
  queuedLiveLines: [],
  sourceStatusesDirty: false
};
const syncState: ClientSyncState = {
  cursor: null,
  serverMaxSyncLines: null,
  lastSeenLineId: null,
  pendingResyncAfterOpen: false,
  bufferGeneration: 0,
  queuedLiveLines: [],
  resyncPromise: null
};
const derivedLogView: DerivedLogViewState = createDerivedLogViewState();

bindVisibilityInstrumentation();
bindLifecycleHandlers();
void bootstrap();

async function bootstrap(): Promise<void> {
  const completeBootstrapTiming = performanceMonitor.startTiming('bootstrap', 'bootstrap-total');
  const completePreferencesTiming = performanceMonitor.startTiming('bootstrap', 'apply-preferences');
  applyStoredPreferences(loadStoredPreferences());
  syncDerivedLogFiltersWithState();
  applyTheme(state.theme);
  syncControlsFromState();
  renderConnectionStatus(connectionStatusElement, state.connectionState);
  completePreferencesTiming({
    autoScroll: state.autoScroll,
    paused: state.paused,
    theme: state.theme,
    logOrder: state.logOrder
  });

  const completeFetchTiming = performanceMonitor.startTiming('bootstrap', 'fetch-bootstrap');
  const response = await fetch('/api/bootstrap');
  completeFetchTiming({
    ok: response.ok,
    status: response.status
  });

  const completeParseTiming = performanceMonitor.startTiming('bootstrap', 'parse-bootstrap-payload');
  const payload = (await response.json()) as BootstrapResponse;
  completeParseTiming({
    lineCount: payload.lines.length,
    statusCount: payload.statuses.length
  });

  const completeHydrationTiming = performanceMonitor.startTiming('bootstrap', 'hydrate-state');
  applyBootstrapPayload(payload);
  completeHydrationTiming({
    bufferedLines: state.lines.length,
    clientMaxRenderedLines: state.clientMaxRenderedLines,
    serverMaxSyncLines: syncState.serverMaxSyncLines,
    truncated: payload.cursor.truncated
  });

  const completeBindTiming = performanceMonitor.startTiming('bootstrap', 'bind-controls');
  bindControls();
  completeBindTiming();

  const displayedLines = renderAll('bootstrap');
  completeBootstrapTiming({
    bufferedLines: state.lines.length,
    displayedLines,
    statusCount: Object.values(state.statuses).length
  });

  initialStreamOpenTiming = performanceMonitor.startTiming('connection', 'initial-stream-open', {
    bufferedLines: state.lines.length
  });
  syncState.pendingResyncAfterOpen = true;
  connectStream();
}

function bindControls(): void {
  sourceFilterElement.addEventListener('change', () => {
    state.filters.source = sourceFilterElement.value as typeof state.filters.source;
    schedulePreferencesPersist();
    performanceMonitor.recordEvent('filter', 'source-change', {
      source: state.filters.source
    });
    if (syncDerivedLogFiltersWithState()) {
      renderAllImmediate('source-filter-change');
    }
  });

  levelFilterElement.addEventListener('change', () => {
    state.filters.level = levelFilterElement.value as typeof state.filters.level;
    schedulePreferencesPersist();
    performanceMonitor.recordEvent('filter', 'level-change', {
      level: state.filters.level
    });
    if (syncDerivedLogFiltersWithState()) {
      renderAllImmediate('level-filter-change');
    }
  });

  textFilterElement.addEventListener('input', () => {
    state.filters.query = textFilterElement.value;
    schedulePreferencesPersist();
    scheduleSearchInputRender();
  });

  themeSelectElement.addEventListener('change', () => {
    state.theme = parseTheme(themeSelectElement.value);
    applyTheme(state.theme);
    schedulePreferencesPersist();
  });

  orderSelectElement.addEventListener('change', () => {
    state.logOrder = parseLogOrder(orderSelectElement.value);
    markDerivedLogOrderDirty();
    schedulePreferencesPersist();
    performanceMonitor.recordEvent('render', 'log-order-change', {
      logOrder: state.logOrder
    });
    renderAllImmediate('log-order-change');
  });

  autoScrollElement.addEventListener('change', () => {
    state.autoScroll = autoScrollElement.checked;
    schedulePreferencesPersist();
    performanceMonitor.recordEvent('render', 'auto-scroll-toggle', {
      autoScroll: state.autoScroll
    });
    renderAllImmediate('auto-scroll-toggle');
  });

  pauseToggleElement.addEventListener('change', () => {
    state.paused = pauseToggleElement.checked;
    schedulePreferencesPersist();
    performanceMonitor.recordEvent('render', 'pause-toggle', {
      paused: state.paused
    });
    if (!state.paused) {
      renderAllImmediate('pause-resume');
    }
  });

  hideSourceToggleElement.addEventListener('change', () => {
    state.filters.hideSourceInMessage = hideSourceToggleElement.checked;
    schedulePreferencesPersist();
    performanceMonitor.recordEvent('filter', 'hide-source-toggle', {
      hideSourceInMessage: state.filters.hideSourceInMessage
    });
    renderAllImmediate('hide-source-toggle');
  });

  clearButtonElement.addEventListener('click', () => {
    syncState.bufferGeneration += 1;
    syncState.queuedLiveLines = [];
    resetHiddenTabState();
    state.lines = [];
    resetDerivedLogView();
    performanceMonitor.recordEvent('render', 'clear-buffer');
    renderAllImmediate('clear-buffer');
  });
}

function connectStream(): void {
  performanceMonitor.recordEvent('connection', 'stream-created', {
    visibilityState: document.visibilityState
  });
  const stream = new EventSource('/api/stream');

  stream.addEventListener('open', () => {
    const wasReconnecting = state.connectionState === 'reconnecting';
    const shouldResync = syncState.pendingResyncAfterOpen;
    state.connectionState = 'connected';
    markConnectionRenderPending();

    if (!hasSeenStreamOpen) {
      initialStreamOpenTiming?.({
        readyState: stream.readyState
      });
      initialStreamOpenTiming = null;
      hasSeenStreamOpen = true;
    } else if (reconnectTiming) {
      reconnectTiming({
        readyState: stream.readyState
      });
      reconnectTiming = null;
    }

    performanceMonitor.recordEvent('connection', wasReconnecting ? 'open-after-reconnect' : 'open', {
      readyState: stream.readyState,
      visibilityState: document.visibilityState
    });
    if (shouldResync && isDocumentVisible()) {
      void resyncFromServer(wasReconnecting ? 'reconnect' : 'initial-open');
    }
    consumeVisibleResumeConnection({
      readyState: stream.readyState,
      reconnected: wasReconnecting,
      resyncPending: shouldResync
    });
  });

  stream.addEventListener('error', () => {
    if (hasSeenStreamOpen && reconnectTiming === null) {
      reconnectTiming = performanceMonitor.startTiming('connection', 'reconnect', {
        visibilityState: document.visibilityState
      });
    }

    state.connectionState = 'reconnecting';
    syncState.pendingResyncAfterOpen = true;
    markConnectionRenderPending();
    performanceMonitor.recordEvent('connection', 'error', {
      hasSeenStreamOpen,
      readyState: stream.readyState,
      visibilityState: document.visibilityState
    });
  });

  stream.addEventListener('source-status', (event) => {
    const completeSseTiming = performanceMonitor.startTiming('sse', 'source-status', {
      visibilityState: document.visibilityState
    });
    const status = JSON.parse((event as MessageEvent<string>).data) as SourceStatus;
    state.statuses[status.source] = status;
    markSourceStatusRenderPending(1);
    completeSseTiming({
      batched: isDocumentVisible(),
      hidden: !isDocumentVisible(),
      source: status.source,
      state: status.state
    });
    consumeVisibleResumeSse({
      event: 'source-status',
      source: status.source,
      state: status.state
    });
  });

  stream.addEventListener('log-line', (event) => {
    const completeSseTiming = performanceMonitor.startTiming('sse', 'log-line', {
      bufferedBefore: state.lines.length,
      paused: state.paused,
      visibilityState: document.visibilityState
    });
    const line = JSON.parse((event as MessageEvent<string>).data) as LogLine;
    if (syncState.resyncPromise) {
      const queued = queueLiveLineDuringResync(line);
      completeSseTiming({
        bufferedAfter: state.lines.length,
        paused: state.paused,
        queuedForResync: queued,
        renderScheduled: false,
        source: line.source
      });
      consumeVisibleResumeSse({
        event: 'log-line',
        paused: state.paused,
        queuedForResync: queued,
        source: line.source
      });
      return;
    }

    if (!isDocumentVisible()) {
      const hiddenUpdate = handleHiddenLogLine(line);
      completeSseTiming({
        bufferedAfter: state.lines.length,
        hidden: true,
        hiddenQueuedLineCount: hiddenUpdate.hiddenQueuedLineCount,
        paused: state.paused,
        queuedForVisibility: hiddenUpdate.queued,
        renderScheduled: false,
        source: line.source,
        visibilityResyncPending: hiddenUpdate.resyncPending
      });
      return;
    }

    const appended = appendBufferedLine(line);

    if (!appended) {
      completeSseTiming({
        bufferedAfter: state.lines.length,
        duplicate: true,
        paused: state.paused,
        renderScheduled: false,
        source: line.source
      });
      return;
    }

    let displayedLines: number | null = null;
    if (!state.paused) {
      scheduleLiveRender({ logLines: 1 });
    }

    completeSseTiming({
      bufferedAfter: state.lines.length,
      displayedLines,
      paused: state.paused,
      renderScheduled: !state.paused,
      source: line.source
    });
    consumeVisibleResumeSse({
      event: 'log-line',
      paused: state.paused,
      source: line.source
    });
  });
}

function renderAll(renderReason: string): number {
  renderConnectionStatus(connectionStatusElement, state.connectionState);
  renderSourceStatuses(sourceStatusListElement, Object.values(state.statuses));
  return renderCurrentLogLines(renderReason);
}

function renderAllImmediate(renderReason: string): number {
  cancelPendingSearchInputRender();
  cancelScheduledLiveRender();
  return renderAll(renderReason);
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

function applyBootstrapPayload(payload: BootstrapResponse): void {
  state.clientMaxRenderedLines = getEffectiveClientLimit(payload.config.clientMaxRenderedLines);
  syncState.cursor = payload.cursor;
  syncState.serverMaxSyncLines = payload.config.serverMaxSyncLines;
  syncState.lastSeenLineId = payload.cursor.lastIncludedId;
  replaceBufferedLines(payload.lines);
  applySourceStatuses(payload.statuses);
}

function applySourceStatuses(statuses: SourceStatus[]): void {
  for (const status of statuses) {
    state.statuses[status.source] = status;
  }
}

function syncControlsFromState(): void {
  sourceFilterElement.value = state.filters.source;
  levelFilterElement.value = state.filters.level;
  textFilterElement.value = state.filters.query;
  hideSourceToggleElement.checked = state.filters.hideSourceInMessage;
  themeSelectElement.value = state.theme;
  orderSelectElement.value = state.logOrder;
  autoScrollElement.checked = state.autoScroll;
  pauseToggleElement.checked = state.paused;
}

function scheduleSearchInputRender(): void {
  if (searchInputDebounceHandle !== null) {
    globalThis.clearTimeout(searchInputDebounceHandle);
  }

  searchInputDebounceHandle = globalThis.setTimeout(() => {
    searchInputDebounceHandle = null;
    const filterKeyChanged = syncDerivedLogFiltersWithState();
    performanceMonitor.recordEvent('filter', 'text-change', {
      debounced: true,
      filterKeyChanged,
      queryLength: state.filters.query.length
    });
    if (filterKeyChanged) {
      renderAllImmediate('text-filter-change');
    }
  }, SEARCH_INPUT_DEBOUNCE_MS);
}

function cancelPendingSearchInputRender(): void {
  if (searchInputDebounceHandle === null) {
    return;
  }

  globalThis.clearTimeout(searchInputDebounceHandle);
  searchInputDebounceHandle = null;
}

function schedulePreferencesPersist(): void {
  if (preferencesPersistDebounceHandle !== null) {
    globalThis.clearTimeout(preferencesPersistDebounceHandle);
  }

  preferencesPersistDebounceHandle = globalThis.setTimeout(() => {
    preferencesPersistDebounceHandle = null;
    persistPreferencesNow();
  }, UI_PREFERENCES_PERSIST_DEBOUNCE_MS);
}

function persistPreferencesNow(): void {
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

function flushPendingPreferencePersistence(): void {
  if (preferencesPersistDebounceHandle === null) {
    return;
  }

  globalThis.clearTimeout(preferencesPersistDebounceHandle);
  preferencesPersistDebounceHandle = null;
  persistPreferencesNow();
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

function loadStoredLogOrder(): LogOrder {
  return parseLogOrder(localStorage.getItem(LOG_ORDER_STORAGE_KEY));
}

function parseOptionalLogOrder(value: unknown): LogOrder | undefined {
  return value === 'newest-first' || value === 'oldest-first' ? value : undefined;
}

function parseLogOrder(value: unknown): LogOrder {
  return value === 'oldest-first' ? 'oldest-first' : 'newest-first';
}

function renderCurrentLogLines(renderReason: string): number {
  const displayLines = getDisplayLines(renderReason);
  const completeRenderTiming = performanceMonitor.startTiming('render', 'log-lines', {
    autoScroll: state.autoScroll,
    bufferedLines: state.lines.length,
    logOrder: state.logOrder,
    paused: state.paused,
    reason: renderReason
  });
  renderLogLines(logContainerElement, displayLines, state.autoScroll, state.logOrder, state.filters.hideSourceInMessage);
  completeRenderTiming({
    displayedLines: displayLines.length
  });
  consumeVisibleResumeRender({
    displayedLines: displayLines.length,
    reason: renderReason
  });
  return displayLines.length;
}

function getDisplayLines(reason: string): LogLine[] {
  const filterCacheState = derivedLogView.filteredDirty ? 'recompute-filters' : derivedLogView.displayDirty ? 'recompute-order' : 'hit';
  const completeFilterTiming = performanceMonitor.startTiming('filter', 'get-display-lines', {
    filterCacheState,
    levelFilter: state.filters.level,
    logOrder: state.logOrder,
    queryLength: derivedLogView.preparedFilters.query.length,
    reason,
    sourceFilter: state.filters.source,
    totalLines: state.lines.length
  });

  if (derivedLogView.filteredDirty) {
    derivedLogView.filteredLines = applyPreparedLogFilters(state.lines, derivedLogView.preparedFilters);
    derivedLogView.filteredLineIds = new Set(derivedLogView.filteredLines.map((line) => line.id));
    derivedLogView.filteredDirty = false;
    derivedLogView.displayDirty = true;
  }

  if (derivedLogView.displayDirty) {
    derivedLogView.displayLines =
      state.logOrder === 'newest-first' ? [...derivedLogView.filteredLines].reverse() : derivedLogView.filteredLines;
    derivedLogView.displayDirty = false;
  }

  const displayLines = derivedLogView.displayLines;
  completeFilterTiming({
    displayedLines: displayLines.length,
    filterCacheState
  });
  return displayLines;
}

function syncDerivedLogFiltersWithState(): boolean {
  const preparedFilters = prepareLogFilters(state.filters);
  const filterKey = createPreparedLogFilterKey(preparedFilters);
  if (filterKey === derivedLogView.filterKey) {
    return false;
  }

  derivedLogView.preparedFilters = preparedFilters;
  derivedLogView.filterKey = filterKey;
  derivedLogView.filteredDirty = true;
  derivedLogView.displayDirty = true;
  return true;
}

function markDerivedLogOrderDirty(): void {
  derivedLogView.displayDirty = true;
}

function resetDerivedLogView(): void {
  derivedLogView.filteredLines = [];
  derivedLogView.filteredLineIds.clear();
  derivedLogView.displayLines = [];
  derivedLogView.filteredDirty = true;
  derivedLogView.displayDirty = true;
}

function getEffectiveClientLimit(limit: number = state.clientMaxRenderedLines): number {
  const effectiveLimit = getEffectiveClientMaxRenderedLines(limit);
  if (state.clientMaxRenderedLines !== effectiveLimit) {
    state.clientMaxRenderedLines = effectiveLimit;
  }

  return effectiveLimit;
}

function replaceBufferedLines(lines: LogLine[], preservedLines: LogLine[] = []): void {
  state.lines = [...lines, ...preservedLines].slice(-getEffectiveClientLimit());
  resetDerivedLogView();
}

function appendBufferedLine(line: LogLine): boolean {
  if (syncState.lastSeenLineId !== null && line.id <= syncState.lastSeenLineId) {
    return false;
  }

  syncState.lastSeenLineId = line.id;
  state.lines.push(line);

  let removedLines: LogLine[] = [];
  const effectiveClientLimit = getEffectiveClientLimit();
  if (state.lines.length > effectiveClientLimit) {
    removedLines = state.lines.splice(0, state.lines.length - effectiveClientLimit);
  }

  updateDerivedLogViewForBufferedLines([line], removedLines);
  return true;
}

function queueLiveLineDuringResync(line: LogLine): boolean {
  const latestQueuedOrSeenId = syncState.queuedLiveLines.at(-1)?.id ?? syncState.lastSeenLineId;
  if (latestQueuedOrSeenId !== null && latestQueuedOrSeenId !== undefined && line.id <= latestQueuedOrSeenId) {
    return false;
  }

  syncState.queuedLiveLines.push(line);
  return true;
}

function updateDerivedLogViewForBufferedLines(appendedLines: LogLine[], removedLines: LogLine[]): void {
  if (derivedLogView.filteredDirty || derivedLogView.displayDirty) {
    return;
  }

  let removedFilteredCount = 0;
  for (const removedLine of removedLines) {
    if (derivedLogView.filteredLineIds.delete(removedLine.id)) {
      removedFilteredCount += 1;
    }
  }

  if (removedFilteredCount > 0) {
    derivedLogView.filteredLines.splice(0, removedFilteredCount);
    if (state.logOrder === 'newest-first') {
      derivedLogView.displayLines.splice(Math.max(derivedLogView.displayLines.length - removedFilteredCount, 0), removedFilteredCount);
    }
  }

  const appendedFilteredLines: LogLine[] = [];
  for (const appendedLine of appendedLines) {
    if (!matchesPreparedLogFilters(appendedLine, derivedLogView.preparedFilters)) {
      continue;
    }

    derivedLogView.filteredLines.push(appendedLine);
    derivedLogView.filteredLineIds.add(appendedLine.id);
    appendedFilteredLines.push(appendedLine);
  }

  if (appendedFilteredLines.length === 0 || derivedLogView.displayLines === derivedLogView.filteredLines) {
    return;
  }

  if (state.logOrder === 'newest-first') {
    for (let index = appendedFilteredLines.length - 1; index >= 0; index -= 1) {
      derivedLogView.displayLines.unshift(appendedFilteredLines[index]);
    }
    return;
  }

  derivedLogView.displayLines.push(...appendedFilteredLines);
}

function scheduleLiveRender(update: { logLines?: number; sourceStatuses?: number }): void {
  if (update.logLines) {
    pendingLiveRender.logLines = true;
    pendingLiveRender.logLineCount += update.logLines;
  }

  if (update.sourceStatuses) {
    pendingLiveRender.sourceStatuses = true;
    pendingLiveRender.sourceStatusCount += update.sourceStatuses;
  }

  if (pendingLiveRender.frameId !== null) {
    return;
  }

  pendingLiveRender.frameId = globalThis.requestAnimationFrame(() => {
    pendingLiveRender.frameId = null;
    flushScheduledLiveRender();
  });
}

function flushScheduledLiveRender(): void {
  const shouldRenderSourceStatuses = pendingLiveRender.sourceStatuses;
  const shouldRenderLogLines = pendingLiveRender.logLines && !state.paused;
  const sourceStatusCount = pendingLiveRender.sourceStatusCount;
  const logLineCount = pendingLiveRender.logLineCount;

  pendingLiveRender.sourceStatuses = false;
  pendingLiveRender.sourceStatusCount = 0;
  pendingLiveRender.logLines = false;
  pendingLiveRender.logLineCount = 0;

  if (shouldRenderSourceStatuses) {
    const completeStatusRenderTiming = performanceMonitor.startTiming('render', 'source-statuses', {
      reason: 'sse-live-batch',
      statusCount: Object.values(state.statuses).length,
      updateCount: sourceStatusCount
    });
    renderSourceStatuses(sourceStatusListElement, Object.values(state.statuses));
    completeStatusRenderTiming({
      updateCount: sourceStatusCount
    });
  }

  if (shouldRenderLogLines) {
    renderCurrentLogLines(logLineCount > 1 ? 'sse-log-line-batch' : 'sse-log-line');
  }
}

function cancelScheduledLiveRender(): void {
  if (pendingLiveRender.frameId !== null) {
    globalThis.cancelAnimationFrame(pendingLiveRender.frameId);
    pendingLiveRender.frameId = null;
  }

  pendingLiveRender.sourceStatuses = false;
  pendingLiveRender.sourceStatusCount = 0;
  pendingLiveRender.logLines = false;
  pendingLiveRender.logLineCount = 0;
}

function isDocumentVisible(): boolean {
  return document.visibilityState === 'visible';
}

function markConnectionRenderPending(): void {
  if (isDocumentVisible()) {
    renderConnectionStatus(connectionStatusElement, state.connectionState);
    return;
  }

  hiddenTabState.connectionDirty = true;
}

function markSourceStatusRenderPending(updateCount: number): void {
  if (isDocumentVisible()) {
    scheduleLiveRender({ sourceStatuses: updateCount });
    return;
  }

  hiddenTabState.sourceStatusesDirty = true;
}

function getHiddenQueuedLineLimit(): number {
  return Math.max(1, Math.min(getSyncRequestLimit(), HIDDEN_TAB_BUFFERED_LINE_LIMIT));
}

function queueHiddenLiveLine(line: LogLine): boolean {
  const latestQueuedOrSeenId = hiddenTabState.queuedLiveLines.at(-1)?.id ?? syncState.lastSeenLineId;
  if (latestQueuedOrSeenId !== null && latestQueuedOrSeenId !== undefined && line.id <= latestQueuedOrSeenId) {
    return false;
  }

  hiddenTabState.queuedLiveLines.push(line);
  hiddenTabState.logLinesDirty = true;
  return true;
}

function markVisibilityResyncPending(reason: VisibilityCatchupReason, hiddenDurationMs: number | null): void {
  if (hiddenTabState.pendingResync) {
    return;
  }

  const hiddenQueuedLineCount = hiddenTabState.queuedLiveLines.length;
  hiddenTabState.pendingResync = true;
  hiddenTabState.queuedLiveLines = [];
  hiddenTabState.logLinesDirty = hiddenTabState.logLinesDirty || hiddenQueuedLineCount > 0;
  performanceMonitor.recordEvent('visibility', 'catchup-resync-pending', {
    hiddenDurationMs,
    hiddenQueuedLineCount,
    reason
  });
}

function handleHiddenLogLine(line: LogLine): HiddenLogLineUpdate {
  const hiddenDurationMs = hiddenSinceMs === null ? null : performance.now() - hiddenSinceMs;
  if (syncState.pendingResyncAfterOpen) {
    markVisibilityResyncPending('reconnect-pending', hiddenDurationMs);
    return {
      hiddenQueuedLineCount: hiddenTabState.queuedLiveLines.length,
      queued: false,
      resyncPending: true
    };
  }

  const queued = hiddenTabState.pendingResync ? false : queueHiddenLiveLine(line);
  if (
    hiddenDurationMs !== null &&
    (hiddenDurationMs >= VISIBILITY_RESYNC_IDLE_THRESHOLD_MS || hiddenTabState.queuedLiveLines.length >= getHiddenQueuedLineLimit())
  ) {
    markVisibilityResyncPending(
      hiddenDurationMs >= VISIBILITY_RESYNC_IDLE_THRESHOLD_MS ? 'idle-threshold' : 'queue-limit',
      hiddenDurationMs
    );
  }

  return {
    hiddenQueuedLineCount: hiddenTabState.queuedLiveLines.length,
    queued,
    resyncPending: hiddenTabState.pendingResync
  };
}

function flushHiddenQueuedLiveLines(): number {
  let flushedLineCount = 0;

  while (hiddenTabState.queuedLiveLines.length > 0) {
    const line = hiddenTabState.queuedLiveLines.shift();
    if (!line) {
      continue;
    }

    if (appendBufferedLine(line)) {
      flushedLineCount += 1;
    }
  }

  return flushedLineCount;
}

function capturePendingRenderBeforeHidden(): void {
  hiddenTabState.logLinesDirty = hiddenTabState.logLinesDirty || pendingLiveRender.logLines;
  hiddenTabState.sourceStatusesDirty = hiddenTabState.sourceStatusesDirty || pendingLiveRender.sourceStatuses;
}

function resetHiddenTabState(): void {
  hiddenTabState.connectionDirty = false;
  hiddenTabState.logLinesDirty = false;
  hiddenTabState.pendingResync = false;
  hiddenTabState.queuedLiveLines = [];
  hiddenTabState.sourceStatusesDirty = false;
}

async function resumeAfterVisibilityRestore(hiddenDurationMs: number | null): Promise<void> {
  if (hiddenTabState.pendingResync || syncState.pendingResyncAfterOpen) {
    hiddenTabState.queuedLiveLines = [];
    hiddenTabState.pendingResync = false;
    const hadConnectionUpdate = hiddenTabState.connectionDirty;
    const hadStatusUpdate = hiddenTabState.sourceStatusesDirty;
    hiddenTabState.connectionDirty = false;
    hiddenTabState.sourceStatusesDirty = false;
    hiddenTabState.logLinesDirty = false;

    if (hadConnectionUpdate) {
      renderConnectionStatus(connectionStatusElement, state.connectionState);
      consumeVisibleResumeConnection({
        connectionState: state.connectionState,
        hiddenDurationMs,
        resyncPending: true
      });
    }

    if (hadStatusUpdate) {
      renderSourceStatuses(sourceStatusListElement, Object.values(state.statuses));
      consumeVisibleResumeSse({
        event: 'source-status',
        hiddenDurationMs,
        resyncPending: true
      });
    }

    if (state.connectionState === 'connected') {
      await resyncFromServer('visibility-resume');
      return;
    }

    consumeVisibleResumeRender({
      hiddenDurationMs,
      paused: state.paused,
      reason: 'visibility-resync-deferred',
      skipped: true
    });
    return;
  }

  const hadConnectionUpdate = hiddenTabState.connectionDirty;
  const hadStatusUpdate = hiddenTabState.sourceStatusesDirty;
  const shouldRenderLogLines = hiddenTabState.logLinesDirty;
  const flushedHiddenLineCount = flushHiddenQueuedLiveLines();
  const renderReason =
    flushedHiddenLineCount > 1
      ? 'visibility-hidden-batch'
      : flushedHiddenLineCount === 1
        ? 'visibility-hidden-line'
        : 'visibility-resume';

  hiddenTabState.connectionDirty = false;
  hiddenTabState.sourceStatusesDirty = false;
  hiddenTabState.logLinesDirty = false;

  if (!state.paused && shouldRenderLogLines) {
    renderAllImmediate(renderReason);
  } else {
    if (hadConnectionUpdate) {
      renderConnectionStatus(connectionStatusElement, state.connectionState);
    }

    if (hadStatusUpdate) {
      renderSourceStatuses(sourceStatusListElement, Object.values(state.statuses));
    }

    if (shouldRenderLogLines) {
      consumeVisibleResumeRender({
        flushedHiddenLineCount,
        hiddenDurationMs,
        paused: state.paused,
        reason: state.paused ? 'visibility-hidden-paused' : renderReason,
        skipped: state.paused
      });
    }
  }

  if (hadConnectionUpdate) {
    consumeVisibleResumeConnection({
      connectionState: state.connectionState,
      hiddenDurationMs
    });
  }

  if (hadStatusUpdate) {
    consumeVisibleResumeSse({
      event: 'source-status',
      hiddenDurationMs,
      statusDirty: true
    });
  }
}

function bindVisibilityInstrumentation(): void {
  document.addEventListener('visibilitychange', () => {
    const now = performance.now();

    if (document.visibilityState === 'hidden') {
      hiddenSinceMs = now;
      capturePendingRenderBeforeHidden();
      cancelScheduledLiveRender();
      performanceMonitor.recordEvent('visibility', 'hidden', {
        bufferedLines: state.lines.length,
        connectionState: state.connectionState,
        hiddenQueuedLineCount: hiddenTabState.queuedLiveLines.length,
        pendingResyncAfterOpen: syncState.pendingResyncAfterOpen
      });
      return;
    }

    if (document.visibilityState !== 'visible') {
      performanceMonitor.recordEvent('visibility', 'state-change', {
        state: document.visibilityState
      });
      return;
    }

    const hiddenDurationMs = hiddenSinceMs === null ? null : now - hiddenSinceMs;
    hiddenSinceMs = null;
    pendingVisibleRenderSinceMs = now;
    pendingVisibleSseSinceMs = now;
    pendingVisibleConnectionSinceMs = now;
    if (hiddenDurationMs !== null && hiddenDurationMs >= VISIBILITY_RESYNC_IDLE_THRESHOLD_MS) {
      markVisibilityResyncPending('idle-threshold', hiddenDurationMs);
    }
    performanceMonitor.recordEvent('visibility', 'visible', {
      bufferedLines: state.lines.length,
      connectionState: state.connectionState,
      hiddenDurationMs,
      hiddenQueuedLineCount: hiddenTabState.queuedLiveLines.length,
      visibilityResyncPending: hiddenTabState.pendingResync || syncState.pendingResyncAfterOpen
    });
    void resumeAfterVisibilityRestore(hiddenDurationMs);
  });
}

function bindLifecycleHandlers(): void {
  window.addEventListener('pagehide', () => {
    flushPendingPreferencePersistence();
  });
}

async function resyncFromServer(reason: StreamResyncReason): Promise<void> {
  if (!syncState.pendingResyncAfterOpen && reason !== 'visibility-resume') {
    return;
  }

  if (syncState.resyncPromise) {
    return syncState.resyncPromise;
  }

  const afterId = syncState.lastSeenLineId ?? 0;
  const limit = getSyncRequestLimit();
  const completeResyncTiming = performanceMonitor.startTiming('connection', 'resync', {
    afterId,
    limit,
    reason,
    visibilityState: document.visibilityState
  });

  syncState.pendingResyncAfterOpen = false;
  const bufferGeneration = syncState.bufferGeneration;
  const clearResyncPromise = (): void => {
    if (syncState.resyncPromise === resyncPromise) {
      syncState.resyncPromise = null;
    }
  };
  const resyncPromise = (async () => {
    const response = await fetch(createResyncUrl(afterId, limit));
    if (!response.ok) {
      throw new Error(`Resync failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as ResyncResponse;
    const result =
      bufferGeneration === syncState.bufferGeneration ? applyResyncPayload(payload) : skipResyncPayloadAfterClear(payload);
    clearResyncPromise();
    const flushedLiveLineCount = flushQueuedLiveLines();
    renderResyncedState(result.renderReason ?? getQueuedLiveRenderReason(flushedLiveLineCount));

    completeResyncTiming({
      afterId,
      appendedCount: result.appendedCount + flushedLiveLineCount,
      flushedLiveLineCount,
      lastSeenLineId: syncState.lastSeenLineId,
      lineCount: payload.lines.length,
      mode: payload.mode,
      renderApplied: (!state.paused && (result.renderReason !== null || flushedLiveLineCount > 0)) || result.statusesApplied,
      requestedAfterId: payload.cursor.requestedAfterId,
      resetReason: payload.resetReason,
      truncated: payload.cursor.truncated
    });
  })()
    .catch((error: unknown) => {
      clearResyncPromise();
      const flushedLiveLineCount = flushQueuedLiveLines();
      renderResyncedState(getQueuedLiveRenderReason(flushedLiveLineCount));
      syncState.pendingResyncAfterOpen = true;
      const message = error instanceof Error ? error.message : String(error);
      performanceMonitor.recordEvent('connection', 'resync-error', {
        afterId,
        flushedLiveLineCount,
        limit,
        message,
        reason,
        visibilityState: document.visibilityState
      });
      console.warn('Failed to resync log stream.', error);
    });

  syncState.resyncPromise = resyncPromise;
  return resyncPromise;
}

function getSyncRequestLimit(): number {
  const effectiveClientLimit = getEffectiveClientLimit();
  return Math.min(
    effectiveClientLimit,
    syncState.cursor?.limit ?? syncState.serverMaxSyncLines ?? effectiveClientLimit
  );
}

function createResyncUrl(afterId: number, limit: number): string {
  const searchParams = new URLSearchParams({
    afterId: String(afterId),
    limit: String(limit)
  });

  return `/api/resync?${searchParams.toString()}`;
}

function applyResyncPayload(payload: ResyncResponse): { appendedCount: number; renderReason: string | null; statusesApplied: boolean } {
  syncState.cursor = payload.cursor;
  applySourceStatuses(payload.statuses);

  let appendedCount = 0;
  let renderReason: string | null = null;

  if (payload.mode === 'reset') {
    const preservedLiveLines = state.lines.filter((line) => line.id > (payload.cursor.lastIncludedId ?? -1));
    replaceBufferedLines(payload.lines, preservedLiveLines);
    syncState.lastSeenLineId = state.lines.at(-1)?.id ?? payload.cursor.lastIncludedId ?? syncState.lastSeenLineId;
    renderReason = 'resync-reset';
    appendedCount = Math.max(state.lines.length - payload.lines.length, 0);
  } else {
    for (const line of payload.lines) {
      if (appendBufferedLine(line)) {
        appendedCount += 1;
      }
    }

    if (appendedCount > 0) {
      renderReason = appendedCount > 1 ? 'resync-append-batch' : 'resync-append';
    }
  }

  return {
    appendedCount,
    renderReason,
    statusesApplied: payload.statuses.length > 0
  };
}

function skipResyncPayloadAfterClear(payload: ResyncResponse): { appendedCount: number; renderReason: string | null; statusesApplied: boolean } {
  applySourceStatuses(payload.statuses);
  return {
    appendedCount: 0,
    renderReason: null,
    statusesApplied: payload.statuses.length > 0
  };
}

function flushQueuedLiveLines(): number {
  let flushedLineCount = 0;

  while (syncState.queuedLiveLines.length > 0) {
    const line = syncState.queuedLiveLines.shift();
    if (!line) {
      continue;
    }

    if (appendBufferedLine(line)) {
      flushedLineCount += 1;
    }
  }

  return flushedLineCount;
}

function getQueuedLiveRenderReason(flushedLiveLineCount: number): string | null {
  if (flushedLiveLineCount === 0) {
    return null;
  }

  return flushedLiveLineCount > 1 ? 'resync-live-flush-batch' : 'resync-live-flush';
}

function renderResyncedState(renderReason: string | null): void {
  if (!state.paused && renderReason) {
    renderAllImmediate(renderReason);
    return;
  }

  renderSourceStatuses(sourceStatusListElement, Object.values(state.statuses));
}

function consumeVisibleResumeRender(details: PerformanceMetricDetails = {}): void {
  if (pendingVisibleRenderSinceMs === null) {
    return;
  }

  performanceMonitor.recordEvent('visibility', 'resume-render', {
    ...details,
    sinceVisibleMs: performance.now() - pendingVisibleRenderSinceMs
  });
  pendingVisibleRenderSinceMs = null;
}

function consumeVisibleResumeSse(details: PerformanceMetricDetails = {}): void {
  if (pendingVisibleSseSinceMs === null) {
    return;
  }

  performanceMonitor.recordEvent('visibility', 'resume-sse', {
    ...details,
    sinceVisibleMs: performance.now() - pendingVisibleSseSinceMs
  });
  pendingVisibleSseSinceMs = null;
}

function consumeVisibleResumeConnection(details: PerformanceMetricDetails = {}): void {
  if (pendingVisibleConnectionSinceMs === null) {
    return;
  }

  performanceMonitor.recordEvent('visibility', 'resume-connection', {
    ...details,
    sinceVisibleMs: performance.now() - pendingVisibleConnectionSinceMs
  });
  pendingVisibleConnectionSinceMs = null;
}

interface StoredUiPreferences {
  filters: FiltersState;
  theme: Theme;
  logOrder: LogOrder;
  autoScroll: ClientState['autoScroll'];
  paused: ClientState['paused'];
}

interface PendingLiveRenderState {
  frameId: ReturnType<typeof globalThis.requestAnimationFrame> | null;
  logLines: boolean;
  logLineCount: number;
  sourceStatuses: boolean;
  sourceStatusCount: number;
}

interface ClientSyncState {
  cursor: SyncCursor | null;
  serverMaxSyncLines: number | null;
  lastSeenLineId: number | null;
  pendingResyncAfterOpen: boolean;
  bufferGeneration: number;
  queuedLiveLines: LogLine[];
  resyncPromise: Promise<void> | null;
}

type StreamResyncReason = 'initial-open' | 'reconnect' | 'visibility-resume';

type VisibilityCatchupReason = 'idle-threshold' | 'queue-limit' | 'reconnect-pending';

interface HiddenLogLineUpdate {
  hiddenQueuedLineCount: number;
  queued: boolean;
  resyncPending: boolean;
}

interface HiddenTabState {
  connectionDirty: boolean;
  logLinesDirty: boolean;
  pendingResync: boolean;
  queuedLiveLines: LogLine[];
  sourceStatusesDirty: boolean;
}

interface DerivedLogViewState {
  preparedFilters: PreparedLogFilters;
  filterKey: string;
  filteredLines: LogLine[];
  filteredLineIds: Set<number>;
  displayLines: LogLine[];
  filteredDirty: boolean;
  displayDirty: boolean;
}

function createDerivedLogViewState(): DerivedLogViewState {
  const preparedFilters = prepareLogFilters(state.filters);

  return {
    preparedFilters,
    filterKey: createPreparedLogFilterKey(preparedFilters),
    filteredLines: [],
    filteredLineIds: new Set<number>(),
    displayLines: [],
    filteredDirty: true,
    displayDirty: true
  };
}
