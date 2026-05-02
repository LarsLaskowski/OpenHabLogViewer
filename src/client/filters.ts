import { ClientState, LogLine } from './state.js';

export function applyFilters(lines: LogLine[], filters: ClientState['filters']): LogLine[] {
  const query = filters.query.trim().toLowerCase();

  return lines.filter((line) => {
    if (filters.source !== 'all' && line.source !== filters.source) {
      return false;
    }

    if (filters.level !== 'all' && line.level !== filters.level) {
      return false;
    }

    if (query && !line.rawLine.toLowerCase().includes(query)) {
      return false;
    }

    return true;
  });
}
