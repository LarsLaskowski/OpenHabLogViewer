import { LogLevel, LogLineDraft, LogSource, SourceConfig } from './types.js';

const HEADER_PATTERN =
  /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}) \[(TRACE|DEBUG|INFO|WARN|ERROR)\s*\] \[([^\]]+)\] - ?(.*)$/;
const TIMESTAMP_PREFIX_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/;

export class LogLineParser {
  private readonly lastGroupIdBySource = new Map<LogSource, string>();
  private readonly lastHeaderBySource = new Map<LogSource, HeaderContext>();
  private readonly nextGroupBySource = new Map<LogSource, number>();
  private readonly toEpochMs: (fields: TimestampFields) => number;

  // `timeZone` is the IANA zone openHAB writes its log timestamps in (see
  // LOG_TIMEZONE). Without it, timestamps are read in the process's local
  // timezone, which only matches when openHAB and the viewer share it.
  constructor(timeZone: string | null = null) {
    this.toEpochMs = timeZone ? createZonedConverter(timeZone) : localFieldsToEpochMs;
  }

  parse(sourceConfig: SourceConfig, rawLine: string, receivedAt = new Date().toISOString()): LogLineDraft {
    const headerMatch = HEADER_PATTERN.exec(rawLine);

    if (headerMatch) {
      const timestamp = parseTimestamp(headerMatch[1], this.toEpochMs);
      if (timestamp) {
        const groupId = this.createGroupId(sourceConfig.source);
        this.storeHeaderContext(sourceConfig.source, {
          timestamp,
          level: headerMatch[2] as LogLevel,
          logger: headerMatch[3],
          groupId
        });

        return {
          source: sourceConfig.source,
          fileName: sourceConfig.fileName,
          rawLine,
          receivedAt,
          isTimestamped: true,
          timestamp,
          level: headerMatch[2] as LogLevel,
          logger: headerMatch[3],
          message: headerMatch[4] ?? '',
          isContinuation: false,
          groupId
        };
      }
    }

    const isContinuation = !TIMESTAMP_PREFIX_PATTERN.test(rawLine);
    const lastHeader = this.lastHeaderBySource.get(sourceConfig.source);

    return {
      source: sourceConfig.source,
      fileName: sourceConfig.fileName,
      rawLine,
      receivedAt,
      isTimestamped: false,
      timestamp: isContinuation ? lastHeader?.timestamp ?? null : null,
      level: isContinuation ? lastHeader?.level ?? null : null,
      logger: isContinuation ? lastHeader?.logger ?? null : null,
      message: rawLine,
      isContinuation,
      groupId: isContinuation ? lastHeader?.groupId ?? this.lastGroupIdBySource.get(sourceConfig.source) ?? null : null
    };
  }

  private createGroupId(source: LogSource): string {
    const nextValue = (this.nextGroupBySource.get(source) ?? 0) + 1;
    this.nextGroupBySource.set(source, nextValue);

    const groupId = `${source}-${nextValue}`;
    this.lastGroupIdBySource.set(source, groupId);
    return groupId;
  }

  private storeHeaderContext(source: LogSource, header: HeaderContext): void {
    this.lastHeaderBySource.set(source, header);
  }
}

interface HeaderContext {
  timestamp: string;
  level: LogLevel;
  logger: string;
  groupId: string;
}

// openHAB writes log timestamps without a zone offset, so the parsed fields
// are wall-clock time in whatever timezone openHAB uses. The converter turns
// them into an epoch value, normalized here to an ISO/UTC string.
function parseTimestamp(input: string, toEpochMs: (fields: TimestampFields) => number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(input);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second, millisecond] = match.map(Number);
  const date = new Date(toEpochMs({ year, month, day, hour, minute, second, millisecond }));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

interface TimestampFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

// Default: interpret the fields as local time of this process (via the
// multi-argument Date constructor).
function localFieldsToEpochMs(f: TimestampFields): number {
  return new Date(f.year, f.month - 1, f.day, f.hour, f.minute, f.second, f.millisecond).getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Interprets the fields as wall-clock time in an explicit IANA timezone, so the
// result no longer depends on the timezone of the viewer process (issue #195).
// Uses only Intl, no timezone database dependency.
function createZonedConverter(timeZone: string): (fields: TimestampFields) => number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  // Zone offset (ms, east of UTC positive) in effect at the given instant.
  const offsetAt = (epochMs: number): number => {
    const parts: Record<string, number> = {};
    for (const part of formatter.formatToParts(new Date(epochMs))) {
      parts[part.type] = Number(part.value);
    }
    const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return wallAsUtc - Math.floor(epochMs / 1000) * 1000;
  };

  // Consecutive log lines almost always share the same wall-clock minute, and
  // zone transitions fall on minute boundaries, so caching the resolved offset
  // of the last minute avoids the comparatively slow Intl calls per line.
  let cachedMinute = Number.NaN;
  let cachedOffset = 0;

  return (f) => {
    const wallAsUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second, f.millisecond);
    const minute = Math.floor(wallAsUtc / 60_000);
    if (minute !== cachedMinute) {
      cachedOffset = wallAsUtc - resolveWallTime(wallAsUtc);
      cachedMinute = minute;
    }
    return wallAsUtc - cachedOffset;
  };

  function resolveWallTime(wallAsUtc: number): number {
    // Offsets a day before and after bracket any DST transition near this wall
    // time; a candidate is valid when the zone maps it back to the same offset.
    const offsetBefore = offsetAt(wallAsUtc - DAY_MS);
    const offsetAfter = offsetAt(wallAsUtc + DAY_MS);
    const candidates = [wallAsUtc - offsetBefore, wallAsUtc - offsetAfter].filter(
      (candidate) => wallAsUtc - offsetAt(candidate) === candidate
    );

    // Ambiguous (DST fall-back): take the earlier instant. Non-existent
    // (DST spring-forward gap): shift forward with the pre-transition offset.
    return candidates.length > 0 ? Math.min(...candidates) : wallAsUtc - offsetBefore;
  }
}
