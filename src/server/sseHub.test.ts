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

  it('broadcastBatch writes a small batch as SSE frames in a single write', () => {
    const hub = new SseHub(NO_HEARTBEAT, 10, 3);
    try {
      const res = new FakeResponse();
      hub.addClient(asResponse(res), 'client-a');
      res.writes.length = 0; // drop the retry preamble

      hub.broadcastBatch('log-line', [{ id: 1 }, { id: 2 }, { id: 3 }]);

      assert.equal(res.writes.length, 1);
      const frames = res.writes[0].split('\n\n').filter((frame) => frame.length > 0);
      assert.deepEqual(frames, [
        'event: log-line\ndata: {"id":1}',
        'event: log-line\ndata: {"id":2}',
        'event: log-line\ndata: {"id":3}'
      ]);
    } finally {
      hub.close();
    }
  });

  it('broadcastBatch writes nothing for an empty batch', () => {
    const hub = new SseHub(NO_HEARTBEAT, 10, 3);
    try {
      const res = new FakeResponse();
      hub.addClient(asResponse(res), 'client-a');
      res.writes.length = 0;

      hub.broadcastBatch('log-line', []);
      assert.equal(res.writes.length, 0);
    } finally {
      hub.close();
    }
  });

  it('broadcastBatch drops a slow client and removes one whose write throws', () => {
    const hub = new SseHub(NO_HEARTBEAT, 10, 3);
    try {
      const slow = new FakeResponse();
      slow.writableLength = 2 * 1024 * 1024; // over the 1 MB cap
      const broken = new FakeResponse();
      hub.addClient(asResponse(slow), 'client-a');
      hub.addClient(asResponse(broken), 'client-b');
      // Only fail once the retry preamble has been written.
      broken.write = () => {
        throw new Error('socket closed');
      };

      hub.broadcastBatch('log-line', [{ id: 1 }, { id: 2 }]);

      assert.equal(hub.clientCount, 0);
      assert.equal(slow.writableEnded, true);
    } finally {
      hub.close();
    }
  });

  it('broadcastBatch chunks a large batch and re-checks back-pressure between chunks', () => {
    const hub = new SseHub(NO_HEARTBEAT, 10, 3);
    try {
      // 20 frames of ~100 KB: far past the 1 MB client buffer cap, but only a
      // handful of chunked writes rather than one write per frame.
      const items = Array.from({ length: 20 }, (_unused, index) => ({ id: index, pad: 'x'.repeat(100_000) }));
      const stalled = new FakeResponse();
      hub.addClient(asResponse(stalled), 'client-a');
      stalled.writes.length = 0; // drop the retry preamble
      // Nothing drains, so every write grows the outgoing buffer.
      const record = stalled.write.bind(stalled);
      stalled.write = (payload: string) => {
        stalled.writableLength += payload.length;
        return record(payload);
      };

      hub.broadcastBatch('log-line', items);

      // The client is dropped part way through the batch, once its buffer has
      // grown past the cap — not only after the whole batch has been written.
      assert.equal(hub.clientCount, 0);
      assert.equal(stalled.writableEnded, true);
      assert.ok(stalled.writes.length > 1, 'expected the batch to be split across several writes');
      assert.ok(stalled.writes.length < items.length, 'expected fewer writes than frames');
      assert.ok(
        stalled.writableLength < 2 * 1024 * 1024,
        `expected the drop to bound the buffer, saw ${stalled.writableLength} bytes`
      );
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
