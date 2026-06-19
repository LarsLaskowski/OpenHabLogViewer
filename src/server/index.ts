import express from 'express';
import path from 'node:path';
import rateLimit from 'express-rate-limit';
import { loadConfig } from './config.js';
import { LogBuffer } from './logBuffer.js';
import { LogLineDraft, SourceStatus } from './types.js';
import { LogLineParser } from './logLineParser.js';
import { LogTailer } from './logTailer.js';
import { createApiRouter } from './routes.js';
import { SseHub } from './sseHub.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const buffer = new LogBuffer(config.maxBufferedLines);
  const sseHub = new SseHub(15_000, config.maxSseClients, config.maxSseClientsPerIp);
  const parser = new LogLineParser();
  const sourceStatuses = new Map(config.sources.map((source) => [source.source, createIdleStatus(source)]));

  const pushLiveLines = (lines: LogLineDraft[]): void => {
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

  const initialLines = (await Promise.all(tailers.map((tailer) => tailer.start())))
    .flat()
    .sort(compareInitialLines);

  for (const line of initialLines) {
    buffer.push(line);
  }

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

  const shutdown = async (): Promise<void> => {
    // Guarantee the process exits even if server.close() never fires its
    // callback (e.g. a lingering keep-alive connection that never drains).
    const forceExit = setTimeout(() => {
      console.error('Shutdown timed out, forcing exit');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    for (const tailer of tailers) {
      await tailer.stop();
    }
    sseHub.close();
    server.close(() => {
      clearTimeout(forceExit);
      process.exit(0);
    });
  };

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
function compareInitialLines(left: LogLineDraft, right: LogLineDraft): number {
  if (left.timestamp && right.timestamp) {
    return left.timestamp.localeCompare(right.timestamp);
  }

  return 0;
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

void main();
