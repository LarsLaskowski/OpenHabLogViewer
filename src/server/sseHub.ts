import { Response } from 'express';

interface SseClient {
  id: number;
  response: Response;
}

export class SseHub {
  private readonly clients = new Map<number, SseClient>();
  private nextClientId = 1;
  private readonly heartbeatTimer: NodeJS.Timeout;

  constructor(heartbeatMs = 15_000) {
    this.heartbeatTimer = setInterval(() => {
      this.broadcast('heartbeat', { ts: new Date().toISOString() });
    }, heartbeatMs);
  }

  addClient(response: Response): () => void {
    const clientId = this.nextClientId++;
    this.clients.set(clientId, { id: clientId, response });
    response.write('retry: 3000\n\n');

    return () => {
      this.clients.delete(clientId);
      if (!response.writableEnded) {
        response.end();
      }
    };
  }

  broadcast(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    for (const [clientId, client] of this.clients) {
      try {
        client.response.write(payload);
      } catch {
        this.clients.delete(clientId);
      }
    }
  }

  close(): void {
    clearInterval(this.heartbeatTimer);
    for (const [, client] of this.clients) {
      if (!client.response.writableEnded) {
        client.response.end();
      }
    }
    this.clients.clear();
  }
}
