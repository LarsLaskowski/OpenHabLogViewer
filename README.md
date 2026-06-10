# OpenHab Log Viewer

Live web UI for `events.log` and `openhab.log` built with Node.js, Express, and Server-Sent Events. Every physical log file line stays visible as its own UI row; continuation lines stay grouped under their timestamped parent entry.

## Features

- Initial load of the latest configured lines from `events.log` and `openhab.log`
- Live streaming of new lines via SSE
- Visible per-source file states (`watching`, `missing`, `permission-denied`, `rotated`)
- Browser-side filters for source, level, and text search
- Pause, clear, auto-scroll, and theme switching
- Stored UI preferences that survive a browser reload
- Bounded browser and server buffers

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `9001` | HTTP port used by the application |
| `OPENHAB_LOG_DIR` | `/var/log/openhab` | Fallback directory for log files |
| `EVENTS_LOG_PATH` | `/var/log/openhab/events.log` | Full path to `events.log` |
| `OPENHAB_LOG_PATH` | `/var/log/openhab/openhab.log` | Full path to `openhab.log` |
| `INITIAL_LINES_PER_FILE` | `500` | Number of latest lines per file included in bootstrap |
| `MAX_BUFFERED_LINES` | `2000` | Maximum shared server-side ring buffer size |
| `CLIENT_MAX_RENDERED_LINES` | `500` | Maximum number of lines kept in the browser buffer |
| `MAX_SSE_CLIENTS` | `10` | Maximum number of concurrent SSE stream connections; excess requests receive HTTP 503 |
| `MAX_SSE_CLIENTS_PER_IP` | `3` | Maximum number of concurrent SSE stream connections per client IP; excess requests receive HTTP 503. Prevents a single client from consuming all global slots. |

`EVENTS_LOG_PATH` and `OPENHAB_LOG_PATH` take precedence over `OPENHAB_LOG_DIR`.

Per-IP limiting keys on the client IP as seen by the app. Behind a reverse proxy, set `TRUST_PROXY` (see [#65](https://github.com/LarsLaskowski/OpenHabLogViewer/issues/65)) so the real client IP is used instead of the proxy's.

## Development and build

```bash
npm install
npm run build
```

The build creates:

```text
dist/
  client/
  server/
```

Start locally:

```bash
npm run start
```

The application is then available at `http://localhost:9001`.

### Optional client performance instrumentation

For development profiling, enable the browser-side instrumentation with `?perf=1` in the URL or by running `localStorage.setItem('openhab-log-viewer.perf', '1')` in the browser console and then reloading the page.

When enabled, the client records recent bootstrap, filter, render, SSE, reconnect, and visibility-resume measurements in `window.__openhabPerf.snapshot()`. Bootstrap, reconnect, visibility, and slow filter/render/SSE timings are also written to the browser console. Disable it again with `localStorage.removeItem('openhab-log-viewer.perf')` or `?perf=0`.

## Usage

After startup, the application automatically loads the latest configured lines from `events.log` and `openhab.log`, then connects to the live SSE stream.

### UI controls

| Element | Purpose |
| --- | --- |
| `Source` | Filters between both files, only `events.log`, or only `openhab.log` |
| `Level` | Filters by `TRACE`, `DEBUG`, `INFO`, `WARN`, or `ERROR` |
| `Search` | Searches `rawLine` using a case-insensitive substring match |
| `Theme` | Switches between Light and Dark; Light is the default |
| `Order` | Switches between `Newest first` and `Oldest first`; newest-first is the default. In `Oldest first`, the controls panel stays sticky and slightly transparent while scrolling. |
| `Auto-scroll` | Keeps the view pinned to the newest visible edge of the log list |
| `Pause UI` | Stops rerendering in the browser only; data is still received |
| `Clear browser buffer` | Clears the current browser view only; it does not clear the server buffer |

Source, level, search text, theme, order, auto-scroll, and pause state are stored in the browser and restored after a reload.

### Status indicators

- **Connecting / Reconnecting / Connected** show the browser-to-server connection state.
- The **Source status** section shows the current state of each watched file.
- Typical states:
  - `watching`: file is being tailed normally
  - `missing`: file was not found
  - `permission-denied`: file exists but cannot be read
  - `rotated`: log rotation or truncation was detected and the file was reattached
  - `error`: another file-related error occurred

### Log line rendering

- Every physical log file line is rendered as its own visible row.
- Continuation lines stay on their own rows but render under the same log entry with empty metadata columns.
- `events.log` and `openhab.log` remain visually distinct.
- Newest entries are shown at the top by default, but users can switch back to oldest-first ordering.
- Long content wraps instead of causing endless horizontal scrolling.

## Deploy package and copy deployment

Preferred deployment flow:

1. Develop the project externally
2. Run `npm install` and `npm run build`
3. Copy the following artifacts to the target host:

```text
deploy-package/
  dist/
    client/
    server/
  package.json
  package-lock.json
  deploy/
    systemd/
      openhab-log-viewer.service
  README.md
```

Because the server is bundled to `dist/server/index.cjs`, the target host only needs Node.js at runtime.

## systemd installation on Linux

The first version is designed for systemd-based operation. `deploy/systemd/openhab-log-viewer.service` assumes the application is installed in `/opt/openhab-log-viewer`.

Example for copying the deploy package to the target host:

```bash
scp -r deploy-package/ user@host:/tmp/openhab-log-viewer
sudo mkdir -p /opt/openhab-log-viewer
sudo cp -r /tmp/openhab-log-viewer/* /opt/openhab-log-viewer/
```

Install the service:

```bash
sudo cp deploy/systemd/openhab-log-viewer.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now openhab-log-viewer
sudo systemctl status openhab-log-viewer
journalctl -u openhab-log-viewer -f
```

You can optionally provide environment values in `/etc/default/openhab-log-viewer`, for example:

```ini
PORT=9001
EVENTS_LOG_PATH=/var/log/openhab/events.log
OPENHAB_LOG_PATH=/var/log/openhab/openhab.log
INITIAL_LINES_PER_FILE=500
MAX_BUFFERED_LINES=2000
CLIENT_MAX_RENDERED_LINES=500
MAX_SSE_CLIENTS=10
MAX_SSE_CLIENTS_PER_IP=3
```

Important: the service user must have read access to `/var/log/openhab/events.log` and `/var/log/openhab/openhab.log`.

## Operating notes

- The application is intended for home-network use or use behind a reverse proxy.
- Built-in authentication is intentionally not part of the first version.
- If external access is required, add authentication in front of the app via Nginx, Caddy, or Traefik.
