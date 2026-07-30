import { Response } from 'express';

// Drop a client once its outgoing socket buffer exceeds this size. A slow or
// stalled consumer that never drains causes Node to buffer broadcast payloads
// in memory; under high log throughput that grows the server heap without
// bound until the OOM killer triggers. Dropping the client bounds the cost.
const MAX_CLIENT_BUFFER_BYTES = 1024 * 1024;

// Flush a batch broadcast once the pending payload reaches this size instead of
// writing the whole batch at once. A sync cycle can carry up to
// MAX_SYNC_DELTA_BYTES of log, so a single write would hand a stalled client
// several megabytes before the next back-pressure check and make
// MAX_CLIENT_BUFFER_BYTES a per-cycle floor rather than a ceiling. Chunking
// still collapses tens of thousands of per-line writes into a few dozen.
// Measured in UTF-16 characters, which tracks bytes closely for log text.
const WRITE_CHUNK_CHARS = 256 * 1024;

function formatEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

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
    this.writeToAll(formatEvent(event, data));
  }

  // A log burst can produce tens of thousands of lines in one tailer cycle.
  // Concatenated SSE frames are byte-identical to the same frames written
  // separately, so grouping them into chunked writes keeps the per-write
  // bookkeeping off the event loop without changing what clients see. Frames
  // are appended to a rolling chunk rather than collected in an array so the
  // whole batch is never materialized twice.
  broadcastBatch(event: string, items: unknown[]): void {
    let chunk = '';

    for (const item of items) {
      chunk += formatEvent(event, item);
      if (chunk.length >= WRITE_CHUNK_CHARS) {
        this.writeToAll(chunk);
        chunk = '';
      }
    }

    if (chunk.length > 0) {
      this.writeToAll(chunk);
    }
  }

  private writeToAll(payload: string): void {
    for (const [clientId, client] of this.clients) {
      // A client whose socket buffer is already over the cap is not draining;
      // writing more would only grow the server heap, so drop it instead.
      if (client.response.writableLength > MAX_CLIENT_BUFFER_BYTES) {
        this.dropSlowClient(clientId, client);
        continue;
      }

      try {
        client.response.write(payload);
      } catch {
        this.removeClient(clientId);
      }
    }
  }

  private dropSlowClient(clientId: number, client: SseClient): void {
    console.warn(
      `[sse] Dropping slow client ${clientId} (${client.ip}): outgoing buffer ` +
        `${client.response.writableLength} bytes exceeds ${MAX_CLIENT_BUFFER_BYTES}`
    );
    this.removeClient(clientId);
    if (!client.response.writableEnded) {
      client.response.end();
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
