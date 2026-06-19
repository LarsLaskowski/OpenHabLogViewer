import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createShutdown } from './shutdown.js';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('createShutdown', () => {
  it('stops every tailer, closes the hub and server, then exits with 0', async () => {
    const order: string[] = [];
    const exitCodes: number[] = [];
    let serverCloseCb: (() => void) | undefined;

    const shutdown = createShutdown({
      tailers: [
        { stop: async () => void order.push('stop:0') },
        { stop: async () => void order.push('stop:1') }
      ],
      sseHub: { close: () => order.push('hub') },
      server: { close: (cb) => void (order.push('server'), (serverCloseCb = cb)) },
      exit: (code) => exitCodes.push(code),
      log: () => {}
    });

    await shutdown();

    // Tailers and the SSE hub are torn down before the server is asked to close.
    assert.deepEqual(order, ['stop:0', 'stop:1', 'hub', 'server']);
    // The process only exits once the server has finished closing.
    assert.deepEqual(exitCodes, []);

    serverCloseCb?.();
    assert.deepEqual(exitCodes, [0]);
  });

  it('clears the guard timer when the server closes cleanly', async () => {
    const exitCodes: number[] = [];
    let serverCloseCb: (() => void) | undefined;

    const shutdown = createShutdown({
      tailers: [],
      sseHub: { close: () => {} },
      server: { close: (cb) => void (serverCloseCb = cb) },
      timeoutMs: 5,
      exit: (code) => exitCodes.push(code),
      log: () => {}
    });

    await shutdown();
    serverCloseCb?.();
    await delay(20);

    // Only the clean exit(0); the guard timer was cleared, so no force exit(1).
    assert.deepEqual(exitCodes, [0]);
  });

  it('force-exits with 1 when the server never finishes closing', async () => {
    const exitCodes: number[] = [];
    const messages: string[] = [];

    const shutdown = createShutdown({
      tailers: [],
      sseHub: { close: () => {} },
      server: { close: () => {} }, // never invokes the callback
      timeoutMs: 5,
      exit: (code) => exitCodes.push(code),
      log: (message) => messages.push(message)
    });

    await shutdown();
    assert.deepEqual(exitCodes, []);

    await delay(20);
    assert.deepEqual(exitCodes, [1]);
    assert.match(messages[0] ?? '', /forcing exit/i);
  });

  it('falls back to console.error for logging when no logger is injected', async () => {
    const exitCodes: number[] = [];
    const errors: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => void errors.push(args);

    try {
      const shutdown = createShutdown({
        tailers: [],
        sseHub: { close: () => {} },
        server: { close: () => {} }, // never invokes the callback
        timeoutMs: 5,
        exit: (code) => exitCodes.push(code)
        // log omitted on purpose to exercise the default console.error path
      });

      await shutdown();
      await delay(20);
    } finally {
      console.error = originalError;
    }

    assert.deepEqual(exitCodes, [1]);
    assert.match(String(errors[0]?.[0] ?? ''), /forcing exit/i);
  });
});
