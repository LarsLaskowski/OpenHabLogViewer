import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { createApiCompression } from './apiCompression.js';

interface AppContext {
  base: string;
  close: () => Promise<void>;
}

async function startApp(): Promise<AppContext> {
  const app = express();
  app.use('/api', createApiCompression());
  // A large, repetitive payload so it clears compression's default 1 KB
  // threshold and actually gets gzipped.
  app.get('/api/bootstrap', (_request, response) => {
    response.json({ lines: Array.from({ length: 200 }, () => 'x'.repeat(50)) });
  });
  app.get('/api/stream', (_request, response) => {
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.write(`data: ${'x'.repeat(2000)}\n\n`);
    response.end();
  });

  const server: Server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    base: `http://localhost:${port}`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
}

describe('createApiCompression', () => {
  it('gzip-compresses a large /api/bootstrap response and preserves the JSON body', async () => {
    const app = await startApp();
    try {
      const response = await fetch(`${app.base}/api/bootstrap`, { headers: { 'Accept-Encoding': 'gzip' } });
      const body = (await response.json()) as { lines: string[] };

      assert.equal(response.headers.get('content-encoding'), 'gzip');
      assert.equal(body.lines.length, 200);
    } finally {
      await app.close();
    }
  });

  it('never compresses /api/stream so SSE delivery is not buffered', async () => {
    const app = await startApp();
    try {
      const response = await fetch(`${app.base}/api/stream`, { headers: { 'Accept-Encoding': 'gzip' } });
      await response.text();

      assert.equal(response.headers.get('content-encoding'), null);
    } finally {
      await app.close();
    }
  });
});
