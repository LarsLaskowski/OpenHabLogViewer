import { LogLine, LogLineDraft } from './types.js';

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

  getItems(): LogLine[] {
    return [...this.items];
  }
}
