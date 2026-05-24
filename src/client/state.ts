export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type LogSource = 'events' | 'openhab';
export type SourceState = 'idle' | 'watching' | 'missing' | 'permission-denied' | 'rotated' | 'error';
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting';
export type Theme = 'light' | 'dark';
export type LogOrder = 'newest-first' | 'oldest-first';
export const CLIENT_MAX_RENDERED_LINES_CAP = 500;

export interface LogLine {
  id: number;
  source: LogSource;
  fileName: string;
  rawLine: string;
  receivedAt: string;
  isTimestamped: boolean;
  timestamp: string | null;
  level: LogLevel | null;
  logger: string | null;
  message: string;
  isContinuation: boolean;
  groupId: string | null;
}

export interface SourceStatus {
  source: LogSource;
  fileName: string;
  filePath: string;
  state: SourceState;
  message: string;
  updatedAt: string;
}

export interface SyncCursor {
  oldestAvailableId: number | null;
  newestAvailableId: number | null;
  lastIncludedId: number | null;
  limit: number;
  totalBufferedLines: number;
  truncated: boolean;
}

export type ResyncMode = 'append' | 'reset';
export type ResyncResetReason = 'cursor-not-available' | 'limit-exceeded' | null;

export interface BootstrapResponse {
  lines: LogLine[];
  statuses: SourceStatus[];
  config: {
    clientMaxRenderedLines: number;
    initialLinesPerFile: number;
    serverMaxSyncLines: number;
  };
  cursor: SyncCursor;
}

export interface ResyncResponse {
  lines: LogLine[];
  statuses: SourceStatus[];
  mode: ResyncMode;
  resetReason: ResyncResetReason;
  cursor: SyncCursor & {
    requestedAfterId: number;
  };
}

export interface FiltersState {
  source: 'all' | LogSource;
  level: 'all' | LogLevel;
  query: string;
  hideSourceInMessage: boolean;
}

export interface ClientState {
  lines: LogLine[];
  statuses: Record<LogSource, SourceStatus>;
  connectionState: ConnectionState;
  filters: FiltersState;
  paused: boolean;
  autoScroll: boolean;
  clientMaxRenderedLines: number;
  theme: Theme;
  logOrder: LogOrder;
}

export function getEffectiveClientMaxRenderedLines(limit: number): number {
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, CLIENT_MAX_RENDERED_LINES_CAP) : CLIENT_MAX_RENDERED_LINES_CAP;
}

export function createInitialState(): ClientState {
  return {
    lines: [],
    statuses: {
      events: createPlaceholderStatus('events', 'events.log'),
      openhab: createPlaceholderStatus('openhab', 'openhab.log')
    },
    connectionState: 'connecting',
    filters: {
      source: 'all',
      level: 'all',
      query: '',
      hideSourceInMessage: true
    },
    paused: false,
    autoScroll: true,
    clientMaxRenderedLines: getEffectiveClientMaxRenderedLines(CLIENT_MAX_RENDERED_LINES_CAP),
    theme: 'light',
    logOrder: 'newest-first'
  };
}

function createPlaceholderStatus(source: LogSource, fileName: string): SourceStatus {
  return {
    source,
    fileName,
    filePath: '',
    state: 'idle',
    message: `Waiting for ${fileName}`,
    updatedAt: new Date().toISOString()
  };
}
