import { LogBuffer } from './logBuffer.js';
import { LogLine, LogLineDraft } from './types.js';

interface LogLineBroadcaster {
  broadcastBatch(event: string, items: unknown[]): void;
}

export interface SeededLinePusher {
  pushLiveLines(lines: LogLineDraft[]): void;
  seedInitialLines(lines: LogLineDraft[]): void;
}

// Tailers can emit live lines (watcher events, polls) while the initial seed is
// still being collected. Pushing those into the buffer immediately would give
// them lower ids than the older bootstrap lines pushed afterwards and misorder
// the view, so they are queued and sorted into the seed by seedInitialLines.
export function createSeededLinePusher(buffer: LogBuffer, sseHub: LogLineBroadcaster): SeededLinePusher {
  let initialSeedDone = false;
  const preSeedLines: LogLineDraft[] = [];

  const pushLiveLines = (lines: LogLineDraft[]): void => {
    if (!initialSeedDone) {
      preSeedLines.push(...lines);
      return;
    }

    // Buffer the whole batch first, then broadcast it in one write: a
    // broadcast line is always already buffered, which /api/resync relies on.
    const persisted: LogLine[] = lines.map((line) => buffer.push(line));
    sseHub.broadcastBatch('log-line', persisted);
  };

  const seedInitialLines = (lines: LogLineDraft[]): void => {
    // Queued pre-seed live lines are sorted together with the seed instead of
    // being appended after it: a live line from one source can be
    // chronologically older than another source's seed lines when that
    // source's seed read is slow. No SSE client can be connected yet (the
    // server only starts listening after seeding), so buffering without
    // broadcasting is correct.
    for (const line of sortInitialLines([...lines, ...preSeedLines.splice(0)])) {
      buffer.push(line);
    }

    initialSeedDone = true;
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
