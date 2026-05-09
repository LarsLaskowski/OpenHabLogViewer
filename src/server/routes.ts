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
    response.json({
      status: 'ok',
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      now: new Date().toISOString(),
      sources: dependencies.getStatuses()
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

    const snapshotLines = dependencies.buffer.getItems(limit);
    const snapshotRange = dependencies.buffer.getRange();
    const snapshotCursor = createSyncCursor(
      dependencies.buffer,
      snapshotLines,
      limit,
      snapshotRange.totalLines > snapshotLines.length
    );
    const gapDetected =
      snapshotCursor.oldestAvailableId !== null && afterId < snapshotCursor.oldestAvailableId - 1;
    const linesAfterCursor = gapDetected ? [] : dependencies.buffer.getItemsAfterId(afterId);

    let mode: ResyncResponse['mode'] = 'append';
    let resetReason: ResyncResetReason = null;
    let lines = linesAfterCursor;

    if (gapDetected) {
      mode = 'reset';
      resetReason = 'cursor-not-available';
      lines = snapshotLines;
    } else if (linesAfterCursor.length > limit) {
      mode = 'reset';
      resetReason = 'limit-exceeded';
      lines = snapshotLines;
    }

    const cursor: ResyncResponse['cursor'] = {
      ...createSyncCursor(dependencies.buffer, lines, limit, mode === 'reset' ? snapshotCursor.truncated : false),
      requestedAfterId: afterId,
      lastIncludedId:
        lines.at(-1)?.id ?? (mode === 'append' ? afterId : snapshotCursor.lastIncludedId)
    };

    response.json({
      lines,
      statuses: dependencies.getStatuses(),
      mode,
      resetReason,
      cursor
    });
  });

  router.get('/stream', (_request: Request, response: Response) => {
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    const removeClient = dependencies.sseHub.addClient(response);
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
