# Security Policy

## Supported Versions

Only the latest release of OpenHab Log Viewer receives security fixes.

| Version | Supported |
| ------- | --------- |
| latest  | Yes       |
| older   | No        |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Report vulnerabilities by e-mail to:

**Development@e-networld.de**

Include in your report:

- A clear description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

You will receive an acknowledgement within **5 business days**. We aim to release a fix or mitigation within **30 days** for confirmed vulnerabilities. We will keep you informed of progress throughout the process.

## Deployment Security Considerations

OpenHab Log Viewer is designed for **home-network use or deployment behind a trusted reverse proxy**. It does not include built-in authentication.

Before exposing the application to any network:

- Run it behind a reverse proxy (Nginx, Caddy, Traefik) with authentication enabled.
- Restrict access at the network level (firewall, VLAN) to trusted clients only.
- Ensure the service user has **read-only** access to `/var/log/openhab/` and no unnecessary system privileges.
- Do not expose port `9001` (or the configured port) directly to the internet.

## Scope

The following are considered in scope for vulnerability reports:

- Server-side request handling (Express routes, SSE stream, bootstrap API)
- Path traversal or file access beyond the configured log paths
- Information disclosure through log content or error messages
- Dependency vulnerabilities in `express` or `express-rate-limit`

The following are **out of scope**:

- Attacks that require local system access or physical access to the host
- Issues arising from misconfiguration of the deployment environment
- Denial-of-service through resource exhaustion on the local network
- Missing authentication (this is a deliberate design decision; use a reverse proxy)
