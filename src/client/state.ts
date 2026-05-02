export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type LogSource = 'events' | 'openhab';
export type SourceState = 'idle' | 'watching' | 'missing' | 'permission-denied' | 'rotated' | 'error';
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting';
export type Theme = 'light' | 'dark';
export type LogOrder = 'newest-first' | 'oldest-first';

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

export interface BootstrapResponse {
  lines: LogLine[];
  statuses: SourceStatus[];
  config: {
    clientMaxRenderedLines: number;
    initialLinesPerFile: number;
  };
}

export interface FiltersState {
  source: 'all' | LogSource;
  level: 'all' | LogLevel;
  query: string;
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
      query: ''
    },
    paused: false,
    autoScroll: true,
    clientMaxRenderedLines: 1500,
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
