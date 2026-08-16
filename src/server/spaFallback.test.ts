import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createSpaFallback } from './spaFallback.js';

interface AppContext {
  base: string;
  close: () => Promise<void>;
}

async function startApp(clientDistDir: string): Promise<AppContext> {
  const app = express();
  app.use(createSpaFallback(clientDistDir));

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

describe('createSpaFallback', () => {
  it('serves index.html for a GET request', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ohlv-spa-'));
    try {
      writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>OpenHab Log Viewer</title>');
      const ctx = await startApp(dir);
      try {
        const res = await fetch(`${ctx.base}/some/client/route`);
        assert.equal(res.status, 200);
        assert.ok((await res.text()).includes('OpenHab Log Viewer'));
      } finally {
        await ctx.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('serves index.html for a HEAD request', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ohlv-spa-'));
    try {
      writeFileSync(path.join(dir, 'index.html'), '<!doctype html>');
      const ctx = await startApp(dir);
      try {
        const res = await fetch(`${ctx.base}/`, { method: 'HEAD' });
        assert.equal(res.status, 200);
      } finally {
        await ctx.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns 404 with no HTML body for non-GET/HEAD methods (issue #137)', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ohlv-spa-'));
    try {
      writeFileSync(path.join(dir, 'index.html'), '<!doctype html>');
      const ctx = await startApp(dir);
      try {
        const postRes = await fetch(`${ctx.base}/`, { method: 'POST' });
        assert.equal(postRes.status, 404);
        assert.equal((await postRes.text()).length, 0);

        const putRes = await fetch(`${ctx.base}/whatever`, { method: 'PUT' });
        assert.equal(putRes.status, 404);

        const deleteRes = await fetch(`${ctx.base}/x`, { method: 'DELETE' });
        assert.equal(deleteRes.status, 404);
      } finally {
        await ctx.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
