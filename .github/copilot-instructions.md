# Copilot instructions for OpenHab Log Viewer

## Build, test, and lint commands

- Use **Node.js 20+** (`package.json` enforces `node >=20`).
- Install dependencies with `npm install`.
- Run the type check with `npm run typecheck`.
- Run the production build with `npm run build`. This already runs `npm run typecheck`, bundles `src/server/index.ts` and `src/client/main.ts` with esbuild, recreates `dist/`, and copies `index.html`, `styles.css`, and the SVG assets into `dist/client`.
- Run the built app with `npm run start`.
- There is currently **no `npm test` script, no lint script, and no single-test command** configured in this repository.

## High-level architecture

- This project is a lightweight openHAB log viewer for `events.log` and `openhab.log`.
- The app is split into a small **Express server** in `src/server` and a **framework-free browser client** in `src/client`.
- `src/server/index.ts` is the composition root: it loads config, creates the shared `LogBuffer`, `SseHub`, and `LogLineParser`, starts one `LogTailer` per configured source, seeds the initial buffer from both files, and then serves the built client from `dist/client`.
- `src/server/logTailer.ts` owns file watching and polling. It reads the last N lines for bootstrap, tails appended content, detects missing files / permission errors / rotation / truncation, and emits `SourceStatus` updates.
- `src/server/logLineParser.ts` turns raw file lines into structured `LogLine` objects. Timestamped header lines start a new group; continuation lines keep their own row but inherit timestamp / level / logger / group context from the last header of the same source.
- `src/server/routes.ts` exposes `/api/health`, `/api/bootstrap`, and `/api/stream`. `/api/bootstrap` returns buffered lines plus source statuses and client limits; `/api/stream` sends live `log-line`, `source-status`, and heartbeat SSE events.
- `src/client/main.ts` bootstraps from `/api/bootstrap`, restores persisted UI preferences from `localStorage`, then connects an `EventSource` to `/api/stream`.
- Rendering is plain DOM code in `src/client/render.ts`; filtering is in `src/client/filters.ts`; client defaults live in `src/client/state.ts`.

## Key conventions

- Keep **every physical log file line as its own visible UI row**. Continuation lines must not be merged into the previous line; they stay separate rows with placeholder metadata cells.
- Keep the frontend framework-free unless there is a strong technical reason to change it.
- When changing shared payloads, update both `src/server/types.ts` and `src/client/state.ts`. The client and server maintain matching `LogLine`, `SourceStatus`, and `BootstrapResponse` shapes in parallel rather than importing a common shared-types module.
- Client-side defaults are centralized in `createInitialState()` in `src/client/state.ts`. Bootstrap payload and stored preferences layer on top of those defaults in `src/client/main.ts`; add new UI state there instead of scattering default values.
- Source differentiation is currently done through **source badges and status cards**, not by styling the whole row differently. Changes to source-specific presentation usually need coordinated updates in `src/client/render.ts` and `src/client/styles.css`.
- File errors, source status, and reconnect states must stay visible in the UI.
- Keep the UI responsive under live updates and preserve browser-side limits such as `CLIENT_MAX_RENDERED_LINES`.
- Light theme is the default; dark theme remains selectable.
- Auto-scroll, pause, clear, filtering, and status visibility are core features and should be preserved.
- Preserve the current deployment shape: the built server runs from `dist/server/index.cjs`, the client is served from `dist/client`, and `deploy/systemd/openhab-log-viewer.service` assumes a Linux/systemd install rooted at `/opt/openhab-log-viewer`.
- Default runtime and deployment assume Linux/systemd with `/var/log/openhab/events.log` and `/var/log/openhab/openhab.log`; environment-variable overrides must keep working.
- Write user-facing text, comments, and documentation in **English**.
- Reuse existing helpers and patterns before adding new abstractions, keep dependencies minimal, and prefer small targeted changes over broad rewrites.
- Built-in authentication is intentionally out of scope for this app unless explicitly requested; deployment assumes home-network use or an external reverse proxy for auth.
- Validate builds when code changes affect runtime behavior.

## MCP server configuration

- `.vscode/mcp.json` configures the Playwright MCP server for GitHub Copilot in VS Code.
- Prefer Playwright MCP for browser-level checks of bootstrap loading, SSE updates, filters, theme/order toggles, and source-status rendering.
