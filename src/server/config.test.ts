import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from './config.js';

const CONFIG_ENV_KEYS = [
  'PORT',
  'INITIAL_LINES_PER_FILE',
  'MAX_BUFFERED_LINES',
  'CLIENT_MAX_RENDERED_LINES',
  'MAX_SSE_CLIENTS',
  'MAX_SSE_CLIENTS_PER_IP',
  'POLL_INTERVAL_MS',
  'TRUST_PROXY',
  'HEALTH_DETAILS',
  'OPENHAB_LOG_DIR',
  'EVENTS_LOG_PATH',
  'OPENHAB_LOG_PATH'
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of CONFIG_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of CONFIG_ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

describe('loadConfig defaults', () => {
  it('uses documented defaults when no env vars are set', () => {
    const config = loadConfig();
    assert.equal(config.port, 9001);
    assert.equal(config.initialLinesPerFile, 500);
    assert.equal(config.maxBufferedLines, 2000);
    assert.equal(config.clientMaxRenderedLines, 500);
    assert.equal(config.maxSseClients, 10);
    assert.equal(config.maxSseClientsPerIp, 3);
    assert.equal(config.pollIntervalMs, 1000);
    assert.equal(config.trustProxy, false);
    assert.equal(config.healthDetails, false);
    assert.equal(config.sources.length, 2);
    assert.equal(config.sources[0].source, 'events');
    assert.equal(config.sources[0].fileName, 'events.log');
    // loadConfig runs the default paths through path.resolve, so compare against
    // the same resolution to stay correct on both POSIX and Windows.
    assert.equal(config.sources[0].filePath, path.resolve('/var/log/openhab/events.log'));
    assert.equal(config.sources[1].filePath, path.resolve('/var/log/openhab/openhab.log'));
  });
});

describe('loadConfig integer clamping', () => {
  it('clamps below the minimum', () => {
    process.env.MAX_BUFFERED_LINES = '50';
    assert.equal(loadConfig().maxBufferedLines, 100);
  });

  it('clamps above the maximum', () => {
    process.env.PORT = '99999';
    assert.equal(loadConfig().port, 65535);
  });

  it('clamps CLIENT_MAX_RENDERED_LINES to the 500 browser ceiling', () => {
    process.env.CLIENT_MAX_RENDERED_LINES = '1500';
    assert.equal(loadConfig().clientMaxRenderedLines, 500);
  });

  it('falls back to the default for non-numeric values', () => {
    process.env.INITIAL_LINES_PER_FILE = 'abc';
    assert.equal(loadConfig().initialLinesPerFile, 500);
  });

  it('falls back to the default for non-positive values', () => {
    process.env.MAX_SSE_CLIENTS = '0';
    assert.equal(loadConfig().maxSseClients, 10);
  });

  it('clamps POLL_INTERVAL_MS to the [100, 5000] range', () => {
    process.env.POLL_INTERVAL_MS = '10';
    assert.equal(loadConfig().pollIntervalMs, 100);

    process.env.POLL_INTERVAL_MS = '99999';
    assert.equal(loadConfig().pollIntervalMs, 5000);
  });
});

describe('loadConfig trust proxy parsing', () => {
  it('parses true/false/number/preset and defaults to false', () => {
    assert.equal(loadConfig().trustProxy, false);

    process.env.TRUST_PROXY = 'true';
    assert.equal(loadConfig().trustProxy, true);

    process.env.TRUST_PROXY = 'false';
    assert.equal(loadConfig().trustProxy, false);

    process.env.TRUST_PROXY = '2';
    assert.equal(loadConfig().trustProxy, 2);

    process.env.TRUST_PROXY = 'loopback';
    assert.equal(loadConfig().trustProxy, 'loopback');
  });
});

describe('loadConfig health details parsing', () => {
  it('defaults to false and accepts true/1/false/0', () => {
    assert.equal(loadConfig().healthDetails, false);

    process.env.HEALTH_DETAILS = 'true';
    assert.equal(loadConfig().healthDetails, true);

    process.env.HEALTH_DETAILS = '1';
    assert.equal(loadConfig().healthDetails, true);

    process.env.HEALTH_DETAILS = '0';
    assert.equal(loadConfig().healthDetails, false);

    process.env.HEALTH_DETAILS = 'nonsense';
    assert.equal(loadConfig().healthDetails, false);
  });
});

describe('loadConfig source resolution', () => {
  it('honors OPENHAB_LOG_DIR for both default file names', () => {
    process.env.OPENHAB_LOG_DIR = '/custom/logs';
    const config = loadConfig();
    assert.equal(config.sources[0].filePath, path.resolve('/custom/logs', 'events.log'));
    assert.equal(config.sources[1].filePath, path.resolve('/custom/logs', 'openhab.log'));
  });

  it('throws when a configured path exists but is not a regular file', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ohlv-config-'));
    try {
      process.env.EVENTS_LOG_PATH = dir; // a directory, not a file
      assert.throws(() => loadConfig(), /not a regular file/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
