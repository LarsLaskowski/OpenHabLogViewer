import express, { Request, Response, Router } from 'express';
import { AppConfig, BootstrapResponse, LogLine, SourceStatus } from './types.js';
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

  router.get('/health', (_request: Request, response: Response) => {
    response.json({
      status: 'ok',
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      now: new Date().toISOString(),
      sources: dependencies.getStatuses()
    });
  });

  router.get('/bootstrap', (_request: Request, response: Response<BootstrapResponse>) => {
    const lines: LogLine[] = dependencies.buffer.getItems();

    response.json({
      lines,
      statuses: dependencies.getStatuses(),
      config: {
        clientMaxRenderedLines: dependencies.config.clientMaxRenderedLines,
        initialLinesPerFile: dependencies.config.initialLinesPerFile
      }
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
