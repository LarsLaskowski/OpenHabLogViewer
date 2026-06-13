# Phase 6 — Synthesis

Cross-cutting conclusions drawn from phases 1–5, now that every tracked file has
been reviewed.

**Phase status:** ✅ Complete.

**Overall assessment:** A small, well-engineered, security-conscious project.
The runtime code is correct and defensive (strict CSP, `textContent`-only
rendering, rate limiting and SSE backpressure, integrity-pinned dependencies,
SHA-pinned GitHub Actions). The weaknesses are concentrated in three areas:
(1) a couple of real robustness/hardening gaps, (2) recurring documentation
drift, and (3) the complete absence of automated tests for an app whose hardest
logic (tailing, resync, derived-view) is exactly what tests would protect.

## 1. Cross-cutting findings

Patterns that span multiple files rather than living in one place:

- **A — `CLIENT_MAX_RENDERED_LINES` cap mismatch (4 files).** The server treats
  it as configurable up to 100,000 (`src/server/config.ts`), but the client
  hard-caps at 500 (`src/client/state.ts`, `CLIENT_MAX_RENDERED_LINES_CAP`). Both
  shipped configs advertise values the client silently ignores: the systemd unit
  sets `1500` (`deploy/systemd/...service`) and the README's env example sets
  `1500` (`README.md` L207). Either the cap is the real ceiling (then the docs
  and config mislead) or it should be raised — one decision, four files.

- **B — `/api/resync` documentation drift (3+ files).** The endpoint is
  implemented (`src/server/routes.ts`), typed (`types.ts`/`state.ts`), and used
  by the client (`main.ts`), but both architecture docs (`.claude/CLAUDE.md`
  L19, `.github/copilot-instructions.md` L19) list only health/bootstrap/stream.
  The two docs duplicate each other and must be synced by hand, which is why the
  omission persists in both.

- **C — No automated tests anywhere (whole repo).** There is no `test` script
  (`package.json`), and every phase flagged untested logic. `tsc --noEmit` is the
  only correctness gate. The best, lowest-effort targets are the pure modules:
  `logLineParser`, `logBuffer`, `filters`, `state`, and `render`.

- **D — Documentation/tooling duplication.** `CLAUDE.md` ↔ `copilot-instructions.md`
  and `.github/skills/publish-pr` ↔ `.claude/skills/publish-pr` each carry two
  overlapping-but-diverging copies, so fixes have to be applied twice and drift
  creeps in (see B and the divergent version-bump logic in the publish-pr pair).

- **E — Windows-only tooling vs. Linux deploy target.** The Claude/Copilot
  tooling assumes Windows (`.claude/settings.json` runs `powershell …ps1`,
  `.mcp.json` runs `sonar.exe`, the Serena memory says "Windows development
  commands"), while the runtime and deployment are Linux/systemd. Internally
  consistent, but the secret-scanning hooks/MCP won't run on a non-Windows dev
  machine.

- **F — Strong security posture, two gaps.** Defense-in-depth is generally
  excellent (CSP, `textContent`, `trust proxy` off by default, per-IP SSE limits,
  slow-client dropping, SHA-pinned actions, `npm audit`). The two exceptions:
  the systemd unit has no sandboxing directives, and `release.yml` interpolates an
  untrusted `workflow_dispatch` input into a shell script before validation.

## 2. Risk-prioritized issue list

P1 = correctness/security worth fixing soon; P2 = notable; P3 = minor/cleanup.

| Priority | File(s) | Criterion | Issue | Suggested action |
|----------|---------|-----------|-------|------------------|
| P1 | `src/server/logTailer.ts` | K2/K3 | `readLastLines` caps by line count, not bytes; a huge file with few/no newlines is read fully into memory on bootstrap | Add a byte ceiling to the backward scan (R1) |
| P1 | `.github/workflows/release.yml` | K3 | `${{ github.event.inputs.tag }}` interpolated into bash before validation (script injection; write-access users) | Pass via `env:` and reference `"$TAG_INPUT"` (R3) |
| P1 | `deploy/systemd/openhab-log-viewer.service` | K3 | No sandboxing directives for a network-facing service | Add `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, `ReadOnlyPaths` (R2) |
| P2 | `src/server/logTailer.ts` | K2 | Initial-load `offset` set from an earlier `stat` than the one `readLastLines` reads → possible duplicate rows | Set `offset` from the size observed by `readLastLines` (R1) |
| P2 | `state.ts` + `config.ts` + systemd + README | K4/K8 | `CLIENT_MAX_RENDERED_LINES` cap mismatch (finding A) | Decide the policy and align all four (R4) |
| P2 | `CLAUDE.md`, `copilot-instructions.md` | K8 | `/api/resync` undocumented; `copilot-instructions.md` cites wrong MCP file/server | Document `/api/resync`; fix MCP reference (R5) |
| P2 | `src/client/main.ts` | K1/K5/K7 | 1498-line module, heavy global state, import-time side effects, untested | Split into modules + add an `init()` test seam (R7) |
| P2 | whole repo | K7 | No test infrastructure | Add a minimal runner + unit tests for pure modules (R6) |
| P3 | `src/server/logBuffer.ts` | K6 | `splice(0,n)` eviction is O(n) per push at steady state (matters only at large buffers) | Consider a circular buffer if `MAX_BUFFERED_LINES` is raised (R9) |
| P3 | `src/server/index.ts` | K2 | `shutdown()` has no force-exit timeout; timestamp-only initial sort can split a group across sources | Add a shutdown timeout; be aware of the sort edge (R9) |
| P3 | `src/server/logLineParser.ts` | K5 | Dead export `isKnownLogLevel`, redundant `normalizedLine` alias, local-timezone assumption | Remove dead code; document the TZ assumption (R9) |
| P3 | `src/client/render.ts` | K2/K5 | Dead `LOGGER_LABELS` key `ty.util.ssl...`; unused row-level `source-*` class | Fix/remove the broken label; drop the unused class (R9) |
| P3 | `tsconfig.json` | K2/K4 | `scripts/**/*.mjs` not actually type-checked; one config gives server the `DOM` lib | Enable `allowJs`/`checkJs` or drop the include; split server/client scopes (R8) |
| P3 | `package.json` | K5 | `@types/express-rate-limit` is a redundant deprecated stub | Remove the devDep (R9) |
| P3 | `ci.yml` + `release.yml` | K4 | Node version drift (CI 20/22 vs release 24) | Add 24 to the CI matrix or align (R9) |
| P3 | `src/client/styles.css` | K5 | 6 unused CSS custom properties | Prune (R9) |
| P3 | `src/client/index.html` | K8 | `aria-live="polite"` on a high-frequency container may flood screen readers | Scope/relax the live region (R9) |
| P3 | `scripts/build.mjs` | K5 | Prod sourcemaps, no minify, unhashed filenames, hardcoded asset copies | Optional: glob assets, minify, content-hash (R9) |
| P3 | `.github/skills/*`, `.claude/skills/*` | K5 | Two diverging `publish-pr` skills; all assume `gh` CLI | Reconcile; note env dependency (R9) |
| P3 | issue templates, SVGs, serena | K5/K6 | Missing default labels; ~42 KB brand SVGs; missing trailing newlines; `languages: []` | Low-priority polish (R9) |

No findings rose to a security severity requiring immediate disclosure; all P1
items are hardening/robustness rather than active exploits, given the
home-network/reverse-proxy deployment model.

## 3. Recommendations

Each is scoped to be driven from its own prompt.

| # | Recommendation | Scope | Files touched | Effort |
|---|----------------|-------|---------------|--------|
| R1 | Bound `readLastLines` by bytes and close the initial-load `offset` race | `src/server/logTailer.ts` | 1 | S |
| R2 | Add systemd sandboxing directives | `deploy/systemd/openhab-log-viewer.service` | 1 | S |
| R3 | Fix the release-workflow input injection (use `env:`) | `.github/workflows/release.yml` | 1 | S |
| R4 | Resolve the `CLIENT_MAX_RENDERED_LINES` cap policy and align all configs/docs | `state.ts`, `config.ts`, systemd unit, `README.md` | 4 | S–M |
| R5 | Document `/api/resync` and fix the MCP reference | `CLAUDE.md`, `copilot-instructions.md` | 2 | S |
| R6 | Add a minimal test runner + unit tests for pure modules | `package.json`, new test files for `logLineParser`/`logBuffer`/`filters`/`state`/`render` | several (new) | M |
| R7 | Split `main.ts` into modules and add an `init()` test seam | `src/client/main.ts` (+ new modules) | several | M–L |
| R8 | Tighten `tsconfig` (real `.mjs` checking; separate server/client `DOM` scope) | `tsconfig.json` (maybe a second config) | 1–2 | S |
| R9 | Batch of low-risk cleanups (dead code/vars/labels, redundant devDep, Node matrix, SVG/build polish, skill reconciliation) | many small | many | S each |

Suggested order: R1–R3 (robustness/security), then R4–R5 (the highest-value
doc/config consistency fixes), then R6 (unlocks safe change everywhere), then
R7–R9 as capacity allows.

## 4. Coverage confirmation

All 48 tracked files reached a non-⬜ status across phases 1–5. None were left
unreviewed.

| Phase | Files | Status |
|-------|-------|--------|
| 1 — Server core | 8 | ✅ all reviewed |
| 2 — Client | 7 | ✅ all reviewed |
| 3 — Build & config | 4 | ✅ all reviewed |
| 4 — CI/CD & deployment | 4 | ✅ all reviewed |
| 5 — Docs, meta & assets | 25 | ✅ all reviewed |
| **Total** | **48** | **✅ complete** |

Correction recorded during phase 5: the three `.serena/memories/*.md` files,
initially flagged as empty in the scaffold, were found to contain valid content
(no trailing newline caused `wc -l` to report 0 lines) and were reviewed as
populated.
