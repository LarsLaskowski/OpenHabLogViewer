import express from 'express';
import path from 'node:path';
import rateLimit from 'express-rate-limit';
import { loadConfig } from './config.js';
import { LogBuffer } from './logBuffer.js';
import { LogLineDraft, SourceStatus } from './types.js';
import { LogLineParser } from './logLineParser.js';
import { LogTailer } from './logTailer.js';
import { createApiRouter } from './routes.js';
import { createShutdown } from './shutdown.js';
import { SseHub } from './sseHub.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const buffer = new LogBuffer(config.maxBufferedLines);
  const sseHub = new SseHub(15_000, config.maxSseClients, config.maxSseClientsPerIp);
  const parser = new LogLineParser();
  const sourceStatuses = new Map(config.sources.map((source) => [source.source, createIdleStatus(source)]));

  // Tailers can emit live lines (watcher events, polls) while the initial seed
  // below is still being collected. Pushing those into the buffer immediately
  // would give them lower ids than the older bootstrap lines pushed afterwards
  // and misorder the view, so they are queued until the seed is in place.
  let initialSeedDone = false;
  const preSeedLines: LogLineDraft[] = [];

  const pushLiveLines = (lines: LogLineDraft[]): void => {
    if (!initialSeedDone) {
      preSeedLines.push(...lines);
      return;
    }

    for (const line of lines) {
      const persisted = buffer.push(line);
      sseHub.broadcast('log-line', persisted);
    }
  };

  const updateStatus = (status: SourceStatus): void => {
    sourceStatuses.set(status.source, status);
    sseHub.broadcast('source-status', status);
  };

  const tailers = config.sources.map(
    (sourceConfig) =>
      new LogTailer({
        sourceConfig,
        initialLinesPerFile: config.initialLinesPerFile,
        parser,
        onLines: pushLiveLines,
        onStatus: updateStatus,
        pollIntervalMs: config.pollIntervalMs
      })
  );

  const initialLines = (await Promise.all(tailers.map((tailer) => tailer.start()))).flat();

  for (const line of sortInitialLines(initialLines)) {
    buffer.push(line);
  }
  initialSeedDone = true;
  pushLiveLines(preSeedLines.splice(0));

  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  // Off by default so direct deployments do not trust spoofable X-Forwarded-For
  // headers. Set TRUST_PROXY (e.g. 1 for a single proxy hop) when running behind
  // a reverse proxy so rate limiting keys on the real client IP.
  app.set('trust proxy', config.trustProxy);
  const clientDistDir = path.resolve(process.cwd(), 'dist', 'client');

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    skip: (request) => request.path === '/stream',
    message: 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false
  });

  const htmlLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false
  });

  app.use('/api', apiLimiter, createApiRouter({ config, buffer, sseHub, getStatuses: () => Array.from(sourceStatuses.values()) }));
  app.use(express.static(clientDistDir));

  app.use(htmlLimiter);
  app.use((_request, response) => {
    response.sendFile(path.join(clientDistDir, 'index.html'));
  });

  const server = app.listen(config.port, () => {
    console.log(`OpenHab Log Viewer listening on port ${config.port}`);
  });

  const shutdown = createShutdown({ tailers, sseHub, server });

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

// Strict same-origin policy: the client is a single same-origin ES module, styles and
// SVG assets are served from the same origin, and bootstrap/resync/stream all use
// same-origin fetch/EventSource. No inline scripts or styles are used, so no relaxations
// are required. These headers act as defense-in-depth on top of the client's consistent
// use of textContent for rendering attacker-influenced log output.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

function securityHeaders(_request: express.Request, response: express.Response, next: express.NextFunction): void {
  response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

// Initial sort is by timestamp only, so lines from different sources that share
// the same millisecond can interleave. This means a multi-line group from one
// source can be split by a line from the other source during the one-time
// bootstrap seed; live tailing preserves per-source order afterwards.
//
// Lines without their own timestamp inherit the last timestamp seen for their
// source (or sort first when none exists yet), and the original index breaks
// ties. Sorting on a precomputed key keeps the comparator consistent —
// a comparator that returns 0 whenever a timestamp is missing is not
// transitive, and Array.sort guarantees nothing for inconsistent comparators.
function sortInitialLines(lines: LogLineDraft[]): LogLineDraft[] {
  const lastTimestampBySource = new Map<string, string>();
  const decorated = lines.map((line, index) => {
    if (line.timestamp) {
      lastTimestampBySource.set(line.source, line.timestamp);
    }

    return { line, index, sortKey: line.timestamp ?? lastTimestampBySource.get(line.source) ?? '' };
  });

  decorated.sort((left, right) => {
    if (left.sortKey !== right.sortKey) {
      return left.sortKey < right.sortKey ? -1 : 1;
    }

    return left.index - right.index;
  });

  return decorated.map((entry) => entry.line);
}

function createIdleStatus(source: { source: SourceStatus['source']; fileName: string }): SourceStatus {
  return {
    source: source.source,
    fileName: source.fileName,
    state: 'idle',
    message: `Waiting for ${source.fileName}`,
    updatedAt: new Date().toISOString()
  };
}

main().catch((error: unknown) => {
  console.error('[startup] Fatal error:', error instanceof Error ? error.message : error);
  process.exit(1);
});
