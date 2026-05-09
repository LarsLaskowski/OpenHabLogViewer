import path from 'node:path';
import { AppConfig, LogSource, SourceConfig } from './types.js';

function parsePositiveInteger(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

function resolveSourceConfig(
  source: LogSource,
  explicitPath: string | undefined,
  logDir: string,
  fallbackFileName: string
): SourceConfig {
  const filePath = explicitPath?.trim() || path.join(logDir, fallbackFileName);

  return {
    source,
    fileName: path.basename(filePath),
    filePath
  };
}

export function loadConfig(): AppConfig {
  const logDir = process.env.OPENHAB_LOG_DIR?.trim() || '/var/log/openhab';

  return {
    port: parsePositiveInteger('PORT', 9001),
    initialLinesPerFile: parsePositiveInteger('INITIAL_LINES_PER_FILE', 500),
    maxBufferedLines: parsePositiveInteger('MAX_BUFFERED_LINES', 2_000),
    clientMaxRenderedLines: parsePositiveInteger('CLIENT_MAX_RENDERED_LINES', 500),
    sources: [
      resolveSourceConfig('events', process.env.EVENTS_LOG_PATH, logDir, 'events.log'),
      resolveSourceConfig('openhab', process.env.OPENHAB_LOG_PATH, logDir, 'openhab.log')
    ]
  };
}
