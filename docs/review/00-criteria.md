# Review criteria (K1–K8)

Every file is scored against the same eight criteria so results stay comparable.
For each criterion, assign a status (✅ / ⚠️ / ❌) and list concrete findings with
line references where possible. Not every criterion applies to every file (for
example, K6 Performance rarely applies to a Markdown file) — mark those as
"n/a".

## K1 — Purpose & responsibility
What does the file do, and what is its role in the architecture? Does it have a
single clear responsibility, or is it doing too much? Is it still needed at all
(dead file)?

## K2 — Correctness & bugs
Logic errors, off-by-one mistakes, race conditions, unhandled error paths,
missing edge cases (empty input, rotation, truncation, reconnect), incorrect
assumptions about file or network state.

## K3 — Security
Input validation, path traversal, rate limiting, exposure of secrets, SSE and
Express hardening, safe handling of untrusted log content, dependency risk.
Note: built-in auth is intentionally out of scope per `CLAUDE.md`.

## K4 — Architecture & conventions
Compliance with the rules in `.claude/CLAUDE.md`:
- Server (`src/server`) and framework-free client (`src/client`) separation.
- `LogLine`, `SourceStatus`, `BootstrapResponse` shapes kept in parallel in
  `src/server/types.ts` and `src/client/state.ts` (no shared module).
- Client defaults centralized in `createInitialState()`.
- Every physical log line stays its own visible UI row; continuation lines are
  not merged.
- Source differentiation via badges/status cards, not whole-row styling.
- Light theme default, dark theme selectable.
- Deployment shape preserved (`dist/server/index.cjs`, `dist/client`, systemd).

## K5 — Maintainability & readability
Complexity, duplication, naming, dead code, comment quality, function/file size,
testability of the structure.

## K6 — Performance
Behavior under live updates, buffer and render limits
(`CLIENT_MAX_RENDERED_LINES`), polling efficiency, memory growth, DOM churn.

## K7 — Tests & verifiability
Test coverage (the repo currently has **no test script**), build/typecheck
integration, how easily the file's behavior can be verified.

## K8 — Documentation & accuracy
Does the file (or its documentation) match the actual code? Outdated README
sections, stale config values, missing or empty docs, English-only requirement
for user-facing text.
