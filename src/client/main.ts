import { createClientPerformanceMonitor } from './performance.js';
import { renderConnectionStatus, renderLogLines, renderSourceStatuses } from './render.js';
import { DerivedLogView } from './derivedLogView.js';
import {
  loadStoredPreferences,
  parseLogOrder,
  parseTheme,
  persistStoredPreferences,
  StoredUiPreferences
} from './preferences.js';
import {
  BootstrapResponse,
  getEffectiveClientMaxRenderedLines,
  LogLine,
  ResyncResponse,
  SourceStatus,
  SyncCursor,
  Theme,
  createInitialState
} from './state.js';
import type { CompleteClientTiming, PerformanceMetricDetails } from './performance.js';

const state = createInitialState();
const SEARCH_INPUT_DEBOUNCE_MS = 150;
const UI_PREFERENCES_PERSIST_DEBOUNCE_MS = 250;
const VISIBILITY_RESYNC_IDLE_THRESHOLD_MS = 30_000;
const HIDDEN_TAB_BUFFERED_LINE_LIMIT = 250;
const performanceMonitor = createClientPerformanceMonitor();

const connectionStatusElement = getRequiredElement('connection-status');
const controlsElement = getRequiredElement('controls-panel');
const sourceStatusListElement = getRequiredElement('source-status-list');
const logContainerElement = getRequiredElement('log-container');
const sourceFilterElement = getRequiredTypedElement('source-filter', HTMLSelectElement);
const levelFilterElement = getRequiredTypedElement('level-filter', HTMLSelectElement);
const textFilterElement = getRequiredTypedElement('text-filter', HTMLInputElement);
const themeSelectElement = getRequiredTypedElement('theme-select', HTMLSelectElement);
const orderSelectElement = getRequiredTypedElement('order-select', HTMLSelectElement);
const autoScrollElement = getRequiredTypedElement('auto-scroll', HTMLInputElement);
const pauseToggleElement = getRequiredTypedElement('pause-toggle', HTMLInputElement);
const hideSourceToggleElement = getRequiredTypedElement('hide-source-toggle', HTMLInputElement);
const clearButtonElement = getRequiredTypedElement('clear-button', HTMLButtonElement);
const faviconElement = getRequiredTypedElement('app-favicon', HTMLLinkElement);
const brandImageElement = getRequiredTypedElement('app-brand-image', HTMLImageElement);
let initialStreamOpenTiming: CompleteClientTiming | null = null;
let reconnectTiming: CompleteClientTiming | null = null;
let hasSeenStreamOpen = false;
// Stale-connection watchdog: the server emits a heartbeat every 15 s, so if no
// event (heartbeat or data) arrives within ~2x that window the connection is
// treated as half-open and force-reconnected. EventSource only fires `error`
// on a closed socket, not on a silently stalled one.
const HEARTBEAT_WATCHDOG_MS = 35_000;
let activeStream: EventSource | null = null;
let heartbeatWatchdogHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
let hiddenSinceMs: number | null = document.visibilityState === 'hidden' ? performance.now() : null;
let pendingVisibleRenderSinceMs: number | null = null;
let pendingVisibleSseSinceMs: number | null = null;
let pendingVisibleConnectionSinceMs: number | null = null;
let searchInputDebounceHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
let preferencesPersistDebounceHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
const BOOTSTRAP_RETRY_BASE_MS = 1_000;
const BOOTSTRAP_RETRY_MAX_MS = 30_000;
let bootstrapRetryHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
let bootstrapRetryAttempt = 0;
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
const derivedLogView = new DerivedLogView(state.filters);

// Start the app. Kept out of module scope so importing main.ts (e.g. from tests)
// has no bootstrap/SSE side effects; the browser entry point calls this.
export function init(): void {
  bindVisibilityInstrumentation();
  bindLifecycleHandlers();
  void bootstrap();
}

async function bootstrap(): Promise<void> {
  const completeBootstrapTiming = performanceMonitor.startTiming('bootstrap', 'bootstrap-total');
  const completePreferencesTiming = performanceMonitor.startTiming('bootstrap', 'apply-preferences');
  applyStoredPreferences(loadStoredPreferences(localStorage));
  derivedLogView.setFilters(state.filters);
  applyTheme(state.theme);
  syncControlsFromState();
  renderConnectionStatus(connectionStatusElement, state.connectionState);
  completePreferencesTiming({
    autoScroll: state.autoScroll,
    paused: state.paused,
    theme: state.theme,
    logOrder: state.logOrder
  });

  // Bind controls up front so the UI stays interactive even if the initial
  // data load fails and has to retry. This runs exactly once.
  const completeBindTiming = performanceMonitor.startTiming('bootstrap', 'bind-controls');
  bindControls();
  completeBindTiming();

  await loadInitialData(completeBootstrapTiming);
}

async function loadInitialData(completeBootstrapTiming: CompleteClientTiming): Promise<void> {
  let payload: BootstrapResponse;
  try {
    payload = await fetchBootstrapPayload();
  } catch (error) {
    scheduleBootstrapRetry(completeBootstrapTiming, error);
    return;
  }

  bootstrapRetryAttempt = 0;
  if (state.connectionState === 'error') {
    state.connectionState = 'connecting';
  }

  const completeHydrationTiming = performanceMonitor.startTiming('bootstrap', 'hydrate-state');
  applyBootstrapPayload(payload);
  completeHydrationTiming({
    bufferedLines: state.lines.length,
    clientMaxRenderedLines: state.clientMaxRenderedLines,
    serverMaxSyncLines: syncState.serverMaxSyncLines,
    truncated: payload.cursor.truncated
  });

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

async function fetchBootstrapPayload(): Promise<BootstrapResponse> {
  const completeFetchTiming = performanceMonitor.startTiming('bootstrap', 'fetch-bootstrap');
  const response = await fetch('/api/bootstrap');
  completeFetchTiming({
    ok: response.ok,
    status: response.status
  });
  if (!response.ok) {
    throw new Error(`Bootstrap request failed with status ${response.status}`);
  }

  const completeParseTiming = performanceMonitor.startTiming('bootstrap', 'parse-bootstrap-payload');
  const payload = (await response.json()) as BootstrapResponse;
  completeParseTiming({
    lineCount: payload.lines.length,
    statusCount: payload.statuses.length
  });
  return payload;
}

function scheduleBootstrapRetry(completeBootstrapTiming: CompleteClientTiming, error: unknown): void {
  state.connectionState = 'error';
  renderConnectionStatus(connectionStatusElement, state.connectionState);

  const delayMs = Math.min(BOOTSTRAP_RETRY_BASE_MS * 2 ** bootstrapRetryAttempt, BOOTSTRAP_RETRY_MAX_MS);
  bootstrapRetryAttempt += 1;
  console.warn(`[bootstrap] Initial data load failed; retrying in ${delayMs} ms.`, error);
  performanceMonitor.recordEvent('bootstrap', 'retry-scheduled', {
    attempt: bootstrapRetryAttempt,
    delayMs
  });

  if (bootstrapRetryHandle !== null) {
    globalThis.clearTimeout(bootstrapRetryHandle);
  }
  bootstrapRetryHandle = globalThis.setTimeout(() => {
    bootstrapRetryHandle = null;
    state.connectionState = 'connecting';
    renderConnectionStatus(connectionStatusElement, state.connectionState);
    void loadInitialData(completeBootstrapTiming);
  }, delayMs);
}

function bindControls(): void {
  sourceFilterElement.addEventListener('change', () => {
    state.filters.source = sourceFilterElement.value as typeof state.filters.source;
    schedulePreferencesPersist();
    performanceMonitor.recordEvent('filter', 'source-change', {
      source: state.filters.source
    });
    if (derivedLogView.setFilters(state.filters)) {
      renderAllImmediate('source-filter-change');
    }
  });

  levelFilterElement.addEventListener('change', () => {
    state.filters.level = levelFilterElement.value as typeof state.filters.level;
    schedulePreferencesPersist();
    performanceMonitor.recordEvent('filter', 'level-change', {
      level: state.filters.level
    });
    if (derivedLogView.setFilters(state.filters)) {
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
    derivedLogView.markOrderDirty();
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
    derivedLogView.reset();
    performanceMonitor.recordEvent('render', 'clear-buffer');
    renderAllImmediate('clear-buffer');
  });
}

function noteStreamActivity(): void {
  if (heartbeatWatchdogHandle !== null) {
    globalThis.clearTimeout(heartbeatWatchdogHandle);
  }
  heartbeatWatchdogHandle = globalThis.setTimeout(handleStaleConnection, HEARTBEAT_WATCHDOG_MS);
}

function clearHeartbeatWatchdog(): void {
  if (heartbeatWatchdogHandle !== null) {
    globalThis.clearTimeout(heartbeatWatchdogHandle);
    heartbeatWatchdogHandle = null;
  }
}

function closeActiveStream(): void {
  clearHeartbeatWatchdog();
  if (activeStream) {
    activeStream.close();
    activeStream = null;
  }
}

function handleStaleConnection(): void {
  performanceMonitor.recordEvent('connection', 'heartbeat-timeout', {
    visibilityState: document.visibilityState
  });
  if (hasSeenStreamOpen && reconnectTiming === null) {
    reconnectTiming = performanceMonitor.startTiming('connection', 'reconnect', {
      visibilityState: document.visibilityState
    });
  }
  state.connectionState = 'reconnecting';
  syncState.pendingResyncAfterOpen = true;
  markConnectionRenderPending();
  // connectStream() closes the stalled EventSource before opening a fresh one.
  connectStream();
}

function connectStream(): void {
  closeActiveStream();
  performanceMonitor.recordEvent('connection', 'stream-created', {
    visibilityState: document.visibilityState
  });
  const stream = new EventSource('/api/stream');
  activeStream = stream;

  stream.addEventListener('open', () => {
    const wasReconnecting = state.connectionState === 'reconnecting';
    const shouldResync = syncState.pendingResyncAfterOpen;
    state.connectionState = 'connected';
    noteStreamActivity();
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
    // The socket is closed; EventSource auto-reconnects on its own, so pause the
    // watchdog until the next `open` restarts it.
    clearHeartbeatWatchdog();
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

  stream.addEventListener('heartbeat', () => {
    noteStreamActivity();
  });

  stream.addEventListener('source-status', (event) => {
    noteStreamActivity();
    let status: SourceStatus;
    try {
      status = JSON.parse((event as MessageEvent<string>).data) as SourceStatus;
    } catch (error) {
      console.warn('Ignoring malformed source-status SSE payload.', error);
      return;
    }
    const completeSseTiming = performanceMonitor.startTiming('sse', 'source-status', {
      visibilityState: document.visibilityState
    });
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
    noteStreamActivity();
    let line: LogLine;
    try {
      line = JSON.parse((event as MessageEvent<string>).data) as LogLine;
    } catch (error) {
      console.warn('Ignoring malformed log-line SSE payload.', error);
      return;
    }
    const completeSseTiming = performanceMonitor.startTiming('sse', 'log-line', {
      bufferedBefore: state.lines.length,
      paused: state.paused,
      visibilityState: document.visibilityState
    });
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

function getRequiredTypedElement<T extends HTMLElement>(id: string, elementType: new () => T): T {
  const element = getRequiredElement(id);
  if (!(element instanceof elementType)) {
    throw new TypeError(`Expected ${elementType.name} element: ${id}`);
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
    const filterKeyChanged = derivedLogView.setFilters(state.filters);
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
  persistStoredPreferences(
    {
      filters: state.filters,
      theme: state.theme,
      logOrder: state.logOrder,
      autoScroll: state.autoScroll,
      paused: state.paused
    },
    localStorage
  );
}

function flushPendingPreferencePersistence(): void {
  if (preferencesPersistDebounceHandle === null) {
    return;
  }

  globalThis.clearTimeout(preferencesPersistDebounceHandle);
  preferencesPersistDebounceHandle = null;
  persistPreferencesNow();
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  faviconElement.href = theme === 'dark' ? './assets/openHAB_darkBG_appicon.svg' : './assets/openHAB_appicon.svg';
  brandImageElement.src = theme === 'dark' ? './assets/openHAB_workswith_darkBG.svg' : './assets/openHAB_workswith.svg';
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
  const filterCacheState = derivedLogView.cacheState();
  const completeFilterTiming = performanceMonitor.startTiming('filter', 'get-display-lines', {
    filterCacheState,
    levelFilter: state.filters.level,
    logOrder: state.logOrder,
    queryLength: derivedLogView.queryLength,
    reason,
    sourceFilter: state.filters.source,
    totalLines: state.lines.length
  });

  const displayLines = derivedLogView.getDisplayLines(state.lines, state.logOrder);
  completeFilterTiming({
    displayedLines: displayLines.length,
    filterCacheState
  });
  return displayLines;
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
  derivedLogView.reset();
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

  derivedLogView.applyBufferedDelta([line], removedLines, state.logOrder);
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
    await resumeWithResync(hiddenDurationMs);
    return;
  }
  resumeFromNormalHide(hiddenDurationMs);
}

async function resumeWithResync(hiddenDurationMs: number | null): Promise<void> {
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
}

function resolveHiddenRenderReason(flushedHiddenLineCount: number): string {
  if (flushedHiddenLineCount > 1) {
    return 'visibility-hidden-batch';
  }
  if (flushedHiddenLineCount === 1) {
    return 'visibility-hidden-line';
  }
  return 'visibility-resume';
}

function renderPausedVisibilityUpdates(
  hadConnectionUpdate: boolean,
  hadStatusUpdate: boolean,
  shouldRenderLogLines: boolean,
  flushedHiddenLineCount: number,
  hiddenDurationMs: number | null,
  renderReason: string
): void {
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

function resumeFromNormalHide(hiddenDurationMs: number | null): void {
  const hadConnectionUpdate = hiddenTabState.connectionDirty;
  const hadStatusUpdate = hiddenTabState.sourceStatusesDirty;
  const shouldRenderLogLines = hiddenTabState.logLinesDirty;
  const flushedHiddenLineCount = flushHiddenQueuedLiveLines();
  const renderReason = resolveHiddenRenderReason(flushedHiddenLineCount);

  hiddenTabState.connectionDirty = false;
  hiddenTabState.sourceStatusesDirty = false;
  hiddenTabState.logLinesDirty = false;

  if (!state.paused && shouldRenderLogLines) {
    renderAllImmediate(renderReason);
  } else {
    renderPausedVisibilityUpdates(hadConnectionUpdate, hadStatusUpdate, shouldRenderLogLines, flushedHiddenLineCount, hiddenDurationMs, renderReason);
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
