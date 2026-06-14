import {
  applyPreparedLogFilters,
  createPreparedLogFilterKey,
  matchesPreparedLogFilters,
  prepareLogFilters,
  PreparedLogFilters
} from './filters.js';
import { ClientState, LogLine, LogOrder } from './state.js';

export type FilterCacheState = 'hit' | 'recompute-filters' | 'recompute-order';

// Maintains the filtered + ordered view of the buffered log lines. It recomputes
// lazily (only when the filters or order change) and updates incrementally as
// lines are appended or evicted, so a live update touches only the delta.
// Extracted from main.ts so this DOM-free logic can be unit-tested in isolation.
export class DerivedLogView {
  private preparedFilters: PreparedLogFilters;
  private filterKey: string;
  private filteredLines: LogLine[] = [];
  private filteredLineIds = new Set<number>();
  private displayLines: LogLine[] = [];
  private filteredDirty = true;
  private displayDirty = true;

  constructor(filters: ClientState['filters']) {
    this.preparedFilters = prepareLogFilters(filters);
    this.filterKey = createPreparedLogFilterKey(this.preparedFilters);
  }

  get queryLength(): number {
    return this.preparedFilters.query.length;
  }

  // The work the next getDisplayLines call would do, exposed for instrumentation
  // without forcing the recompute.
  cacheState(): FilterCacheState {
    if (this.filteredDirty) {
      return 'recompute-filters';
    }
    if (this.displayDirty) {
      return 'recompute-order';
    }
    return 'hit';
  }

  // Returns true when the filter set actually changed (and the view was invalidated).
  setFilters(filters: ClientState['filters']): boolean {
    const preparedFilters = prepareLogFilters(filters);
    const filterKey = createPreparedLogFilterKey(preparedFilters);
    if (filterKey === this.filterKey) {
      return false;
    }

    this.preparedFilters = preparedFilters;
    this.filterKey = filterKey;
    this.filteredDirty = true;
    this.displayDirty = true;
    return true;
  }

  markOrderDirty(): void {
    this.displayDirty = true;
  }

  reset(): void {
    this.filteredLines = [];
    this.filteredLineIds.clear();
    this.displayLines = [];
    this.filteredDirty = true;
    this.displayDirty = true;
  }

  getDisplayLines(allLines: LogLine[], logOrder: LogOrder): LogLine[] {
    if (this.filteredDirty) {
      this.filteredLines = applyPreparedLogFilters(allLines, this.preparedFilters);
      this.filteredLineIds = new Set(this.filteredLines.map((line) => line.id));
      this.filteredDirty = false;
      this.displayDirty = true;
    }

    if (this.displayDirty) {
      this.displayLines =
        logOrder === 'newest-first' ? [...this.filteredLines].reverse() : this.filteredLines;
      this.displayDirty = false;
    }

    return this.displayLines;
  }

  applyBufferedDelta(appendedLines: LogLine[], removedLines: LogLine[], logOrder: LogOrder): void {
    if (this.filteredDirty || this.displayDirty) {
      return;
    }

    let removedFilteredCount = 0;
    for (const removedLine of removedLines) {
      if (this.filteredLineIds.delete(removedLine.id)) {
        removedFilteredCount += 1;
      }
    }

    if (removedFilteredCount > 0) {
      this.filteredLines.splice(0, removedFilteredCount);
      if (logOrder === 'newest-first') {
        this.displayLines.splice(Math.max(this.displayLines.length - removedFilteredCount, 0), removedFilteredCount);
      }
    }

    const appendedFilteredLines: LogLine[] = [];
    for (const appendedLine of appendedLines) {
      if (!matchesPreparedLogFilters(appendedLine, this.preparedFilters)) {
        continue;
      }

      this.filteredLines.push(appendedLine);
      this.filteredLineIds.add(appendedLine.id);
      appendedFilteredLines.push(appendedLine);
    }

    if (appendedFilteredLines.length === 0 || this.displayLines === this.filteredLines) {
      return;
    }

    if (logOrder === 'newest-first') {
      for (let index = appendedFilteredLines.length - 1; index >= 0; index -= 1) {
        this.displayLines.unshift(appendedFilteredLines[index]);
      }
      return;
    }

    this.displayLines.push(...appendedFilteredLines);
  }
}
