import { LogBuffer } from './logBuffer.js';
import { LogLineDraft } from './types.js';

interface LogLineBroadcaster {
  broadcast(event: string, data: unknown): void;
}

export interface SeededLinePusher {
  pushLiveLines(lines: LogLineDraft[]): void;
  seedInitialLines(lines: LogLineDraft[]): void;
}

// Tailers can emit live lines (watcher events, polls) while the initial seed is
// still being collected. Pushing those into the buffer immediately would give
// them lower ids than the older bootstrap lines pushed afterwards and misorder
// the view, so they are queued until seedInitialLines has run.
export function createSeededLinePusher(buffer: LogBuffer, sseHub: LogLineBroadcaster): SeededLinePusher {
  let initialSeedDone = false;
  const preSeedLines: LogLineDraft[] = [];

  const pushLiveLines = (lines: LogLineDraft[]): void => {
    if (!initialSeedDone) {
      preSeedLines.push(...lines);
      return;
    }

    for (const line of lines) {
      const persisted = buffer.push(line);
      sseHub.broadcast('log-line', persisted);
    }
  };

  const seedInitialLines = (lines: LogLineDraft[]): void => {
    for (const line of sortInitialLines(lines)) {
      buffer.push(line);
    }

    initialSeedDone = true;
    pushLiveLines(preSeedLines.splice(0));
  };

  return { pushLiveLines, seedInitialLines };
}

// Initial sort is by timestamp only, so lines from different sources that share
// the same millisecond can interleave. This means a multi-line group from one
// source can be split by a line from the other source during the one-time
// bootstrap seed; live tailing preserves per-source order afterwards.
//
// Lines without their own timestamp inherit the last timestamp seen for their
// source (or sort first when none exists yet), and the original index breaks
// ties. Sorting on a precomputed key keeps the comparator consistent —
// a comparator that returns 0 whenever a timestamp is missing is not
// transitive, and Array.sort guarantees nothing for inconsistent comparators.
export function sortInitialLines(lines: LogLineDraft[]): LogLineDraft[] {
  const lastTimestampBySource = new Map<string, string>();
  const decorated = lines.map((line, index) => {
    if (line.timestamp) {
      lastTimestampBySource.set(line.source, line.timestamp);
    }

    return { line, index, sortKey: line.timestamp ?? lastTimestampBySource.get(line.source) ?? '' };
  });

  decorated.sort((left, right) => {
    if (left.sortKey !== right.sortKey) {
      return left.sortKey < right.sortKey ? -1 : 1;
    }

    return left.index - right.index;
  });

  return decorated.map((entry) => entry.line);
}
