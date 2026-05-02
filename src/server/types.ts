export const LOG_LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];
export type LogSource = 'events' | 'openhab';
export type SourceState = 'idle' | 'watching' | 'missing' | 'permission-denied' | 'rotated' | 'error';

export interface SourceConfig {
  source: LogSource;
  fileName: string;
  filePath: string;
}

export interface AppConfig {
  port: number;
  initialLinesPerFile: number;
  maxBufferedLines: number;
  clientMaxRenderedLines: number;
  sources: SourceConfig[];
}

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

export type LogLineDraft = Omit<LogLine, 'id'>;

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
