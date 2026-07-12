import type express from 'express';

// When ALLOWED_HOSTS is configured, reject requests whose Host header is not on
// the allowlist. This guards the unauthenticated LAN app against DNS rebinding:
// under rebinding the request still carries the attacker's Host (e.g.
// evil.example), which is not on the list, while legitimate access uses a
// configured hostname. The check applies to every route, including the static
// client and /api/stream. This is not authentication — it only pins which
// hostnames the browser may use to reach the app (see issue #132).
export function createHostValidator(
  allowedHosts: string[]
): (request: express.Request, response: express.Response, next: express.NextFunction) => void {
  return (request, response, next) => {
    const rawHost = request.headers.host ?? '';
    // Strip a trailing :port, but keep IPv6 literals intact: "[::1]:9001" → "[::1]".
    // A plain /:\d+$/ replace would mangle a bare IPv6 literal, hence the branch.
    const host = rawHost.startsWith('[')
      ? rawHost.replace(/^(\[[^\]]*\])(:\d+)?$/, '$1').toLowerCase()
      : rawHost.replace(/:\d+$/, '').toLowerCase();

    if (allowedHosts.includes(host)) {
      next();
      return;
    }

    response.status(403).json({ error: 'Forbidden host' });
  };
}
