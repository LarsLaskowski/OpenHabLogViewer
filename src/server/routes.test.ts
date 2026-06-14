import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { createApiRouter } from './routes.js';
import { LogBuffer } from './logBuffer.js';
import { SseHub } from './sseHub.js';
import { AppConfig, LogLineDraft, SourceStatus } from './types.js';

const NO_HEARTBEAT = 1_000_000_000;

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 9001,
    initialLinesPerFile: 500,
    maxBufferedLines: 2000,
    clientMaxRenderedLines: 500,
    maxSseClients: 10,
    maxSseClientsPerIp: 3,
    trustProxy: false,
    sources: [],
    ...overrides
  };
}

function draft(): LogLineDraft {
  return {
    source: 'events',
    fileName: 'events.log',
    rawLine: 'x',
    receivedAt: '2026-01-01T00:00:00.000Z',
    isTimestamped: true,
    timestamp: '2026-01-01T00:00:00.000Z',
    level: 'INFO',
    logger: 'logger',
    message: 'x',
    isContinuation: false,
    groupId: 'events-1'
  };
}

interface AppContext {
  base: string;
  buffer: LogBuffer;
  sseHub: SseHub;
  close: () => Promise<void>;
}

async function startApp(opts: {
  buffer?: LogBuffer;
  sseHub?: SseHub;
  statuses?: SourceStatus[];
  config?: Partial<AppConfig>;
} = {}): Promise<AppContext> {
  const buffer = opts.buffer ?? new LogBuffer(2000);
  const sseHub = opts.sseHub ?? new SseHub(NO_HEARTBEAT, 10, 3);
  const config = baseConfig(opts.config);
  const app = express();
  app.use('/api', createApiRouter({ config, buffer, sseHub, getStatuses: () => opts.statuses ?? [] }));

  const server: Server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    base: `http://localhost:${port}`,
    buffer,
    sseHub,
    close: async () => {
      sseHub.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
}

describe('GET /api/health', () => {
  it('returns ok with SSE client info', async () => {
    const ctx = await startApp();
    try {
      const res = await fetch(`${ctx.base}/api/health`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as { status: string; sseClients: { current: number; max: number } };
      assert.equal(body.status, 'ok');
      assert.equal(body.sseClients.max, 10);
    } finally {
      await ctx.close();
    }
  });
});

describe('GET /api/bootstrap', () => {
  it('returns buffered lines, statuses, config and cursor', async () => {
    const buffer = new LogBuffer(2000);
    buffer.push(draft());
    buffer.push(draft());
    buffer.push(draft());
    const ctx = await startApp({ buffer });
    try {
      const res = await fetch(`${ctx.base}/api/bootstrap`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        lines: { id: number }[];
        config: { serverMaxSyncLines: number };
        cursor: { newestAvailableId: number; totalBufferedLines: number };
      };
      assert.equal(body.lines.length, 3);
      assert.equal(body.cursor.newestAvailableId, 3);
      assert.equal(body.cursor.totalBufferedLines, 3);
      assert.equal(body.config.serverMaxSyncLines, 500);
    } finally {
      await ctx.close();
    }
  });

  it('rejects a non-integer or non-positive limit with 400', async () => {
    const ctx = await startApp();
    try {
      assert.equal((await fetch(`${ctx.base}/api/bootstrap?limit=abc`)).status, 400);
      assert.equal((await fetch(`${ctx.base}/api/bootstrap?limit=0`)).status, 400);
    } finally {
      await ctx.close();
    }
  });

  it('honors a valid limit by returning the most recent lines', async () => {
    const buffer = new LogBuffer(2000);
    for (let i = 0; i < 5; i += 1) {
      buffer.push(draft());
    }
    const ctx = await startApp({ buffer });
    try {
      const body = (await (await fetch(`${ctx.base}/api/bootstrap?limit=2`)).json()) as { lines: { id: number }[] };
      assert.deepEqual(body.lines.map((l) => l.id), [4, 5]);
    } finally {
      await ctx.close();
    }
  });
});

describe('GET /api/resync', () => {
  it('rejects a missing or invalid afterId with 400', async () => {
    const ctx = await startApp();
    try {
      assert.equal((await fetch(`${ctx.base}/api/resync`)).status, 400);
      assert.equal((await fetch(`${ctx.base}/api/resync?afterId=abc`)).status, 400);
    } finally {
      await ctx.close();
    }
  });

  it('appends lines newer than the cursor', async () => {
    const buffer = new LogBuffer(2000);
    for (let i = 0; i < 3; i += 1) {
      buffer.push(draft());
    }
    const ctx = await startApp({ buffer });
    try {
      const body = (await (await fetch(`${ctx.base}/api/resync?afterId=1`)).json()) as {
        mode: string;
        lines: { id: number }[];
      };
      assert.equal(body.mode, 'append');
      assert.deepEqual(body.lines.map((l) => l.id), [2, 3]);
    } finally {
      await ctx.close();
    }
  });

  it('resets with cursor-not-available when the cursor was evicted', async () => {
    const buffer = new LogBuffer(3);
    for (let i = 0; i < 5; i += 1) {
      buffer.push(draft()); // ids 3,4,5 remain
    }
    const ctx = await startApp({ buffer });
    try {
      const body = (await (await fetch(`${ctx.base}/api/resync?afterId=0`)).json()) as {
        mode: string;
        resetReason: string;
        lines: { id: number }[];
      };
      assert.equal(body.mode, 'reset');
      assert.equal(body.resetReason, 'cursor-not-available');
      assert.deepEqual(body.lines.map((l) => l.id), [3, 4, 5]);
    } finally {
      await ctx.close();
    }
  });

  it('resets with limit-exceeded when more lines are pending than the limit', async () => {
    const buffer = new LogBuffer(2000);
    for (let i = 0; i < 5; i += 1) {
      buffer.push(draft());
    }
    const ctx = await startApp({ buffer });
    try {
      const body = (await (await fetch(`${ctx.base}/api/resync?afterId=0&limit=2`)).json()) as {
        mode: string;
        resetReason: string;
        lines: { id: number }[];
      };
      assert.equal(body.mode, 'reset');
      assert.equal(body.resetReason, 'limit-exceeded');
      assert.deepEqual(body.lines.map((l) => l.id), [4, 5]);
    } finally {
      await ctx.close();
    }
  });
});

describe('GET /api/stream', () => {
  it('returns 503 when the global SSE limit is reached', async () => {
    const ctx = await startApp({ sseHub: new SseHub(NO_HEARTBEAT, 0, 3) });
    try {
      assert.equal((await fetch(`${ctx.base}/api/stream`)).status, 503);
    } finally {
      await ctx.close();
    }
  });

  it('returns 503 when the per-IP SSE limit is reached', async () => {
    const ctx = await startApp({ sseHub: new SseHub(NO_HEARTBEAT, 10, 0) });
    try {
      assert.equal((await fetch(`${ctx.base}/api/stream`)).status, 503);
    } finally {
      await ctx.close();
    }
  });
});
