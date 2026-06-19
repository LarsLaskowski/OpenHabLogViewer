export interface ShutdownDeps {
  tailers: { stop: () => Promise<void> | void }[];
  sseHub: { close: () => void };
  server: { close: (callback: () => void) => void };
  // Force-exit fallback in milliseconds. If server.close() never fires its
  // callback (e.g. a lingering keep-alive connection that never drains), the
  // process is terminated anyway after this delay. Defaults to 10s.
  timeoutMs?: number;
  exit?: (code: number) => void;
  log?: (message: string) => void;
}

// Builds the SIGINT/SIGTERM handler that tears the server down gracefully:
// tailers are stopped, the SSE hub and HTTP server are closed, and the process
// exits with 0 once the server has drained. A guard timer guarantees the
// process still exits (with 1) if draining stalls. `exit`/`log`/`timeoutMs` are
// injectable so the sequence can be unit-tested without touching the real
// process.
export function createShutdown(deps: ShutdownDeps): () => Promise<void> {
  const { tailers, sseHub, server } = deps;
  const timeoutMs = deps.timeoutMs ?? 10_000;
  const exit = deps.exit ?? ((code: number) => process.exit(code));
  const log = deps.log ?? ((message: string) => console.error(message));

  return async () => {
    const forceExit = setTimeout(() => {
      log('Shutdown timed out, forcing exit');
      exit(1);
    }, timeoutMs);
    forceExit.unref();

    for (const tailer of tailers) {
      await tailer.stop();
    }
    sseHub.close();
    server.close(() => {
      clearTimeout(forceExit);
      exit(0);
    });
  };
}
