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
        onStatus: updateStatus
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
    for (const tailer of tailers) {
      await tailer.stop();
    }
    sseHub.close();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

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
