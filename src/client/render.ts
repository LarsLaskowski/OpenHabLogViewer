import { ConnectionState, LogLine, LogOrder, SourceStatus } from './state.js';

export function renderConnectionStatus(target: HTMLElement, connectionState: ConnectionState): void {
  target.className = `connection-badge connection-${connectionState}`;
  if (connectionState === 'connected') {
    target.textContent = 'Connected';
  } else if (connectionState === 'reconnecting') {
    target.textContent = 'Reconnecting';
  } else {
    target.textContent = 'Connecting';
  }
}

export function renderSourceStatuses(target: HTMLElement, statuses: SourceStatus[]): void {
  target.textContent = '';
  const fragment = document.createDocumentFragment();

  for (const status of statuses) {
    const row = document.createElement('div');
    row.className = `status-chip state-${status.state}`;
    const statusLabel = formatSourceStatusLabel(status);
    row.title = statusLabel;
    row.setAttribute('aria-label', statusLabel);

    const indicator = document.createElement('span');
    indicator.className = 'status-indicator';
    indicator.textContent = SOURCE_STATE_SYMBOLS[status.state];
    indicator.setAttribute('aria-hidden', 'true');

    const title = document.createElement('span');
    title.className = 'status-file-name';
    title.textContent = status.fileName;

    row.append(indicator, title);
    fragment.append(row);
  }

  target.append(fragment);
}

export function renderLogLines(target: HTMLElement, lines: LogLine[], autoScroll: boolean, logOrder: LogOrder, hideSourceInMessage?: boolean): void {
  const previousScrollTop = target.scrollTop;
  const previousScrollHeight = target.scrollHeight;
  target.textContent = '';

  const fragment = document.createDocumentFragment();
  for (const line of lines) {
    fragment.append(createLogLineElement(line, hideSourceInMessage));
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

function createLogLineElement(line: LogLine, hideSourceInMessage?: boolean): HTMLElement {
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
      createMessageCell(line, hideSourceInMessage)
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
      createMessageCell(line, hideSourceInMessage)
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

function createMessageCell(line: LogLine, hideSourceInMessage?: boolean): HTMLElement {
  const element = document.createElement('div');
  element.className = 'message-cell';
  let message = line.isTimestamped ? line.message : line.rawLine;
  if (hideSourceInMessage) {
    message = stripSourceFromMessage(message);
  }
  element.textContent = message;
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
  const mappedLabel = LOGGER_LABELS[normalizedLogger] ?? LOGGER_LABELS[lastSegment];

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

function formatSourceStatusLabel(status: SourceStatus): string {
  const stateLabel = SOURCE_STATE_LABELS[status.state];
  if (!status.message || status.state === 'watching') {
    return `${status.fileName}: ${stateLabel}`;
  }

  return `${status.fileName}: ${stateLabel} - ${status.message}`;
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
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .trim();
}

function looksLikeTypeName(value: string): boolean {
  return /^[A-Z][A-Za-z0-9]+$/.test(value);
}

const LOGGER_LABELS: Record<string, string> = {
  'ty.util.ssl.SslContextFactory.config': 'SSL-Config',
  ChannelTriggeredEvent: 'Channel triggered',
  InboxRemovedEvent: 'Inbox entry removed',
  ItemCommandEvent: 'Item command',
  ItemStateChangedEvent: 'Item state changed',
  ItemStatePredictedEvent: 'Item state predicted',
  ThingStatusInfoChangedEvent: 'Thing status changed'
};

const SOURCE_STATE_SYMBOLS: Record<SourceStatus['state'], string> = {
  idle: '○',
  watching: '●',
  missing: '!',
  'permission-denied': '!',
  rotated: '↻',
  error: '×'
};

const SOURCE_STATE_LABELS: Record<SourceStatus['state'], string> = {
  idle: 'Waiting',
  watching: 'Watching',
  missing: 'Missing',
  'permission-denied': 'Permission denied',
  rotated: 'Rotated',
  error: 'Error'
};

function stripSourceFromMessage(message: string): string {
  return message.replace(/\s*\(source:[^)]+\)\s*/g, ' ').trim();
}
