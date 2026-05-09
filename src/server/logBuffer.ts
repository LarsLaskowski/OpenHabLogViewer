import { LogLine, LogLineDraft } from './types.js';

export interface LogBufferRange {
  oldestId: number | null;
  newestId: number | null;
  totalLines: number;
}

export class LogBuffer {
  private readonly items: LogLine[] = [];
  private nextId = 1;

  constructor(private readonly maxBufferedLines: number) {}

  push(draft: LogLineDraft): LogLine {
    const line: LogLine = {
      ...draft,
      id: this.nextId++
    };

    this.items.push(line);
    const overflow = this.items.length - this.maxBufferedLines;
    if (overflow > 0) {
      this.items.splice(0, overflow);
    }

    return line;
  }

  getItems(limit = this.maxBufferedLines): LogLine[] {
    return [...this.items.slice(-limit)];
  }

  getItemsAfterId(afterId: number): LogLine[] {
    const startIndex = this.items.findIndex((item) => item.id > afterId);
    return startIndex === -1 ? [] : this.items.slice(startIndex);
  }

  getRange(): LogBufferRange {
    return {
      oldestId: this.items[0]?.id ?? null,
      newestId: this.items.at(-1)?.id ?? null,
      totalLines: this.items.length
    };
  }
}
