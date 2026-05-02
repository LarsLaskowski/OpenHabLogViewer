# Copilot instructions for OpenHab Log Viewer

## Language and communication

- Write everything in English.
- Keep source code, comments, UI labels, README content, and new documentation in English.
- If you touch an existing file that contains non-English text, convert the touched content to English.

## Project context

- This project is a lightweight openHAB log viewer.
- The stack is Node.js + TypeScript + Express on the server and framework-free TypeScript on the client.
- The app reads `events.log` and `openhab.log`, exposes `/api/health`, `/api/bootstrap`, and `/api/stream`, and renders live updates through SSE.

## Architecture expectations

- Preserve the current split between `src/server` and `src/client`.
- Keep the frontend framework-free unless there is a strong technical reason to change it.
- Keep the deploy shape aligned with `dist/server`, `dist/client`, and `deploy/systemd/openhab-log-viewer.service`.
- Prefer small, targeted changes over broad rewrites outside the requested scope.

## Log handling rules

- Every physical log line must remain one visible UI row.
- Continuation lines must never be merged into the previous line.
- Source-specific styling for `events.log` and `openhab.log` must remain obvious.
- File errors and reconnect states must stay visible in the UI.

## Runtime and deployment rules

- Default runtime targets Linux.
- Default log paths are `/var/log/openhab/events.log` and `/var/log/openhab/openhab.log`.
- Environment-variable overrides must keep working.
- systemd support is required; do not remove or weaken the service-based deployment path.

## UX rules

- Keep the UI responsive under live updates.
- Preserve browser-side limits such as `CLIENT_MAX_RENDERED_LINES`.
- Light theme is the default; dark theme remains selectable.
- Auto-scroll, pause, clear, filtering, and status visibility are core features and should be preserved.

## Change discipline

- Reuse existing helpers and patterns before adding new abstractions.
- Keep dependencies minimal.
- Do not add authentication unless explicitly requested.
- Validate builds when code changes affect runtime behavior.
