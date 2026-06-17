import { LogLine, LogLineDraft } from './types.js';

export interface LogBufferRange {
  oldestId: number | null;
  newestId: number | null;
  totalLines: number;
}

/**
 * Fixed-capacity ring buffer for recent log lines.
 *
 * Insertion and eviction are O(1): once the buffer is full, the oldest slot is
 * overwritten in place and the head index advances instead of shifting the
 * whole backing array (the previous `splice(0, overflow)` was O(n) per push).
 * The backing array grows lazily until capacity is reached, so memory stays
 * proportional to the number of lines actually buffered.
 */
export class LogBuffer {
  private readonly storage: LogLine[] = [];
  private head = 0;
  private size = 0;
  private nextId = 1;

  constructor(private readonly maxBufferedLines: number) {}

  push(draft: LogLineDraft): LogLine {
    const line: LogLine = {
      ...draft,
      id: this.nextId++
    };

    if (this.maxBufferedLines <= 0) {
      return line;
    }

    if (this.size < this.maxBufferedLines) {
      // Still filling: the backing array grows by one each push (head stays 0).
      this.storage[(this.head + this.size) % this.maxBufferedLines] = line;
      this.size += 1;
    } else {
      // Full: overwrite the oldest slot and advance the head past it.
      this.storage[this.head] = line;
      this.head = (this.head + 1) % this.maxBufferedLines;
    }

    return line;
  }

  getItems(limit = this.maxBufferedLines): LogLine[] {
    const count = limit <= 0 ? this.size : Math.min(limit, this.size);
    const start = this.size - count;
    const result: LogLine[] = new Array(count);
    for (let i = 0; i < count; i += 1) {
      result[i] = this.storage[(this.head + start + i) % this.maxBufferedLines];
    }
    return result;
  }

  getItemsAfterId(afterId: number): LogLine[] {
    const result: LogLine[] = [];
    for (let i = 0; i < this.size; i += 1) {
      const item = this.storage[(this.head + i) % this.maxBufferedLines];
      if (item.id > afterId) {
        for (let j = i; j < this.size; j += 1) {
          result.push(this.storage[(this.head + j) % this.maxBufferedLines]);
        }
        break;
      }
    }
    return result;
  }

  getRange(): LogBufferRange {
    if (this.size === 0) {
      return { oldestId: null, newestId: null, totalLines: 0 };
    }

    const oldest = this.storage[this.head];
    const newest = this.storage[(this.head + this.size - 1) % this.maxBufferedLines];
    return {
      oldestId: oldest.id,
      newestId: newest.id,
      totalLines: this.size
    };
  }
}
