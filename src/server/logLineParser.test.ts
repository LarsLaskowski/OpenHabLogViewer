import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LogLineParser } from './logLineParser.js';
import { SourceConfig } from './types.js';

const events: SourceConfig = { source: 'events', fileName: 'events.log', filePath: '/var/log/openhab/events.log' };
const openhab: SourceConfig = { source: 'openhab', fileName: 'openhab.log', filePath: '/var/log/openhab/openhab.log' };

const header = (ts: string, level: string, logger: string, message: string): string =>
  `${ts} [${level}] [${logger}] - ${message}`;

describe('LogLineParser.parse', () => {
  it('parses a timestamped header line into structured fields', () => {
    const parser = new LogLineParser();
    const line = parser.parse(events, header('2026-06-13 10:00:00.000', 'INFO ', 'org.openhab.core.X', 'hello world'));

    assert.equal(line.source, 'events');
    assert.equal(line.fileName, 'events.log');
    assert.equal(line.isTimestamped, true);
    assert.equal(line.isContinuation, false);
    assert.equal(line.level, 'INFO');
    assert.equal(line.logger, 'org.openhab.core.X');
    assert.equal(line.message, 'hello world');
    assert.notEqual(line.timestamp, null);
    assert.equal(line.groupId, 'events-1');
  });

  it('recognizes every supported log level (with padding)', () => {
    const parser = new LogLineParser();
    for (const level of ['TRACE', 'DEBUG', 'INFO ', 'WARN ', 'ERROR']) {
      const line = parser.parse(events, header('2026-06-13 10:00:00.000', level, 'log.ger', 'm'));
      assert.equal(line.level, level.trim());
      assert.equal(line.isTimestamped, true);
    }
  });

  it('treats a non-timestamped line as a continuation inheriting the last header context', () => {
    const parser = new LogLineParser();
    parser.parse(events, header('2026-06-13 10:00:00.000', 'WARN ', 'my.logger', 'boom'));
    const cont = parser.parse(events, '    at com.example.Thing.run(Thing.java:42)');

    assert.equal(cont.isContinuation, true);
    assert.equal(cont.isTimestamped, false);
    assert.equal(cont.level, 'WARN');
    assert.equal(cont.logger, 'my.logger');
    assert.equal(cont.groupId, 'events-1');
    assert.equal(cont.message, '    at com.example.Thing.run(Thing.java:42)');
    assert.notEqual(cont.timestamp, null);
  });

  it('does not inherit context for a continuation seen before any header', () => {
    const parser = new LogLineParser();
    const orphan = parser.parse(events, 'continuation before any header');

    assert.equal(orphan.isContinuation, true);
    assert.equal(orphan.level, null);
    assert.equal(orphan.logger, null);
    assert.equal(orphan.timestamp, null);
    assert.equal(orphan.groupId, null);
  });

  it('treats a timestamp-prefixed but malformed line as a non-continuation orphan', () => {
    const parser = new LogLineParser();
    const line = parser.parse(events, '2026-06-13 10:00:00.000 not a real header line');

    assert.equal(line.isContinuation, false);
    assert.equal(line.isTimestamped, false);
    assert.equal(line.level, null);
    assert.equal(line.logger, null);
    assert.equal(line.timestamp, null);
    assert.equal(line.groupId, null);
  });

  it('assigns increasing group ids per source for consecutive headers', () => {
    const parser = new LogLineParser();
    const a = parser.parse(events, header('2026-06-13 10:00:00.000', 'INFO ', 'a', 'one'));
    const b = parser.parse(events, header('2026-06-13 10:00:01.000', 'INFO ', 'b', 'two'));

    assert.equal(a.groupId, 'events-1');
    assert.equal(b.groupId, 'events-2');
  });

  it('keeps per-source state isolated', () => {
    const parser = new LogLineParser();
    const e = parser.parse(events, header('2026-06-13 10:00:00.000', 'INFO ', 'e', 'one'));
    const o = parser.parse(openhab, header('2026-06-13 10:00:00.000', 'INFO ', 'o', 'two'));

    assert.equal(e.groupId, 'events-1');
    assert.equal(o.groupId, 'openhab-1');
  });

  it('uses the provided receivedAt timestamp', () => {
    const parser = new LogLineParser();
    const line = parser.parse(events, header('2026-06-13 10:00:00.000', 'INFO ', 'log', 'x'), '2020-01-01T00:00:00.000Z');
    assert.equal(line.receivedAt, '2020-01-01T00:00:00.000Z');
  });
});
