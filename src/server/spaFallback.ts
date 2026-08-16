import path from 'node:path';
import type express from 'express';

// Serves the SPA shell for client-side navigations, but only for GET/HEAD.
// Registered with app.use (any path/method), so without this check POST/PUT/
// DELETE/etc. to any non-API, non-static path would also get a 200 HTML
// response instead of an error status (see issue #137).
export function createSpaFallback(
  clientDistDir: string
): (request: express.Request, response: express.Response) => void {
  return (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.status(404).end();
      return;
    }

    response.sendFile(path.join(clientDistDir, 'index.html'));
  };
}
