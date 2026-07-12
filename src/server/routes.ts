import express, { Request, Response, Router } from 'express';
import { AppConfig, BootstrapResponse, ResyncResponse, ResyncResetReason, SourceStatus, SyncCursor } from './types.js';
import { LogBuffer } from './logBuffer.js';
import { SseHub } from './sseHub.js';

interface RouteDependencies {
  config: AppConfig;
  buffer: LogBuffer;
  sseHub: SseHub;
  getStatuses: () => SourceStatus[];
}

export function createApiRouter(dependencies: RouteDependencies): Router {
  const router = express.Router();
  const serverMaxSyncLines = Math.min(
    dependencies.config.maxBufferedLines,
    dependencies.config.clientMaxRenderedLines
  );

  router.get('/health', (_request: Request, response: Response) => {
    // The detailed payload exposes host information (pid, uptime, log file
    // states) to anyone who can reach the endpoint — e.g. through a reverse
    // proxy — so it is only included when HEALTH_DETAILS is enabled.
    if (!dependencies.config.healthDetails) {
      response.json({ status: 'ok' });
      return;
    }

    response.json({
      status: 'ok',
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      now: new Date().toISOString(),
      sources: dependencies.getStatuses(),
      sseClients: {
        current: dependencies.sseHub.clientCount,
        max: dependencies.config.maxSseClients
      }
    });
  });

  router.get('/bootstrap', (request: Request, response: Response<BootstrapResponse | { error: string }>) => {
    const limit = parseSyncLimit(request, serverMaxSyncLines);
    if (limit === null) {
      response.status(400).json({ error: `Expected "limit" to be a positive integer up to ${serverMaxSyncLines}.` });
      return;
    }

    const lines = dependencies.buffer.getItems(limit);
    const cursor = createSyncCursor(
      dependencies.buffer,
      lines,
      limit,
      dependencies.buffer.getRange().totalLines > lines.length
    );

    response.json({
      lines,
      statuses: dependencies.getStatuses(),
      config: {
        clientMaxRenderedLines: dependencies.config.clientMaxRenderedLines,
        initialLinesPerFile: dependencies.config.initialLinesPerFile,
        serverMaxSyncLines
      },
      cursor
    });
  });

  router.get('/resync', (request: Request, response: Response<ResyncResponse | { error: string }>) => {
    const afterId = parseAfterId(request);
    if (afterId === null) {
      response.status(400).json({ error: 'Expected "afterId" to be a non-negative integer.' });
      return;
    }

    const limit = parseSyncLimit(request, serverMaxSyncLines);
    if (limit === null) {
      response.status(400).json({ error: `Expected "limit" to be a positive integer up to ${serverMaxSyncLines}.` });
      return;
    }

    const snapshotRange = dependencies.buffer.getRange();
    // A cursor strictly greater than the newest buffered id cannot come from
    // the current server life: LogBuffer ids restart at 1 on every server
    // start, so a client that outlived a restart still holds a large stale id.
    // `afterId === newestId` stays a valid empty append (the normal "nothing
    // new" case); `?? 0` makes any afterId > 0 a reset on an empty buffer while
    // a fresh client (afterId = 0) still gets a plain append.
    const cursorAhead = afterId > (snapshotRange.newestId ?? 0);
    const gapDetected =
      cursorAhead ||
      (snapshotRange.oldestId !== null && afterId < snapshotRange.oldestId - 1);

    // Ids are strictly monotonic and contiguous within the buffer, so the number
    // of lines after the cursor is pure arithmetic — decide the mode before
    // materializing anything. `oldestId - 1` is the effective floor because a
    // cursor behind the oldest buffered id already triggers `gapDetected` above
    // and takes the reset path, so this expression is only consulted when
    // afterId >= oldestId - 1.
    const availableAfterCursor =
      snapshotRange.newestId === null || snapshotRange.oldestId === null
        ? 0
        : Math.max(0, snapshotRange.newestId - Math.max(afterId, snapshotRange.oldestId - 1));
    const limitExceeded = !gapDetected && availableAfterCursor > limit;

    let mode: ResyncResponse['mode'] = 'append';
    let resetReason: ResyncResetReason = null;
    let lines: BootstrapResponse['lines'];
    let truncated: boolean;

    if (gapDetected || limitExceeded) {
      mode = 'reset';
      resetReason = gapDetected ? 'cursor-not-available' : 'limit-exceeded';
      // Only materialize the snapshot on the reset path — a plain append never
      // needs it. Bounded to `limit` (<= serverMaxSyncLines) by construction.
      lines = dependencies.buffer.getItems(limit);
      truncated = snapshotRange.totalLines > lines.length;
    } else {
      // Append path: `availableAfterCursor <= limit`, so this copy is bounded.
      // The explicit `limit` cap is belt-and-braces against future regressions.
      lines = dependencies.buffer.getItemsAfterId(afterId, limit);
      truncated = false;
    }

    const cursor: ResyncResponse['cursor'] = {
      ...createSyncCursor(dependencies.buffer, lines, limit, truncated),
      requestedAfterId: afterId,
      lastIncludedId: lines.at(-1)?.id ?? (mode === 'append' ? afterId : null)
    };

    response.json({
      lines,
      statuses: dependencies.getStatuses(),
      mode,
      resetReason,
      cursor
    });
  });

  router.get('/stream', (request: Request, response: Response) => {
    if (dependencies.sseHub.isFull()) {
      response.status(503).json({ error: 'SSE connection limit reached. Try again later.' });
      return;
    }

    // Keyed on request.ip, which honors X-Forwarded-For only when `trust proxy` is
    // configured; otherwise it is the socket address. Falls back to the raw socket
    // address if request.ip is unavailable.
    const clientIp = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    if (dependencies.sseHub.isFullForIp(clientIp)) {
      response.status(503).json({ error: 'Too many SSE connections from your address. Try again later.' });
      return;
    }

    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    const removeClient = dependencies.sseHub.addClient(response, clientIp);
    response.on('close', removeClient);
  });

  return router;
}

function createSyncCursor(
  buffer: LogBuffer,
  lines: BootstrapResponse['lines'],
  limit: number,
  truncated: boolean
): SyncCursor {
  const range = buffer.getRange();

  return {
    oldestAvailableId: range.oldestId,
    newestAvailableId: range.newestId,
    lastIncludedId: lines.at(-1)?.id ?? null,
    limit,
    totalBufferedLines: range.totalLines,
    truncated
  };
}

function parseSyncLimit(request: Request, maxLimit: number): number | null {
  const rawLimit = request.query.limit;
  if (rawLimit === undefined) {
    return maxLimit;
  }

  if (typeof rawLimit !== 'string') {
    return null;
  }

  const parsedLimit = Number.parseInt(rawLimit, 10);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
    return null;
  }

  return Math.min(parsedLimit, maxLimit);
}

function parseAfterId(request: Request): number | null {
  const rawAfterId = request.query.afterId;
  if (typeof rawAfterId !== 'string') {
    return null;
  }

  const parsedAfterId = Number.parseInt(rawAfterId, 10);
  return Number.isInteger(parsedAfterId) && parsedAfterId >= 0 ? parsedAfterId : null;
}
