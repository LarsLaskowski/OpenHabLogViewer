# How to create unit tests for OpenHab Log Viewer

## Overview

This document describes how unit tests are written in this repository. It is
**binding** for both human contributors and AI agents: new tests must follow
the conventions below, and existing tests are the reference implementation —
when in doubt, look at a neighboring `*.test.ts` file before inventing a new
pattern.

**Unit tests are mandatory for newly written code.** A pull request that adds
or changes behavior in `src/server` or `src/client` without a corresponding
test is not complete — see [When tests are required](#when-tests-are-required).

## Unit tests vs. other test types

1. **Unit tests**

   A test that exercises an individual function, class, or DOM-free module in
   isolation — `LogBuffer`, `LogLineParser`, `DerivedLogView`, the filter
   predicates, the preference (de)serialization. Inputs and outputs only;
   real collaborators, no network, no filesystem.

2. **Integration-style tests**

   Some tests exercise a real collaborator instead of mocking it, because the
   behavior under test *is* the integration:

   - `routes.test.ts` builds a real `express()` app with the real
     `createApiRouter()`, starts it on an ephemeral port (`app.listen(0)`),
     and drives it with real `fetch()` calls.
   - `logTailer.test.ts` runs `LogTailer` against real files in a temporary
     directory (`mkdtempSync(path.join(os.tmpdir(), 'ohlv-tailer-'))`),
     writing/appending/renaming/truncating real files to exercise rotation,
     truncation, and permission handling.
   - `main.test.ts` and `render.test.ts` run the client modules against a
     real DOM provided by `jsdom`, including loading the actual
     `src/client/index.html` in `main.test.ts` so the test cannot silently
     diverge from the shipped markup.

3. **Load tests**

   OpenHab Log Viewer does not currently have load tests.

## Why unit test?

- **Fast feedback.** The whole suite runs in seconds via Node's built-in test
  runner — no external services, no browser to launch (jsdom runs in-process).
- **Protection against regression.** Log tailing, rotation/truncation
  detection, SSE resync, and the visibility/reconnect state machine in
  `main.ts` are exactly the kind of asynchronous, stateful logic that is easy
  to silently break; the suite is what catches that. Several tests exist
  specifically as regressions for a fixed issue (e.g. `main.test.ts`'s
  server-restart recovery test references
  [#130](https://github.com/LarsLaskowski/OpenHabLogViewer/issues/130)) —
  follow that pattern for new bug fixes.
- **Executable documentation.** A well-named `describe`/`it` pair tells the
  reader what a module does for a given scenario without reading its
  implementation.
- **Feeds SonarQube.** `npm run coverage:lcov` produces the coverage report
  CI uploads to SonarQube Cloud (`.github/workflows/ci.yml`); untested new
  code shows up there as a quality-gate risk.

## Test stack

| Concern | Tooling |
| --- | --- |
| Test runner | Node's built-in test runner (`node --import tsx --test`), via `describe`/`it` from `node:test` |
| Assertions | `node:assert/strict` only — no Chai, Jest, or Vitest assertion libraries |
| Mocking | None. No Sinon/Jest mocks/`node:test`'s `mock` module. Exercise real objects (`LogBuffer`, `LogLineParser`, a real `express()` app, real temp files) instead; where a real framework object cannot be constructed directly (an Express `Response` in `sseHub.test.ts`), write a small hand-rolled fake class that implements only the surface under test |
| DOM | `jsdom`, installed as `globalThis.document`/`globalThis.window`-equivalents before importing the module under test |
| HTTP | Node's global `fetch` against a real server bound to an ephemeral port (`app.listen(0)`) — not a mocked HTTP layer |
| Filesystem | Real temporary directories/files via `node:fs` and `node:os.tmpdir()`, always cleaned up in a `finally` block |
| Code coverage | Node's `--experimental-test-coverage`; `npm run coverage:lcov` adds an `lcov` reporter to `coverage/lcov.info` for SonarQube |

Do not introduce Jest, Vitest, Mocha/Chai, Sinon, or any mocking library —
this project standardizes on Node's built-in test runner and `assert/strict`,
exercising real collaborators wherever practical.

## Where tests live

- Tests are **colocated** with the module they cover:
  `src/server/logBuffer.ts` → `src/server/logBuffer.test.ts`,
  `src/client/render.ts` → `src/client/render.test.ts`. There is no separate
  test project or `__tests__` directory.
- `npm test` runs exactly `src/server/*.test.ts` and `src/client/*.test.ts`
  (see the `test` script in `package.json`) — a test file placed anywhere
  else is not picked up.
- There are no separate fixture files on disk; sample data is built inline
  with small factory helpers (see [Arranging your tests](#arranging-your-tests)).

## Naming your tests

- **File name**: `{moduleUnderTest}.test.ts`, next to `{moduleUnderTest}.ts`.
- **`describe` block**: the name of the class, function, or route group under
  test — e.g. `describe('LogBuffer', …)`, `describe('GET /api/bootstrap', …)`,
  `describe('renderConnectionStatus', …)`, `describe('DerivedLogView', …)`.
  For a module exposing several independently testable exports, use one
  `describe` per export rather than one giant block for the whole file.
- **`it` block**: a plain-English sentence describing the observable behavior
  under a specific scenario, written so it reads naturally after "it" — e.g.
  `it('evicts the oldest lines beyond capacity while keeping ids stable', …)`,
  `it('reports a missing status when the file does not exist', …)`,
  `it('returns only the status by default (no host details)', …)`. Reference
  an issue number in parentheses when the test is a regression test for a
  specific bug, e.g.
  `it('recovers from a server restart line-id reset without dropping new lines (issue #130)', …)`.

## Arranging your tests

Follow Arrange, Act, Assert without labeling the sections with comments — a
blank line before the act and before the assert block is enough to separate
them:

```ts
it('assigns monotonically increasing ids starting at 1', () => {
  const buffer = new LogBuffer(10);

  const a = buffer.push(draft());
  const b = buffer.push(draft());

  assert.equal(a.id, 1);
  assert.equal(b.id, 2);
});
```

### Prefer factory helpers with overrides over constructor/`beforeEach` setup

Build a small factory function per test file that returns a fully valid
object for the type under test, taking a `Partial<T>` of overrides so each
test only states what actually varies:

```ts
function draft(overrides: Partial<LogLineDraft> = {}): LogLineDraft {
  return {
    source: 'events',
    fileName: 'events.log',
    rawLine: 'x',
    receivedAt: '2026-01-01T00:00:00.000Z',
    isTimestamped: true,
    timestamp: '2026-01-01T00:00:00.000Z',
    level: 'INFO',
    logger: 'logger',
    message: 'x',
    isContinuation: false,
    groupId: 'events-1',
    ...overrides
  };
}
```

This is the established pattern across the suite (`draft()` in
`logBuffer.test.ts`/`routes.test.ts`, `baseConfig()` in `routes.test.ts`,
`header()`/`continuation()` in `render.test.ts`, `makeLine()` in
`main.test.ts`, `makeHarness()` in `logTailer.test.ts`). Do not introduce a
`beforeEach` hook to build shared state when a factory function achieves the
same isolation more explicitly at each call site.

### Use a harness object for stateful integration-style tests

When a test needs a running collaborator (a `LogTailer` writing to a real
temp file, an `express()` app on a real port), build it through a small
`makeHarness()`/`startApp()` helper that returns everything the test needs
plus a `close()`/`cleanup()` function, and always release it in a `finally`
block:

```ts
const h = makeHarness();
try {
  writeFileSync(h.filePath, 'a\nb\nc\n');
  const initial = await h.tailer.start();

  assert.deepEqual(initial.map((l) => l.rawLine), ['a', 'b', 'c']);
} finally {
  await cleanup(h);
}
```

This guarantees temp directories are removed, tailers are stopped, and
`SseHub`/HTTP servers are closed even when an assertion throws.

### Parameterizing multiple inputs

Node's test runner has no built-in equivalent of a `[DataRow]`/table-test
attribute. The established pattern is a small array of cases iterated with a
plain `for...of` loop inside a single `it`, when every case exercises the
same behavior:

```ts
const cases: [ConnectionState, string][] = [
  ['connected', 'Connected'],
  ['reconnecting', 'Reconnecting'],
  ['error', 'Connection failed'],
  ['connecting', 'Connecting']
];
for (const [stateValue, label] of cases) {
  const el = document.createElement('div');
  renderConnectionStatus(el, stateValue);
  assert.equal(el.textContent, label);
}
```

Prefer this over duplicating near-identical `it` blocks. If the cases exercise
meaningfully different scenarios (not just different input values for the
same assertion shape), give each its own `it` instead.

## Testing DOM-touching client code

Client modules that touch `document` (`render.ts`, `dom.ts`, and `main.ts`
indirectly) require `jsdom` to be installed as the global `document` **before**
the module under test is imported, since those modules read `document` at
call time (or, for `main.ts`, at module-evaluation time when resolving
control elements):

```ts
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document as unknown as Document;
```

`main.test.ts` goes one step further and loads the real
`src/client/index.html` via `readFileSync` so the element-id lookups in
`main.ts` are checked against the actual shipped markup rather than a
hand-written stand-in, and stubs `requestAnimationFrame` synchronously since
jsdom does not implement it.

`main.ts` deliberately separates `init()` (called by `entry.ts`, starts
bootstrap/SSE) from module import (no side effects), and exports a
test-only `__testables` object (state, `syncState`, and the pure
resync/append functions) specifically so `main.test.ts` can exercise
internal logic like `applyResyncPayload()` without a running server or a real
`EventSource`. Follow this pattern — a small `__testables` export — when
logic that needs testing is otherwise trapped in module scope and cannot be
reached through the public/DOM-facing surface alone.

## Testing routes and other Express-backed code

Do not mock `Request`/`Response`/the router. Build a real `express()` app
wired to the real router under test, start it on an ephemeral port, and drive
it with `fetch`:

```ts
const server = app.listen(0);
await new Promise<void>((resolve) => server.once('listening', resolve));
const { port } = server.address() as AddressInfo;
```

For code that only touches a narrow slice of the Express `Response` surface
(`SseHub`, which calls `write`/`end`/reads `writableLength`/`writableEnded`),
a small hand-rolled fake class implementing exactly that slice is acceptable
and is not considered a mocking library:

```ts
class FakeResponse {
  writes: string[] = [];
  writableLength = 0;
  writableEnded = false;

  write(payload: string): boolean {
    this.writes.push(payload);
    return true;
  }

  end(): void {
    this.writableEnded = true;
  }
}
```

## Testing filesystem-backed code

`LogTailer` tests use real files in a real temporary directory rather than
mocking `node:fs`. Use `mkdtempSync(path.join(os.tmpdir(), '<prefix>-'))` to
create an isolated directory per test harness, and remove it with
`rmSync(dir, { recursive: true, force: true })` in cleanup. Simulate rotation
with `renameSync`, truncation by re-writing a shorter file, and live appends
with `appendFileSync` followed by a short `delay()` for the poll/watch cycle
to pick it up (`LogTailer` in tests is constructed with a short
`pollIntervalMs`, e.g. `20`, so tests do not wait a full second per cycle).

When a test intentionally drives `LogTailer` into a state that could produce
an unhandled promise rejection (every `sync()` call is fire-and-forget in
production), capture rejections explicitly instead of letting them crash the
test process:

```ts
function captureUnhandledRejections(): { rejections: unknown[]; dispose: () => void } {
  const rejections: unknown[] = [];
  const listener = (reason: unknown): void => {
    rejections.push(reason);
  };
  process.on('unhandledRejection', listener);
  return { rejections, dispose: () => process.off('unhandledRejection', listener) };
}
```

## Assertions

Use `node:assert/strict`'s specific matchers over a generic boolean check:
`assert.equal`/`assert.deepEqual` for value/structural comparisons,
`assert.ok` for a plain truthy check (e.g. `classList.contains(...)`),
`assert.rejects`/`assert.throws` for error paths. Assertion messages are
**not** required in this codebase (unlike some other projects) — instead,
prefer a short comment above a non-obvious assertion explaining *why* that
value is expected, the way `logBuffer.test.ts` and `routes.test.ts` do:

```ts
// A cursor older than everything currently buffered returns all current lines.
assert.deepEqual(buffer.getItemsAfterId(0).map((line) => line.id), [1, 2, 3, 4, 5]);
```

## Avoid multiple acts

One logical action per test, followed by one or more related assertions on
its outcome. When a scenario needs several genuinely different behaviors
checked, split into separate `it` blocks rather than chaining multiple
act/assert cycles in one test.

## When tests are required

Unit tests are **mandatory** for newly written or changed code in `src/server`
and `src/client`:

- A new exported function, class, or route handler needs at least one test
  covering its primary behavior and, where relevant, its edge cases (empty
  input, boundary values, error paths) — mirror the existing coverage style
  for the module you are extending (e.g. `logBuffer.test.ts` covers eviction,
  wrap-around, and copy-safety, not just the happy path).
- A bug fix needs a regression test that fails without the fix and passes
  with it, named and commented to reference the issue if one exists (see
  [Naming your tests](#naming-your-tests)).
- A change to a shared payload shape (`src/server/types.ts` +
  `src/client/state.ts`, see
  [`ARCHITECTURE.md`](ARCHITECTURE.md#shared-payload-types-are-mirrored-not-imported))
  needs tests on both the server response shape and the client's handling of
  it, since nothing else enforces they stay in sync.
- Pure refactors with no behavior change do not need new tests, but must not
  reduce existing coverage — run `npm test` (and `npm run test:coverage`
  locally if in doubt) before opening the pull request.

This is also checked in the pull request template
(`.github/pull_request_template.md`) and should be called out explicitly by
reviewers per [`CONTRIBUTING.md`](CONTRIBUTING.md) when it is missing.

## Running tests

```shell
npm test
```

Runs `node --import tsx --test src/server/*.test.ts src/client/*.test.ts`.

With coverage:

```shell
npm run test:coverage
```

For the `lcov` report CI feeds into SonarQube:

```shell
npm run coverage:lcov
```

This writes `coverage/lcov.info`, consumed by the `sonarqube` job in
`.github/workflows/ci.yml`.

## Checklist for new tests

- [ ] Test file colocated as `{moduleUnderTest}.test.ts` next to the module it covers.
- [ ] `describe` named after the unit/route/component under test; `it` names read as a sentence describing the scenario and expected behavior.
- [ ] Arrange / Act / Assert, separated by blank lines, one logical act per test.
- [ ] No mocking library used — real objects, a real `express()` app + `fetch`, real temp files via `node:fs`/`node:os`, or a minimal hand-rolled fake only for a narrow framework surface (e.g. `FakeResponse`).
- [ ] Shared setup factored into a factory function with `Partial<T>` overrides (or a `makeHarness()`/`startApp()` helper for stateful tests), not a `beforeEach` hook.
- [ ] Stateful resources (tailers, SSE hubs, HTTP servers, temp directories) are released in a `finally` block.
- [ ] DOM-touching tests install `jsdom` as `globalThis.document` before importing the module under test.
- [ ] `node:assert/strict` matchers used (`equal`/`deepEqual`/`ok`/`rejects`/`throws`), with a short explanatory comment above any non-obvious assertion.
- [ ] `npm test` passes locally before opening the pull request.
