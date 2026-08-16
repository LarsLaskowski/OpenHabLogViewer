import compression from 'compression';
import type express from 'express';

// Compresses /api responses (bootstrap and reset-mode resync can run to a few
// hundred KB of repetitive JSON) but explicitly skips /stream: gzip buffers
// output until enough data accumulates, which would delay or batch SSE events
// and defeat live delivery (see issue #140).
//
// compression's filter runs lazily, the first time the response is written
// to rather than at mount time. By then Express has already restored
// request.path to the full incoming path (verified with a test rather than
// assumed), so it is matched here as "/api/stream", not the router-relative
// "/stream" a synchronously-invoked middleware would see.
export function createApiCompression(): express.RequestHandler {
  return compression({
    filter: (request, response) => request.path !== '/api/stream' && compression.filter(request, response)
  });
}
