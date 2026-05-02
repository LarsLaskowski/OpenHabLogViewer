import { ConnectionState, LogLine, LogOrder, SourceStatus } from './state.js';

export function renderConnectionStatus(target: HTMLElement, connectionState: ConnectionState): void {
  target.className = `connection-badge connection-${connectionState}`;
  target.textContent =
    connectionState === 'connected'
      ? 'Connected'
      : connectionState === 'reconnecting'
        ? 'Reconnecting'
        : 'Connecting';
}

export function renderSourceStatuses(target: HTMLElement, statuses: SourceStatus[]): void {
  target.textContent = '';
  const fragment = document.createDocumentFragment();

  for (const status of statuses) {
    const row = document.createElement('div');
    row.className = `status-card state-${status.state}`;

    const title = document.createElement('div');
    title.className = 'status-card-title';
    title.textContent = status.fileName;

    const state = document.createElement('div');
    state.className = 'status-card-state';
    state.textContent = status.state;

    const message = document.createElement('div');
    message.className = 'status-card-message';
    message.textContent = status.message;

    row.append(title, state, message);
    fragment.append(row);
  }

  target.append(fragment);
}

export function renderLogLines(target: HTMLElement, lines: LogLine[], autoScroll: boolean, logOrder: LogOrder): void {
  const previousScrollTop = target.scrollTop;
  const previousScrollHeight = target.scrollHeight;
  target.textContent = '';

  const fragment = document.createDocumentFragment();
  for (const line of lines) {
    fragment.append(createLogLineElement(line));
  }

  target.append(fragment);

  if (autoScroll) {
    target.scrollTop = logOrder === 'newest-first' ? 0 : target.scrollHeight;
  } else if (logOrder === 'newest-first') {
    target.scrollTop = previousScrollTop + (target.scrollHeight - previousScrollHeight);
  } else {
    target.scrollTop = previousScrollTop;
  }
}

function createLogLineElement(line: LogLine): HTMLElement {
  const row = document.createElement('article');
  row.className = [
    'log-line',
    `source-${line.source}`,
    line.level ? `level-${line.level.toLowerCase()}` : 'level-none',
    line.isContinuation ? 'continuation' : 'head-line'
  ].join(' ');

  if (line.isContinuation) {
    row.append(
      createPlaceholderCell('time-cell'),
      createPlaceholderCell('source-cell'),
      createPlaceholderCell('level-cell'),
      createPlaceholderCell('logger-cell'),
      createMessageCell(line)
    );
  } else {
    const timestampLabel = line.timestamp ? formatTimestamp(line.timestamp) : '—';
    const timestampTooltip = line.timestamp ? formatTimestampTooltip(line.timestamp) : undefined;
    const loggerLabel = formatLoggerLabel(line.logger);
    const loggerTooltip = line.logger && loggerLabel !== line.logger ? line.logger : undefined;

    row.append(
      createCell('time-cell', timestampLabel, timestampTooltip),
      createBadgeCell('source-cell', line.fileName, `source-badge source-${line.source}`),
      createBadgeCell('level-cell', line.level ?? '—', `level-badge ${line.level ? `level-${line.level.toLowerCase()}` : 'level-none'}`),
      createCell('logger-cell', loggerLabel, loggerTooltip),
      createMessageCell(line)
    );
  }

  return row;
}

function createCell(className: string, text: string, title?: string): HTMLElement {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
  if (title) {
    element.title = title;
  }
  return element;
}

function createBadgeCell(className: string, text: string, badgeClassName: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = className;

  const badge = document.createElement('span');
  badge.className = badgeClassName;
  badge.textContent = text;

  wrapper.append(badge);
  return wrapper;
}

function createPlaceholderCell(className: string): HTMLElement {
  const element = document.createElement('div');
  element.className = `${className} placeholder-cell`;
  element.setAttribute('aria-hidden', 'true');
  return element;
}

function createMessageCell(line: LogLine): HTMLElement {
  const element = document.createElement('div');
  element.className = 'message-cell';
  element.textContent = line.isTimestamped ? line.message : line.rawLine;
  return element;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(
    date.getSeconds()
  ).padStart(2, '0')}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

function formatTimestampTooltip(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.toLocaleDateString()} ${formatTimestamp(value)}`;
}

function formatLoggerLabel(logger: string | null): string {
  if (!logger) {
    return '—';
  }

  const normalizedLogger = logger.trim();
  const lastSegment = getLastSegment(normalizedLogger);
  const mappedLabel = LOGGER_LABELS[lastSegment];

  if (mappedLabel) {
    return mappedLabel;
  }

  const scriptName = extractScriptName(normalizedLogger);
  if (scriptName) {
    return scriptName;
  }

  if (lastSegment.endsWith('Event')) {
    return humanizePascalCase(lastSegment.slice(0, -'Event'.length));
  }

  if (looksLikeTypeName(lastSegment)) {
    return humanizePascalCase(lastSegment);
  }

  return normalizedLogger;
}

function extractScriptName(logger: string): string | null {
  const markerIndex = logger.lastIndexOf('core.model.script.');
  if (markerIndex < 0) {
    return null;
  }

  const scriptName = logger.slice(markerIndex + 'core.model.script.'.length).trim();
  return scriptName || null;
}

function getLastSegment(value: string): string {
  const trimmed = value.trim();
  const parts = trimmed.split('.');
  return parts.at(-1)?.trim() ?? trimmed;
}

function humanizePascalCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}

function looksLikeTypeName(value: string): boolean {
  return /^[A-Z][A-Za-z0-9]+$/.test(value);
}

const LOGGER_LABELS: Record<string, string> = {
  ChannelTriggeredEvent: 'Channel triggered',
  InboxRemovedEvent: 'Inbox entry removed',
  ItemCommandEvent: 'Item command',
  ItemStateChangedEvent: 'Item state changed',
  ItemStatePredictedEvent: 'Item state predicted',
  ThingStatusInfoChangedEvent: 'Thing status changed'
};
