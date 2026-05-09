export type PerformanceCategory = 'bootstrap' | 'connection' | 'filter' | 'render' | 'sse' | 'visibility';
export type PerformanceMetricValue = string | number | boolean | null;
export type PerformanceMetricDetails = Record<string, PerformanceMetricValue | undefined>;
export type CompleteClientTiming = (details?: PerformanceMetricDetails) => void;

export interface ClientPerformanceEntry {
  category: PerformanceCategory;
  name: string;
  recordedAt: string;
  durationMs: number | null;
  details: Record<string, PerformanceMetricValue>;
}

export interface ClientPerformanceSummary {
  count: number;
  timedCount: number;
  averageDurationMs: number | null;
  maxDurationMs: number | null;
  lastDurationMs: number | null;
}

export interface ClientPerformanceSnapshot {
  recent: ClientPerformanceEntry[];
  summaries: Record<string, ClientPerformanceSummary>;
}

export interface ClientPerformanceMonitor {
  readonly enabled: boolean;
  startTiming(category: PerformanceCategory, name: string, details?: PerformanceMetricDetails): CompleteClientTiming;
  recordEvent(category: PerformanceCategory, name: string, details?: PerformanceMetricDetails): void;
  snapshot(): ClientPerformanceSnapshot;
  clear(): void;
}

declare global {
  interface Window {
    __openhabPerf?: {
      clear: () => void;
      snapshot: () => ClientPerformanceSnapshot;
    };
  }
}

interface SummaryAccumulator {
  count: number;
  timedCount: number;
  totalDurationMs: number;
  maxDurationMs: number | null;
  lastDurationMs: number | null;
}

const ENABLE_STORAGE_KEY = 'openhab-log-viewer.perf';
const MAX_RECENT_ENTRIES = 250;
const NOOP_COMPLETE_TIMING: CompleteClientTiming = () => undefined;
const LOG_THRESHOLD_MS: Record<PerformanceCategory, number> = {
  bootstrap: 0,
  connection: 0,
  filter: 4,
  render: 8,
  sse: 8,
  visibility: 0
};

export function createClientPerformanceMonitor(): ClientPerformanceMonitor {
  if (!isPerformanceMonitoringEnabled()) {
    return {
      enabled: false,
      startTiming: () => NOOP_COMPLETE_TIMING,
      recordEvent: () => undefined,
      snapshot: () => ({ recent: [], summaries: {} }),
      clear: () => undefined
    };
  }

  const recentEntries: ClientPerformanceEntry[] = [];
  const summaries = new Map<string, SummaryAccumulator>();

  const monitor: ClientPerformanceMonitor = {
    enabled: true,
    startTiming(category, name, details = {}) {
      const startedAt = performance.now();
      const baseDetails = sanitizeDetails(details);
      let completed = false;

      return (extraDetails = {}) => {
        if (completed) {
          return;
        }

        completed = true;
        recordEntry({
          category,
          name,
          recordedAt: new Date().toISOString(),
          durationMs: roundDuration(performance.now() - startedAt),
          details: {
            ...baseDetails,
            ...sanitizeDetails(extraDetails)
          }
        });
      };
    },
    recordEvent(category, name, details = {}) {
      recordEntry({
        category,
        name,
        recordedAt: new Date().toISOString(),
        durationMs: null,
        details: sanitizeDetails(details)
      });
    },
    snapshot() {
      return {
        recent: recentEntries.map((entry) => ({
          ...entry,
          details: { ...entry.details }
        })),
        summaries: Object.fromEntries(
          Array.from(summaries.entries(), ([key, summary]) => [
            key,
            {
              count: summary.count,
              timedCount: summary.timedCount,
              averageDurationMs: summary.timedCount > 0 ? roundDuration(summary.totalDurationMs / summary.timedCount) : null,
              maxDurationMs: summary.maxDurationMs === null ? null : roundDuration(summary.maxDurationMs),
              lastDurationMs: summary.lastDurationMs === null ? null : roundDuration(summary.lastDurationMs)
            }
          ])
        )
      };
    },
    clear() {
      recentEntries.length = 0;
      summaries.clear();
      console.info('[perf] Cleared client performance history.');
    }
  };

  window.__openhabPerf = {
    clear: monitor.clear,
    snapshot: monitor.snapshot
  };

  console.info(
    '[perf] Client performance instrumentation enabled. Use window.__openhabPerf.snapshot() and window.__openhabPerf.clear().'
  );

  return monitor;

  function recordEntry(entry: ClientPerformanceEntry): void {
    recentEntries.push(entry);
    if (recentEntries.length > MAX_RECENT_ENTRIES) {
      recentEntries.splice(0, recentEntries.length - MAX_RECENT_ENTRIES);
    }

    const metricKey = `${entry.category}:${entry.name}`;
    const summary = summaries.get(metricKey) ?? {
      count: 0,
      timedCount: 0,
      totalDurationMs: 0,
      maxDurationMs: null,
      lastDurationMs: null
    };

    summary.count += 1;
    if (entry.durationMs !== null) {
      summary.timedCount += 1;
      summary.totalDurationMs += entry.durationMs;
      summary.maxDurationMs = summary.maxDurationMs === null ? entry.durationMs : Math.max(summary.maxDurationMs, entry.durationMs);
      summary.lastDurationMs = entry.durationMs;
    }
    summaries.set(metricKey, summary);

    if (!shouldLogEntry(entry)) {
      return;
    }

    if (entry.durationMs === null) {
      console.info(`[perf] ${entry.category}:${entry.name}`, entry.details);
      return;
    }

    console.info(`[perf] ${entry.category}:${entry.name} ${entry.durationMs.toFixed(2)} ms`, entry.details);
  }
}

function isPerformanceMonitoringEnabled(): boolean {
  const searchValue = new URLSearchParams(window.location.search).get('perf');
  if (searchValue !== null) {
    return parseBooleanFlag(searchValue);
  }

  try {
    return parseBooleanFlag(window.localStorage.getItem(ENABLE_STORAGE_KEY));
  } catch {
    return false;
  }
}

function parseBooleanFlag(value: string | null): boolean {
  if (value === null) {
    return false;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue === '1' || normalizedValue === 'true' || normalizedValue === 'on' || normalizedValue === 'yes';
}

function sanitizeDetails(details: PerformanceMetricDetails): Record<string, PerformanceMetricValue> {
  return Object.fromEntries(
    Object.entries(details)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, typeof value === 'number' ? roundDuration(value) : value ?? null])
  );
}

function shouldLogEntry(entry: ClientPerformanceEntry): boolean {
  if (entry.durationMs === null) {
    return entry.category === 'connection' || entry.category === 'visibility';
  }

  return entry.durationMs >= LOG_THRESHOLD_MS[entry.category];
}

function roundDuration(value: number): number {
  return Number(value.toFixed(2));
}
