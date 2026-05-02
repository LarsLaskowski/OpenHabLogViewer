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
  target.textContent = '';

  const fragment = document.createDocumentFragment();
  for (const line of lines) {
    fragment.append(createLogLineElement(line));
  }

  target.append(fragment);

  if (autoScroll) {
    target.scrollTop = logOrder === 'newest-first' ? 0 : target.scrollHeight;
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

  row.append(
    createCell('time-cell', line.timestamp ? formatTimestamp(line.timestamp) : '—'),
    createBadgeCell('source-cell', line.fileName, `source-badge source-${line.source}`),
    createBadgeCell('level-cell', line.level ?? '—', `level-badge ${line.level ? `level-${line.level.toLowerCase()}` : 'level-none'}`),
    createCell('logger-cell', line.logger ?? '—'),
    createMessageCell(line)
  );

  return row;
}

function createCell(className: string, text: string): HTMLElement {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = text;
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
