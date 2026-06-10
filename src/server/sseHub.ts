import { Response } from 'express';

interface SseClient {
  id: number;
  ip: string;
  response: Response;
}

export class SseHub {
  private readonly clients = new Map<number, SseClient>();
  private readonly clientsByIp = new Map<string, number>();
  private nextClientId = 1;
  private readonly heartbeatTimer: NodeJS.Timeout;
  private readonly maxClients: number;
  private readonly maxClientsPerIp: number;

  constructor(heartbeatMs = 15_000, maxClients = 10, maxClientsPerIp = 3) {
    this.maxClients = maxClients;
    this.maxClientsPerIp = maxClientsPerIp;
    this.heartbeatTimer = setInterval(() => {
      this.broadcast('heartbeat', { ts: new Date().toISOString() });
    }, heartbeatMs);
  }

  get clientCount(): number {
    return this.clients.size;
  }

  isFull(): boolean {
    return this.clients.size >= this.maxClients;
  }

  isFullForIp(ip: string): boolean {
    return (this.clientsByIp.get(ip) ?? 0) >= this.maxClientsPerIp;
  }

  addClient(response: Response, ip: string): () => void {
    const clientId = this.nextClientId++;
    this.clients.set(clientId, { id: clientId, ip, response });
    this.clientsByIp.set(ip, (this.clientsByIp.get(ip) ?? 0) + 1);
    response.write('retry: 3000\n\n');

    return () => {
      this.removeClient(clientId);
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
        this.removeClient(clientId);
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
    this.clientsByIp.clear();
  }

  private removeClient(clientId: number): void {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    this.clients.delete(clientId);
    const remaining = (this.clientsByIp.get(client.ip) ?? 1) - 1;
    if (remaining > 0) {
      this.clientsByIp.set(client.ip, remaining);
    } else {
      this.clientsByIp.delete(client.ip);
    }
  }
}
