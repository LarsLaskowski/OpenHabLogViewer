import path from 'node:path';
import fs from 'node:fs';
import { AppConfig, LogSource, SourceConfig } from './types.js';

function clampInteger(name: string, fallback: number, min: number, max: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  const clamped = Math.min(Math.max(parsedValue, min), max);
  if (clamped !== parsedValue) {
    console.warn(`[config] ${name}=${parsedValue} is outside [${min}, ${max}]; using ${clamped}`);
  }
  return clamped;
}

function resolveSourceConfig(
  source: LogSource,
  explicitPath: string | undefined,
  logDir: string,
  fallbackFileName: string
): SourceConfig {
  const rawPath = explicitPath?.trim() || path.join(logDir, fallbackFileName);
  const filePath = path.resolve(rawPath);

  try {
    const canonicalPath = fs.realpathSync(filePath);
    if (!fs.statSync(canonicalPath).isFile()) {
      throw new Error(`[config] ${source} path is not a regular file: ${rawPath}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('[config]')) {
      throw error;
    }
    // File does not exist yet — logTailer handles missing files gracefully
  }

  return {
    source,
    fileName: path.basename(filePath),
    filePath
  };
}

function parseTrustProxy(name: string): boolean | number | string {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) {
    // Default off: direct deployments must not trust spoofable X-Forwarded-For headers.
    return false;
  }

  if (rawValue.toLowerCase() === 'true') {
    return true;
  }

  if (rawValue.toLowerCase() === 'false') {
    return false;
  }

  // A bare non-negative integer is treated as the number of trusted proxy hops.
  if (/^\d+$/.test(rawValue)) {
    return Number.parseInt(rawValue, 10);
  }

  // Anything else is passed straight to Express, which accepts preset names
  // ('loopback', 'linklocal', 'uniquelocal') or a comma-separated list of IPs/subnets.
  return rawValue;
}

export function loadConfig(): AppConfig {
  const logDir = process.env.OPENHAB_LOG_DIR?.trim() || '/var/log/openhab';

  return {
    port: clampInteger('PORT', 9001, 1, 65_535),
    initialLinesPerFile: clampInteger('INITIAL_LINES_PER_FILE', 500, 1, 100_000),
    maxBufferedLines: clampInteger('MAX_BUFFERED_LINES', 2_000, 100, 1_000_000),
    // The browser hard-caps rendering at CLIENT_MAX_RENDERED_LINES_CAP (500) for
    // responsiveness, so clamping the server-advertised value to the same ceiling
    // keeps config, server and client consistent (see issue #88).
    clientMaxRenderedLines: clampInteger('CLIENT_MAX_RENDERED_LINES', 500, 100, 500),
    maxSseClients: clampInteger('MAX_SSE_CLIENTS', 10, 1, 1_000),
    maxSseClientsPerIp: clampInteger('MAX_SSE_CLIENTS_PER_IP', 3, 1, 1_000),
    // Bound the file poll interval so low-volume deployments can slow polling to
    // reduce wakeups and high-volume ones can speed it up, while keeping the
    // floor high enough to avoid hammering the filesystem (see issue #43).
    pollIntervalMs: clampInteger('POLL_INTERVAL_MS', 1_000, 100, 5_000),
    trustProxy: parseTrustProxy('TRUST_PROXY'),
    sources: [
      resolveSourceConfig('events', process.env.EVENTS_LOG_PATH, logDir, 'events.log'),
      resolveSourceConfig('openhab', process.env.OPENHAB_LOG_PATH, logDir, 'openhab.log')
    ]
  };
}
