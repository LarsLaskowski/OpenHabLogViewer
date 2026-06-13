# Phase 1 — Server core

Scope: `src/server/*` — the heart of the app (data flow, security, error
handling). 8 files.

**Phase status:** ✅ Reviewed — server core is solid and security-conscious.
One notable issue (unbounded memory read on bootstrap in `logTailer.ts`) and a
handful of minor notes; nothing blocking.

See [`00-criteria.md`](./00-criteria.md) for K1–K8 definitions.

**Top findings (priority order)**

1. ⚠️ `logTailer.ts` `readLastLines()` caps by line *count*, not bytes. A huge
   file with few/no newlines (e.g. a multi-GB single line, or binary garbage)
   is read fully into memory on bootstrap. The live `sync()` path is protected
   by `MAX_SYNC_DELTA_BYTES`, but the initial read is not.
2. ⚠️ `logTailer.ts` initial-load race: `offset` is set from an earlier
   `stat()` while `readLastLines()` re-stats and reads up to a possibly larger
   size. Bytes appended in that window can be emitted twice (duplicate rows).
3. ⚠️ `routes.ts` exposes `/api/resync`, but `.claude/CLAUDE.md` documents only
   `/api/health`, `/api/bootstrap`, `/api/stream`. Documentation drift.
4. ⚠️ `index.ts` `shutdown()` has no force-exit timeout; `logBuffer.ts` evicts
   with `splice(0, n)` (O(n) per push at steady state). Minor.

---

### `src/server/index.ts` (146 lines)

**Overall status:** ⚠️ Note — solid composition root; a few small robustness gaps.
**Review focus:** Composition root — config load, shared singletons, tailer
startup order, serving the built client.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Clean composition root: loads config, wires `LogBuffer`/`SseHub`/`LogLineParser`/`LogTailer`/router, seeds buffer, serves static client. Single clear responsibility. |
| K2 Correctness & bugs | ⚠️ | `compareInitialLines` (L128) sorts the merged initial lines from both sources by ISO timestamp (lexical == chronological, OK), but continuation lines share their header's exact timestamp, so a line from the *other* source with an equal timestamp can be stably sorted *between* a header and its continuation, splitting a group. `shutdown()` (L88) calls `server.close()` with no timeout; if a keep-alive/idle HTTP connection lingers the callback may not fire and the process won't exit (SSE responses are ended first by `sseHub.close()`, so the common case is fine). `void main()` (L146): a thrown `loadConfig()` becomes an unhandled rejection — acceptable crash, but no friendly message. |
| K3 Security | ✅ | Strong defense-in-depth: `x-powered-by` disabled (L51), strict CSP (L107–118), `nosniff`/`DENY`/`no-referrer` (L122–124), `trust proxy` off by default (L56), two rate limiters (L59–74). `/stream` correctly skipped from the API limiter (L62). Health endpoint leaks `pid`/`uptime` (low risk, home-network scope). |
| K4 Architecture & conventions | ✅ | Respects server/client split, preserves `dist/client` static serving and the documented deployment shape. Defaults flow from `config`. |
| K5 Maintainability & readability | ✅ | Readable; helpers small and well-commented. Minor: `createIdleStatus` (L136) reconstructs a `SourceStatus` shape that `LogTailer.emitStatus` also builds — slight duplication. |
| K6 Performance | ✅ | Startup work is bounded; live path delegates to tailers/hub. No concerns. |
| K7 Tests & verifiability | ⚠️ | `main()` is not exported and wires everything internally, so it is hard to unit-test. Pure helpers (`compareInitialLines`, `createIdleStatus`) could be exported for testing. No tests exist. |
| K8 Documentation & accuracy | ✅ | The CSP comment block (L102–106) accurately describes the same-origin model. |

**Summary:** Well-built entry point with good security posture. Consider: a
force-exit timeout in `shutdown()`, exporting pure helpers for tests, and being
aware that timestamp-only sorting of initial lines can interleave a continuation
away from its header across sources.

---

### `src/server/config.ts` (92 lines)

**Overall status:** ✅ OK — robust env handling with sensible clamping.
**Review focus:** Env-var overrides, defaults, validation of paths and limits.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Single responsibility: build `AppConfig` from env with defaults. Clear. |
| K2 Correctness & bugs | ✅ | `clampInteger` (L5) rejects non-finite/≤0 and clamps to range with a warning. `parseTrustProxy` (L51) handles `true`/`false`/integer-hops/preset strings correctly. Lenient parse note: `parseInt('100x')` → `100` (accepted) — acceptable. |
| K3 Security | ✅ | Paths come from operator env vars (not request input), so traversal is out of scope. `realpathSync` + `isFile` validation (L33–34) rejects non-regular files early. An `EACCES` on the path is swallowed (L37–42) and later surfaced by the tailer as `permission-denied` — acceptable. `trust proxy` defaults to `false` (L54) — correct, avoids spoofable `X-Forwarded-For`. |
| K4 Architecture & conventions | ✅ | Defaults match documented runtime (`/var/log/openhab`, `events.log`, `openhab.log`, port 9001). `clientMaxRenderedLines` is plumbed to the client per convention. |
| K5 Maintainability & readability | ✅ | Compact, well-commented. |
| K6 Performance | ✅ | n/a — runs once at startup. |
| K7 Tests & verifiability | ⚠️ | `clampInteger`/`parseTrustProxy`/`resolveSourceConfig` are pure and ideal unit-test targets but are not exported. No tests. |
| K8 Documentation & accuracy | ⚠️ | Env-var names (`PORT`, `OPENHAB_LOG_DIR`, `INITIAL_LINES_PER_FILE`, `MAX_BUFFERED_LINES`, `CLIENT_MAX_RENDERED_LINES`, `MAX_SSE_CLIENTS`, `MAX_SSE_CLIENTS_PER_IP`, `TRUST_PROXY`, `EVENTS_LOG_PATH`, `OPENHAB_LOG_PATH`) must match README — verify in phase 5. |

**Summary:** Defensive and correct. Only follow-up is testability (export pure
helpers) and a cross-check of env-var docs against the README.

---

### `src/server/logTailer.ts` (357 lines)

**Overall status:** ⚠️ Note — careful, well-commented design with one real
memory risk and a narrow duplication race.
**Review focus:** File watching/polling, last-N bootstrap read, tailing,
missing-file / permission / rotation / truncation detection, `SourceStatus`
emission.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Owns watching/polling, bootstrap read, rotation/truncation/missing/permission detection, and status emission. Cohesive. |
| K2 Correctness & bugs | ⚠️ | **Duplication race:** `loadInitialLines` (L77) and `handleInitialLoad` (L110) set `this.offset = fileStats.size` from a `stat()` taken *before* `readLastLines` does its own internal `stat()` and read (L311). If the file grows between the two stats, the appended bytes are returned in the initial lines *and* re-read on the next `sync()` (offset < actual), producing duplicate rows. Rotation (L171) and truncation (L178) detection via dev:inode key and shrinking size look correct. `consumeChunk` (L215) CRLF/CR normalization and pending-chunk carryover are correct, including the force-flush of oversized unterminated lines (L226). |
| K3 Security | ⚠️ | **Unbounded bootstrap read:** `readLastLines` (L308) loops backward accumulating 64 KB chunks until `newlineCount >= maxLines`. A file with very few/no newlines (giant single line, binary garbage) never reaches the target, so the *entire file* is read into memory — a memory-exhaustion risk on a malformed/huge log. The live `sync()` path is guarded by `MAX_SYNC_DELTA_BYTES` (L13/L192), but the initial/reattach/skip-ahead reads via `readLastLines` are not. Recommend a byte ceiling on the backward scan. Log content itself is treated as opaque text (rendered with `textContent` client-side per the CSP comment), so no injection at the server. |
| K4 Architecture & conventions | ✅ | Emits `SourceStatus` for every state; one row per physical line preserved (grouping handled by the parser). Status states match `SourceState` in `types.ts`. |
| K5 Maintainability & readability | ✅ | Excellent comments explaining the burst/rotation/pending-chunk reasoning. Minor: `loadInitialLines` and `handleInitialLoad` duplicate "read last lines → set offset → emit watching" (one returns lines for bootstrap, the other calls `onLines`). |
| K6 Performance | ✅ | Backward byte-scan newline counting (issue #66) avoids repeated decode/split. Poll (1s) + dir watch with concurrency guard (`syncInFlight`/`syncQueued`). The main perf/memory caveat is the unbounded `readLastLines` above. |
| K7 Tests & verifiability | ⚠️ | Constructor injects `parser`/`onLines`/`onStatus`/`pollIntervalMs`, a good test seam, but there are no tests. Rotation/truncation/duplication paths are exactly what unit/integration tests should cover. |
| K8 Documentation & accuracy | ✅ | Inline docs match behavior; statuses align with `CLAUDE.md`'s tailer description. |

**Summary:** The most intricate file and generally well-engineered. Two
follow-ups worth a dedicated fix: (1) bound `readLastLines` by bytes as well as
lines; (2) set `offset` from the size observed *by* `readLastLines` to close the
initial-load duplication window.

---

### `src/server/logLineParser.ts` (104 lines)

**Overall status:** ✅ OK — correct grouping logic, minor cleanups only.
**Review focus:** Header vs. continuation line logic, inherited timestamp /
level / logger / group context.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Turns raw lines into `LogLineDraft`s; headers start groups, continuations inherit context. Matches the documented model. |
| K2 Correctness & bugs | ⚠️ | A line that *starts* with a timestamp prefix but does not fully match `HEADER_PATTERN` (e.g. malformed level) is classified as non-continuation (`isContinuation = false`, L43) and becomes an orphan row with `timestamp/level/logger/groupId = null` — acceptable but an edge worth noting. `parseLocalTimestamp` (L82) builds a `Date` in **server local time** then emits UTC ISO, i.e. log timestamps are assumed to be in the server's timezone; a TZ mismatch shifts displayed times. |
| K3 Security | ✅ | Regexes are linear (bounded `\s*`, negated char class), no catastrophic backtracking / ReDoS. |
| K4 Architecture & conventions | ✅ | Continuation lines remain their own rows with inherited metadata and `groupId` — exactly the "every physical line is its own row" convention. Per-source state keyed by `LogSource`. |
| K5 Maintainability & readability | ⚠️ | `const normalizedLine = rawLine` (L13) is a no-op alias that adds noise. `storeHeaderContext` (L70) is a trivial one-line wrapper. `isKnownLogLevel` (L102) is exported but never imported anywhere (confirmed by repo-wide search) — dead export, safe to remove. |
| K6 Performance | ✅ | Two regex tests per line; cheap. |
| K7 Tests & verifiability | ⚠️ | Pure and the single best unit-test candidate in the server (header vs. continuation, group IDs, timestamp parsing). No tests. |
| K8 Documentation & accuracy | ✅ | Behavior matches `CLAUDE.md`'s parser description. Document the local-timezone assumption somewhere user-facing. |

**Summary:** Logic is correct and convention-compliant. Cleanups: drop the
`normalizedLine` alias, verify `isKnownLogLevel` usage, and document the
local-timezone interpretation of log timestamps.

---

### `src/server/logBuffer.ts` (46 lines)

**Overall status:** ✅ OK — correct ring buffer; one steady-state perf note.
**Review focus:** Ring buffer behavior, capacity limits, eviction.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Bounded in-memory line store with monotonic ids and range queries. Clear. |
| K2 Correctness & bugs | ✅ | `push` assigns monotonic `nextId` and evicts overflow (L22). `getItemsAfterId` returns `[]` when the cursor id is gone (L36). `getRange` handles empty buffer with `?? null`. Ids stay stable across eviction — important for resync correctness. |
| K3 Security | ✅ | Bounded by `maxBufferedLines` (clamped in config). No untrusted-size growth. |
| K4 Architecture & conventions | ✅ | Matches the "shared buffer seeded then live-pushed" design. |
| K5 Maintainability & readability | ✅ | Small and clear. |
| K6 Performance | ⚠️ | At steady state (buffer full), every `push` does `splice(0, 1)`, which re-indexes the whole array — O(n) per appended line. Under high log throughput (n up to 1,000,000 via config) this is costly. `getItemsAfterId` is O(n) `findIndex` (fine at default 2,000). Consider a true circular buffer or batched eviction if large buffers are expected. |
| K7 Tests & verifiability | ⚠️ | Pure, trivially testable (push/evict/getItemsAfterId/getRange). No tests. |
| K8 Documentation & accuracy | ✅ | Matches description. |

**Summary:** Correct and id-stable. The only follow-up is the O(n) eviction
under large/high-throughput buffers — fine at defaults, worth revisiting if
`MAX_BUFFERED_LINES` is raised significantly.

---

### `src/server/sseHub.ts` (112 lines)

**Overall status:** ✅ OK — well-hardened SSE fan-out.
**Review focus:** SSE client registry, broadcast, heartbeat, disconnect
cleanup, backpressure.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Owns the SSE client registry, broadcast, heartbeat, and limits. Cohesive. |
| K2 Correctness & bugs | ✅ | `addClient` returns a disposer; `removeClient` is idempotent (L98 guard), so the disposer + `response.on('close')` both firing is safe. Deleting from the `clients` Map during `for...of` broadcast iteration is safe in JS. Per-IP counts are decremented and the key deleted at zero (L104–110). |
| K3 Security | ✅ | Global (`maxClients`) and per-IP (`maxClientsPerIp`) caps enforced in `routes.ts` before `addClient`; single-threaded so no TOCTOU between check and add. Slow-consumer protection: clients whose `writableLength` exceeds `MAX_CLIENT_BUFFER_BYTES` are dropped (L63), bounding heap under backpressure — a real DoS mitigation. |
| K4 Architecture & conventions | ✅ | Broadcasts `log-line`/`source-status`/`heartbeat` events as documented. File errors/status stay visible via `source-status`. |
| K5 Maintainability & readability | ✅ | Clear; `JSON.stringify` done once per broadcast (L58), not per client. |
| K6 Performance | ✅ | Single serialization per event; bounded per-client buffering. Efficient. |
| K7 Tests & verifiability | ⚠️ | Testable with a mock `Response`; no tests. |
| K8 Documentation & accuracy | ✅ | Behavior matches the SSE description in `CLAUDE.md`/routes. |

**Summary:** The strongest file in the phase — limits, backpressure handling,
and cleanup are all well-considered. Only gap is the absence of tests.

---

### `src/server/routes.ts` (188 lines)

**Overall status:** ✅ OK — validated endpoints; one documentation drift.
**Review focus:** `/api/health`, `/api/bootstrap`, `/api/stream`; rate limiting,
input handling, response shape vs. client expectations.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Defines the API router and cursor/limit helpers. Clear. |
| K2 Correctness & bugs | ✅ | `parseSyncLimit` (L162) defaults to max when absent, rejects arrays/non-strings (handles duplicate query params) and non-positive → 400. `parseAfterId` (L180) requires a non-negative integer string. Resync gap detection (`afterId < oldestAvailableId - 1`, L83) and `limit-exceeded` reset (L94) are handled, with empty-buffer cases degrading to append/empty correctly. |
| K3 Security | ✅ | Query input validated before use; `/stream` enforces global + per-IP limits and returns 503 when full (L117–129). `clientIp` falls back through `request.ip`/socket address (L125). Sets correct SSE headers incl. `X-Accel-Buffering: no` (L134). Health exposes `pid`/`uptime` (low risk). |
| K4 Architecture & conventions | ✅ | Response shapes match `BootstrapResponse`/`ResyncResponse` in `types.ts`; client must mirror these — verify `src/client/state.ts` in phase 2. |
| K5 Maintainability & readability | ✅ | `createSyncCursor` is reused across bootstrap/resync; resync branch logic is dense but readable. |
| K6 Performance | ✅ | Per-request work is buffer slices/`findIndex` — fine at default sizes. |
| K7 Tests & verifiability | ⚠️ | Handlers take injected deps and are ideal for `supertest`-style tests; none exist. |
| K8 Documentation & accuracy | ⚠️ | `/api/resync` is implemented here but `.claude/CLAUDE.md` lists only `/api/health`, `/api/bootstrap`, `/api/stream`. Update the docs (and verify the README) to include `/api/resync`. |

**Summary:** Endpoints are well-validated and limit-aware. The actionable item
is documentation: `/api/resync` exists in code but not in the architecture docs.

---

### `src/server/types.ts` (80 lines)

**Overall status:** ✅ OK — coherent shared shapes.
**Review focus:** `LogLine`, `SourceStatus`, `BootstrapResponse` shapes; must
stay in parallel with `src/client/state.ts`.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Central server type definitions; single source for `LogLine`/`SourceStatus`/cursor/response shapes. |
| K2 Correctness & bugs | ✅ | `LogLineDraft = Omit<LogLine, 'id'>` keeps draft/persisted in sync. `SourceState` enumerates all states the tailer emits. Cursor/response interfaces are internally consistent. |
| K3 Security | ✅ | n/a — type declarations only. |
| K4 Architecture & conventions | ⚠️ | Per `CLAUDE.md`, the client maintains a **parallel** copy (no shared module). This file includes `SyncCursor`, `ResyncMode`, `ResyncResetReason`, `ResyncResponse` — confirm `src/client/state.ts` mirrors all of them (phase 2). Drift here is the documented risk of the no-shared-module convention. |
| K5 Maintainability & readability | ✅ | Clean, well-organized; `LOG_LEVELS` as a `const` tuple driving `LogLevel`. |
| K6 Performance | ✅ | n/a. |
| K7 Tests & verifiability | ✅ | Enforced by `tsc --noEmit`; mismatches with usage surface at typecheck. |
| K8 Documentation & accuracy | ✅ | Matches usage across server files reviewed in this phase. |

**Summary:** Solid, coherent types. The one thing to verify in phase 2 is that
the client's parallel definitions in `state.ts` cover the full resync/cursor
surface, since the project deliberately avoids a shared types module.
