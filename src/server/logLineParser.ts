import { LogLevel, LogLineDraft, LogSource, SourceConfig } from './types.js';

const HEADER_PATTERN =
  /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}) \[(TRACE|DEBUG|INFO|WARN|ERROR)\s*\] \[([^\]]+)\] - ?(.*)$/;
const TIMESTAMP_PREFIX_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/;

export class LogLineParser {
  private readonly lastGroupIdBySource = new Map<LogSource, string>();
  private readonly lastHeaderBySource = new Map<LogSource, HeaderContext>();
  private readonly nextGroupBySource = new Map<LogSource, number>();

  parse(sourceConfig: SourceConfig, rawLine: string, receivedAt = new Date().toISOString()): LogLineDraft {
    const headerMatch = HEADER_PATTERN.exec(rawLine);

    if (headerMatch) {
      const timestamp = parseLocalTimestamp(headerMatch[1]);
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

// openHAB writes log timestamps in the host's local time without a zone offset,
// so we interpret the parsed fields as local time (via the multi-argument Date
// constructor) and normalize to an ISO/UTC string. This assumes the viewer runs
// in the same timezone as the openHAB instance that produced the logs.
function parseLocalTimestamp(input: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(input);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second, millisecond] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond)
  );

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
