# Phase 2 — Client

Scope: `src/client/*` — rendering, state, performance, UI conventions
(framework-free). 7 files.

**Phase status:** ✅ Reviewed — the client is functionally strong with a
well-engineered live-update/resync/visibility pipeline and safe (textContent)
rendering. The main concern is maintainability: `main.ts` is a 1498-line module
with heavy mutable global state and no tests. A few minor bugs/cleanups.

See [`00-criteria.md`](./00-criteria.md) for K1–K8 definitions.

**Top findings (priority order)**

1. ⚠️ `main.ts` is a 1498-line "god module" owning bootstrap, preferences, SSE
   connection, resync, visibility/hidden-tab handling, derived-view caching and
   render scheduling, via ~15 module-level mutable globals. Correct but hard to
   follow and untested; the incremental derived-view cache and resync/visibility
   paths are the most fragile parts.
2. ⚠️ Client/server limit mismatch: the server lets operators set
   `CLIENT_MAX_RENDERED_LINES` up to 100,000 (`config.ts`), but the client
   hard-caps at `CLIENT_MAX_RENDERED_LINES_CAP = 500` (`state.ts` L7/L85), so any
   configured value above 500 is silently ignored in the browser. Cross-file
   (state.ts + server config + docs).
3. ⚠️ `render.ts` `LOGGER_LABELS` (L312) has the key
   `'ty.util.ssl.SslContextFactory.config'` — a truncated logger name that can
   never match (lookup uses the full logger or its last segment `config`). Dead
   / buggy mapping, almost certainly a copy-paste truncation.
4. ✅ The client maintains a full parallel copy of the server types incl.
   `SyncCursor`/`ResyncResponse` (`state.ts`), resolving the phase-1 concern
   about type drift — and confirming `/api/resync` is really used (still
   undocumented in `CLAUDE.md`).
5. ⚠️ Minor: unused CSS custom properties, `aria-live="polite"` on a
   rapidly-updating container (screen-reader noise), and no runtime validation
   of SSE payloads (acceptable — same-origin, trusted server).

---

### `src/client/main.ts` (1498 lines)

**Overall status:** ⚠️ Note — works well; significant maintainability/test debt.
**Review focus:** Bootstrap from `/api/bootstrap`, localStorage preference
restore, `EventSource` connection, state layering. Largest file in the repo —
watch for over-broad responsibilities and split opportunities.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⚠️ | Acts as the whole client controller: bootstrap + retry, preference load/persist, control binding, SSE lifecycle, heartbeat watchdog, resync, hidden-tab queueing, visibility resume, derived-view cache and rAF render batching. Far more than one responsibility — a clear candidate to split into modules (e.g. `stream`, `sync`, `visibility`, `preferences`, `derived-view`). |
| K2 Correctness & bugs | ✅ | Logic is sound and defensive: dedup by `lastSeenLineId` (L823), `bufferGeneration` guards a buffer clear during an in-flight resync (L1251/L1265), exponential bootstrap retry (L184), and a 35 s heartbeat watchdog force-reconnects half-open streams (L57/L310). The incremental derived-view maintenance in `updateDerivedLogViewForBufferedLines` (L850) correctly handles newest-first reversal and eviction, but is intricate and easy to break. |
| K3 Security | ✅ | SSE payloads are `JSON.parse`d and cast (`as LogLine`/`as SourceStatus`) without runtime validation — acceptable since the stream is same-origin from a trusted server. localStorage preferences are parsed defensively (`parseStoredPreferences`/`parseStoredFilters`, L640–690) against tampering/corruption. Rendering delegates to `render.ts`, which uses `textContent` only (no XSS). |
| K4 Architecture & conventions | ✅ | Framework-free; restores persisted prefs then connects `EventSource`; preserves auto-scroll/pause/clear/filter and `CLIENT_MAX_RENDERED_LINES` via `getEffectiveClientLimit`. Defaults come from `createInitialState()` per convention. Uses `/api/bootstrap`, `/api/resync`, `/api/stream`. |
| K5 Maintainability & readability | ⚠️ | ~15 module-level mutable globals (`activeStream`, timers, `syncState`, `hiddenTabState`, `derivedLogView`, `pendingLiveRender`, three `pendingVisible*` timestamps). Heavy perf instrumentation is interleaved with logic, roughly doubling the volume of many functions and obscuring intent. `void bootstrap()` runs on import (L97), so the module has side effects on load. |
| K6 Performance | ✅ | Strong: `requestAnimationFrame` batching of live renders, incremental derived-view cache to avoid full refilter per line, hidden-tab queueing to skip work while not visible, and debounced search/persist. This is the file's best dimension. |
| K7 Tests & verifiability | ⚠️ | No tests, and the design resists them: singletons, import-time side effects, and DOM/`EventSource`/`localStorage` dependencies. The resync/visibility/derived-view logic most needs tests and is the riskiest to change blindly. |
| K8 Documentation & accuracy | ⚠️ | Confirms `/api/resync` usage that `CLAUDE.md` omits (track the doc fix from phase 1). No inline docs for the overall state machine despite its complexity. |

**Summary:** Behaviorally solid and performance-conscious, but the size,
global mutable state, import-time side effects, and absence of tests make it the
top maintainability risk in the codebase. Recommended follow-ups (each its own
prompt): extract cohesive modules; add a test seam (export an `init()` instead
of running on import) and unit-test the derived-view + resync logic.

---

### `src/client/render.ts` (341 lines)

**Overall status:** ✅ OK — safe, efficient DOM rendering; one dead label entry.
**Review focus:** Plain DOM rendering, one row per physical log line, source
badges, placeholder metadata cells for continuation lines.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Pure rendering: connection badge, source-status chips, and log rows with keyed reconciliation. Cohesive. |
| K2 Correctness & bugs | ⚠️ | Keyed reconciliation (L130) reuses nodes by id and minimizes DOM mutation; scroll preservation across container/document scrollers and newest/oldest order (L91–111) looks correct. Bug: `LOGGER_LABELS` key `'ty.util.ssl.SslContextFactory.config'` (L312) is a truncated logger string that the lookup (full name `??` last segment, L253) can never hit — dead/broken mapping. |
| K3 Security | ✅ | **All** text is set via `textContent` (`createCell`/`createBadgeCell`/`createMessageCell`, L189/L202/L222) — untrusted log content cannot inject HTML/script. `className` values derive from typed enums/source set server-side. This is exactly the XSS-safe rendering the server CSP comment relies on. |
| K4 Architecture & conventions | ✅ | Continuation lines are their own rows with placeholder metadata cells (L160–167), never merged. The row carries a `source-${source}` class, but `styles.css` only styles the compound `.source-badge.source-events/openhab` — there is no whole-row source styling, so the badge-only differentiation convention holds. |
| K5 Maintainability & readability | ✅ | Clear helpers; the logger-label heuristics (`extractScriptName`, `humanizePascalCase`, `looksLikeTypeName`) are reasonable. Minor: the row-level `source-*` class is effectively unused by CSS and slightly misleading. |
| K6 Performance | ✅ | Node reuse + reconciliation keep DOM work proportional to the delta (issue #44); status list built via a single `DocumentFragment`. Efficient. |
| K7 Tests & verifiability | ⚠️ | Pure DOM functions, ideal for jsdom tests (reconciliation, continuation layout, logger labels, `stripSourceFromMessage`). None exist. |
| K8 Documentation & accuracy | ✅ | Inline comments accurately describe the reuse/reconciliation strategy. |

**Summary:** A strong, security-correct renderer. Fix the dead `LOGGER_LABELS`
entry (verify the intended full logger name) and optionally drop the unused
row-level `source-*` class. Good unit-test target.

---

### `src/client/performance.ts` (225 lines)

**Overall status:** ✅ OK — clean, opt-in, zero-overhead-by-default instrumentation.
**Review focus:** Render limits, `CLIENT_MAX_RENDERED_LINES`, behavior under
sustained live updates.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Optional client perf monitor (timings + event counts + summaries), enabled via `?perf` or localStorage. Single responsibility. |
| K2 Correctness & bugs | ✅ | Disabled path returns a no-op monitor (L64). `recordEntry` caps recent entries at 250 (L150); summaries are keyed by a finite `category:name` set. `sanitizeDetails` handles `undefined`/`null`/numbers correctly. |
| K3 Security | ✅ | Exposes `globalThis.__openhabPerf` only when enabled; localStorage access is wrapped in try/catch. Debug-only, low risk. |
| K4 Architecture & conventions | ✅ | Off by default, so it never affects normal users or the default UI. Framework-free. |
| K5 Maintainability & readability | ✅ | Well-typed, self-contained, clear thresholds. |
| K6 Performance | ✅ | When disabled (the default), every hook is a no-op — negligible overhead. When enabled, the overhead is the intended measurement cost. |
| K7 Tests & verifiability | ⚠️ | Pure and testable (enable detection, summary math, capping). No tests. |
| K8 Documentation & accuracy | ✅ | Logs clear usage instructions on enable; naming is self-documenting. |

**Summary:** No issues. Nicely isolated diagnostics that stay out of the way by
default.

---

### `src/client/state.ts` (118 lines)

**Overall status:** ✅ OK — clean central state; one config-cap mismatch to flag.
**Review focus:** `createInitialState()` as the single source of UI defaults;
client-side `LogLine` / `SourceStatus` / `BootstrapResponse` shapes mirroring
the server.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Client types + defaults factory in one place. Clear. |
| K2 Correctness & bugs | ✅ | `createInitialState()` centralizes all defaults (L88); `getEffectiveClientMaxRenderedLines` validates and clamps (L84). `createPlaceholderStatus` seeds both sources. |
| K3 Security | ✅ | n/a — declarations and pure factories. |
| K4 Architecture & conventions | ✅ | Maintains a **full parallel** copy of the server types — `LogLine`, `SourceStatus`, `SyncCursor`, `ResyncMode`, `ResyncResetReason`, `BootstrapResponse`, `ResyncResponse` — matching `src/server/types.ts` (the no-shared-module convention). This closes the phase-1 K4 worry about drift. Light theme is the default (L105). |
| K5 Maintainability & readability | ✅ | Compact and well-organized. |
| K6 Performance | ✅ | n/a. |
| K7 Tests & verifiability | ⚠️ | `getEffectiveClientMaxRenderedLines` is a pure, obvious unit-test target. No tests. |
| K8 Documentation & accuracy | ⚠️ | `CLIENT_MAX_RENDERED_LINES_CAP = 500` (L7) hard-caps the effective render limit, but the server treats `CLIENT_MAX_RENDERED_LINES` as configurable up to 100,000. Values above 500 are silently ineffective in the browser — document this ceiling (and consider aligning the server clamp) so the env var isn't misleading. |

**Summary:** Solid and convention-compliant. The one actionable item is the
500-line client cap that overrides a server value advertised as far larger —
worth documenting and reconciling across `state.ts`, `config.ts`, and the README.

---

### `src/client/filters.ts` (52 lines)

**Overall status:** ✅ OK — correct, cached filtering.
**Review focus:** Filter logic correctness across level / logger / source / text.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Prepares and applies source/level/text filters; single responsibility. |
| K2 Correctness & bugs | ✅ | `matchesPreparedLogFilters` (L27) checks source, then level, then a case-insensitive substring of `rawLine`. Continuation lines inherit `level` from their header (set server-side), so level filtering keeps groups intact. `createPreparedLogFilterKey` puts `query` last, so no key collisions across states. |
| K3 Security | ✅ | Plain substring match (no regex from user input) — no ReDoS or injection. |
| K4 Architecture & conventions | ✅ | Filtering lives here, separate from rendering and state, per the documented split. |
| K5 Maintainability & readability | ✅ | Small and clear. |
| K6 Performance | ✅ | `getNormalizedSearchText` memoizes the lowercased text in a `WeakMap` keyed by line (L9/L43), avoiding repeated lowercasing on each filter pass; bounded by the rendered-line cap. |
| K7 Tests & verifiability | ⚠️ | Pure and trivially testable (matching across all dimensions, key generation). No tests. |
| K8 Documentation & accuracy | ✅ | Behavior matches the documented filtering responsibility. |

**Summary:** No issues. The `WeakMap` search-text cache is a nice, correct
performance touch. Good unit-test candidate.

---

### `src/client/styles.css` (417 lines)

**Overall status:** ✅ OK — clean theming; a few dead custom properties.
**Review focus:** Light (default) and dark theme, source badge/status styling,
responsiveness, no whole-row source styling.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Layout + light/dark theming via CSS custom properties. Clear. |
| K2 Correctness & bugs | ✅ | Dark theme (L42) overrides the variables it actually uses; the `--ok`/`--warn` status-indicator colors and all `--badge-*`/`--log-*` tokens resolve in both themes. |
| K3 Security | ✅ | n/a — static styling. |
| K4 Architecture & conventions | ✅ | `color-scheme: light` + `:root` is the default; dark is opt-in via `[data-theme='dark']`. Source differentiation is **badge-only**: only `.source-badge.source-events/openhab` is styled (L314/L319) — there is no whole-row `.source-events` rule. Continuation rows get a subtle left border (L368), not source styling. Matches the convention. |
| K5 Maintainability & readability | ⚠️ | Several custom properties appear unused — `--events`, `--openhab`, `--error`, `--info`, `--debug`, `--trace` (L10–16) — because badges use the separate `--badge-*` tokens. Harmless but worth pruning. |
| K6 Performance | ✅ | Grid row layout; `message-cell` uses `pre-wrap`/`overflow-wrap: anywhere` for long lines; responsive collapse to a single column under 1100px (L409) and hides continuation placeholders there. Reasonable. |
| K7 Tests & verifiability | ✅ | n/a — verified visually/by build. |
| K8 Documentation & accuracy | ✅ | Matches the rendered structure in `render.ts`. |

**Summary:** Tidy, convention-compliant styling with good light/dark support.
Only cleanup is removing the handful of unused color variables.

---

### `src/client/index.html` (103 lines)

**Overall status:** ✅ OK — clean, CSP-friendly shell; minor a11y note.
**Review focus:** Markup structure, asset references (SVGs, styles), accessibility.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Static app shell: topbar/brand, controls panel, and the log container; loads `main.js` as a module. Clear. |
| K2 Correctness & bugs | ✅ | All control ids match the `getRequiredInput` lookups in `main.ts`; `v__APP_VERSION__` (L25) is substituted at build time (verify in phase 3 `scripts/build.mjs`). |
| K3 Security | ✅ | No inline scripts or styles — fully compatible with the strict server CSP (`script-src 'self'`, `style-src 'self'`). External module + stylesheet, same-origin SVG assets. `img` has `alt` text. |
| K4 Architecture & conventions | ✅ | Theme is applied via `data-theme` from JS (light default); controls mirror the persisted state. Framework-free. |
| K5 Maintainability & readability | ✅ | Semantic, well-structured markup. |
| K6 Performance | ✅ | Minimal static document; `width`/`height` on the brand image avoid layout shift. |
| K7 Tests & verifiability | ✅ | n/a — verified via build/runtime. |
| K8 Documentation & accuracy | ⚠️ | `aria-live="polite"` on `#log-container` (L98) will make screen readers announce every batch of new rows under live updates — potentially overwhelming. Consider scoping the live region or relaxing it. Title/subtitle accurately describe the app. |

**Summary:** Clean, accessible-by-default, CSP-compatible shell. The only note is
that a live region over a high-frequency log stream may be noisy for assistive
tech; otherwise no issues.
