import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Response } from 'express';
import { SseHub } from './sseHub.js';

// Minimal stand-in for the Express Response surface that SseHub touches.
class FakeResponse {
  writes: string[] = [];
  writableLength = 0;
  writableEnded = false;

  write(payload: string): boolean {
    this.writes.push(payload);
    return true;
  }

  end(): void {
    this.writableEnded = true;
  }
}

const asResponse = (fake: FakeResponse): Response => fake as unknown as Response;
// A heartbeat far in the future keeps the timer from firing during the test;
// every hub is closed in a finally block so the interval never leaks.
const NO_HEARTBEAT = 1_000_000_000;

describe('SseHub', () => {
  it('registers a client, writes the retry preamble and tracks counts', () => {
    const hub = new SseHub(NO_HEARTBEAT, 10, 3);
    try {
      const res = new FakeResponse();
      hub.addClient(asResponse(res), 'client-a');
      assert.equal(hub.clientCount, 1);
      assert.equal(res.writes[0], 'retry: 3000\n\n');
    } finally {
      hub.close();
    }
  });

  it('broadcasts SSE-formatted events to all clients', () => {
    const hub = new SseHub(NO_HEARTBEAT, 10, 3);
    try {
      const a = new FakeResponse();
      const b = new FakeResponse();
      hub.addClient(asResponse(a), 'client-a');
      hub.addClient(asResponse(b), 'client-b');
      hub.broadcast('log-line', { id: 7 });

      const expected = 'event: log-line\ndata: {"id":7}\n\n';
      assert.ok(a.writes.includes(expected));
      assert.ok(b.writes.includes(expected));
    } finally {
      hub.close();
    }
  });

  it('enforces global and per-IP limits', () => {
    const hub = new SseHub(NO_HEARTBEAT, 2, 1);
    try {
      assert.equal(hub.isFull(), false);
      hub.addClient(asResponse(new FakeResponse()), 'client-a');
      assert.equal(hub.isFullForIp('client-a'), true);
      hub.addClient(asResponse(new FakeResponse()), 'client-b');
      assert.equal(hub.isFull(), true);
    } finally {
      hub.close();
    }
  });

  it('drops a slow client whose outgoing buffer exceeds the cap', () => {
    const hub = new SseHub(NO_HEARTBEAT, 10, 3);
    try {
      const slow = new FakeResponse();
      slow.writableLength = 2 * 1024 * 1024; // over the 1 MB cap
      hub.addClient(asResponse(slow), 'client-a');
      assert.equal(hub.clientCount, 1);

      hub.broadcast('log-line', { id: 1 });
      assert.equal(hub.clientCount, 0);
      assert.equal(slow.writableEnded, true);
    } finally {
      hub.close();
    }
  });

  it('the disposer removes the client and frees its per-IP slot', () => {
    const hub = new SseHub(NO_HEARTBEAT, 10, 3);
    try {
      const res = new FakeResponse();
      const dispose = hub.addClient(asResponse(res), 'client-a');
      assert.equal(hub.isFullForIp('client-a'), false);
      dispose();
      assert.equal(hub.clientCount, 0);
      assert.equal(res.writableEnded, true);
    } finally {
      hub.close();
    }
  });

  it('close ends every client connection', () => {
    const hub = new SseHub(NO_HEARTBEAT, 10, 3);
    const res = new FakeResponse();
    hub.addClient(asResponse(res), 'client-a');
    hub.close();
    assert.equal(hub.clientCount, 0);
    assert.equal(res.writableEnded, true);
  });
});
