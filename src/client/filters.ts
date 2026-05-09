import { ClientState, LogLine } from './state.js';

export interface PreparedLogFilters {
  source: ClientState['filters']['source'];
  level: ClientState['filters']['level'];
  query: string;
}

const normalizedSearchTextCache = new WeakMap<LogLine, string>();

export function prepareLogFilters(filters: ClientState['filters']): PreparedLogFilters {
  return {
    source: filters.source,
    level: filters.level,
    query: filters.query.trim().toLowerCase()
  };
}

export function createPreparedLogFilterKey(filters: PreparedLogFilters): string {
  return `${filters.source}|${filters.level}|${filters.query}`;
}

export function applyPreparedLogFilters(lines: LogLine[], filters: PreparedLogFilters): LogLine[] {
  return lines.filter((line) => matchesPreparedLogFilters(line, filters));
}

export function matchesPreparedLogFilters(line: LogLine, filters: PreparedLogFilters): boolean {
  if (filters.source !== 'all' && line.source !== filters.source) {
    return false;
  }

  if (filters.level !== 'all' && line.level !== filters.level) {
    return false;
  }

  if (filters.query && !getNormalizedSearchText(line).includes(filters.query)) {
    return false;
  }

  return true;
}

function getNormalizedSearchText(line: LogLine): string {
  const cachedValue = normalizedSearchTextCache.get(line);
  if (cachedValue !== undefined) {
    return cachedValue;
  }

  const normalizedValue = line.rawLine.toLowerCase();
  normalizedSearchTextCache.set(line, normalizedValue);
  return normalizedValue;
}
