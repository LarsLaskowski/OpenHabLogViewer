# Client Performance Optimization Plan

## Problem statement

The browser client becomes sluggish during long-running sessions and when the user returns to a tab that has been open for hours. The current behavior suggests that the client spends too much time rebuilding the DOM, filtering and reordering a bounded in-memory buffer, processing live updates one event at a time on the main thread, and handling bootstrap/resume payloads that can be much larger than the effective client retention window.

This plan focuses on reducing client-side memory pressure, improving tab-resume usability, and lowering render cost while preserving the current product behavior:

- Every physical log file line remains its own visible row.
- The UI stays framework-free unless profiling proves that the current approach cannot meet the targets.
- Source status, reconnect state, pause, clear, filtering, theme, and order controls remain available.
- Small server/API changes are in scope only when they directly enable client-side performance gains.

## Current-state analysis

### Observed hotspots in the current code

1. `src/client/render.ts`
   - `renderLogLines()` clears `#log-container` via `target.textContent = ''` and rebuilds the full list on every render.
   - Each render recreates every row and every cell, even when only one new line arrived.

2. `src/client/main.ts`
   - Every `log-line` SSE event pushes a line into `state.lines` and immediately calls `renderLogLines(...)` when the UI is not paused.
   - `getDisplayLines()` recomputes the filtered array on every render and reverses it for the default `newest-first` mode.
   - Search input persists preferences and triggers a full render on every keystroke.
   - The client keeps a bounded array, but trimming uses `splice(0, overflow)`, which repeatedly shifts the array.

3. `src/client/filters.ts`
   - Filtering is a full scan over the current client buffer for every render.

4. `src/server/routes.ts`, `src/server/logBuffer.ts`, `src/server/config.ts`
   - `/api/bootstrap` returns the full shared server buffer.
   - The server default buffer is `MAX_BUFFERED_LINES = 2000`, while the client default is `CLIENT_MAX_RENDERED_LINES = 500`.
   - The client slices the payload after download and JSON parsing, so initial load can still be much heavier than the visible client limit.

5. No existing batching or visibility-aware behavior
   - There is no use of `requestAnimationFrame`, input debouncing, `visibilitychange`, or incremental DOM updates in the client.
   - A background tab can therefore continue to accumulate work in a way that is expensive to catch up on when the user returns.

## Working assumptions and decisions

These decisions remove open scope questions for implementation planning:

1. We will optimize the current framework-free client first rather than introducing a UI framework.
2. We will preserve current UX semantics unless a change is explicitly called out and justified by measurement.
3. We will allow narrowly scoped server/API adjustments when they directly reduce client startup or resume cost.
4. We will treat "switching back to the page after hours" as a first-class scenario, not only steady-state live streaming.

## Target outcomes

The implementation should aim for the following outcomes:

- Bounded retained client memory with materially lower allocation and GC churn during long-running sessions.
- Fast recovery when returning to a backgrounded tab.
- Noticeably lower main-thread work during live updates.
- No full-list DOM rebuild for the common case of appending or trimming a few lines.
- Predictable startup cost that aligns with the effective client-side line limit.

## Implementation strategy

The work should be delivered in phases so each step provides measurable value and can be reviewed independently.

### Phase 1 - Establish a measurable baseline

Goal: make the bottlenecks reproducible and visible before changing behavior.

Planned work:

1. Add lightweight client-side instrumentation around:
   - SSE ingestion rate
   - filter computation time
   - render scheduling time
   - DOM update time
   - hidden-tab resume time
2. Define reproducible scenarios:
   - initial bootstrap with a large buffer
   - steady live streaming
   - background tab for an extended period, then return
   - active text filtering while updates are arriving
3. Record the baseline using browser profiling tools and keep the instrumentation behind a development-only flag or a very small internal helper.

Why first:

- It prevents optimizing the wrong path.
- It gives a senior reviewer concrete before/after evidence.

### Phase 2 - Remove avoidable main-thread churn

Goal: eliminate redundant work without changing the overall rendering model yet.

Planned work:

1. Add a render scheduler in `src/client/main.ts`
   - Queue incoming log lines.
   - Coalesce DOM work with `requestAnimationFrame`.
   - Ensure multiple SSE events within one frame trigger a single render pass.

2. Debounce expensive user-driven rerenders
   - Debounce the text filter input.
   - Debounce or batch preference persistence so `localStorage` is not written on every keystroke.

3. Cache cheap filter keys and derived display state
   - Precompute or cache normalized search text for each line at ingestion time when it measurably helps filtering.
   - Stop recomputing filtered/reversed arrays when unrelated state changes.
   - Recompute only when lines, filters, or order actually changed.

4. Align bootstrap cost with the effective client limit
   - Avoid downloading and parsing far more lines than the client will retain.
   - Ensure the server can return a payload that matches the client’s active retention policy.

5. Reduce avoidable copying
   - Remove repeated full-array reversal in the hot path where possible.
   - Prepare the code for incremental prepend/append behavior instead of recomputing the whole displayed list each time.

Acceptance focus:

- Live streaming no longer causes one full render per SSE event.
- Typing in the search field no longer blocks the UI due to repeated full renders and synchronous storage writes.

### Phase 3 - Improve hidden-tab and reconnect recovery

Goal: make long-idle return and reconnect behavior fast without replaying unnecessary UI work.

Planned work:

1. Add visibility-aware client behavior
   - Detect when the tab is hidden.
   - Avoid unnecessary render work while hidden.
   - On visibility restore, process accumulated data in a controlled way rather than replaying many expensive renders.

2. Add cursor-based resync using the existing `LogLine.id`
   - Introduce a small API path that can return lines `afterId` with a server-side `limit`.
   - Use it for reconnect and hidden-tab recovery when the client may have missed or intentionally skipped incremental UI work.

3. Add a capped catch-up strategy
   - If the backlog is large, prefer a bounded refresh path over replaying many intermediate UI states.
   - Keep the result aligned with the active client retention window.

4. Re-profile after Phases 2 and 3
   - Compare initial load, steady streaming, active filtering, and hidden-tab resume again.
   - Decide with evidence whether the remaining bottleneck is still DOM-update cost, client-buffer churn, or something else.

Acceptance focus:

- Returning to the tab after a long idle period should feel comparable to a fresh load, not like replaying hours of UI updates.
- Reconnect and resume paths should be bounded by server-side limits and current client retention semantics.

### Phase 4 - Conditionally make rendering incremental

Goal: stop rebuilding the whole log DOM for small updates if profiling still shows DOM work as the dominant cost.

Planned work:

1. Refactor `renderLogLines()` in `src/client/render.ts`
   - Introduce incremental append/prepend/prune operations keyed by `line.id`.
   - Preserve existing row layout and continuation-line behavior.

2. Preserve scroll behavior explicitly
   - Keep current semantics for `auto-scroll`, `newest-first`, and `oldest-first`.
   - Use anchored scroll restoration instead of relying on a full rerender baseline.

3. Keep the implementation narrow
   - Optimize the hot path for append/prune operations.
   - Fall back to a full refresh only when filters or ordering fundamentally change.

Acceptance focus:

- Appending one line should update only the affected DOM edge and any required trim operations.
- Changing filters may still require a larger update, but steady-state streaming must no longer rebuild the full list.

### Phase 5 - Optional retention-structure changes and virtualization

Goal: keep a more aggressive option available without committing to it prematurely.

Planned work:

1. If profiling still shows measurable churn from front-trimming the client buffer, replace the array-front trim with a ring-buffer or deque-style structure.
2. Re-profile again.
3. Only if needed, implement windowed rendering for the log list while preserving:
   - one visible row per physical log line
   - correct scroll anchoring
   - copy/inspect usability
4. Keep these as the last structural steps because they add complexity to a currently simple DOM model.

Decision rule:

- Do not introduce virtualization unless batching, capped bootstrap/resync, and any targeted incremental rendering still fail the performance targets.

## Cross-cutting constraints

- Keep client and server payload shapes aligned when any API contract changes are introduced.
- Preserve visible source and connection status feedback.
- Keep the solution dependency-light and consistent with the current framework-free architecture.
- Avoid broad rewrites; each phase should be small enough to validate independently.

## Risks and mitigations

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Scroll regressions | The app supports two order modes and optional auto-scroll. | Introduce scroll-anchor tests and explicit acceptance checks for both order modes. |
| Hidden-tab catch-up logic drops useful context | Users still need the most recent, relevant lines after a long idle period. | Use a bounded catch-up policy tied to the client retention window and verify it with real scenarios. |
| Incremental DOM code becomes brittle | Manual DOM diffing can become harder to reason about than full rerendering. | Keep the update model narrow: append, prune, full refresh only when filters/order fundamentally change. |
| Bootstrap/API changes drift from current types | The client/server types are maintained in parallel. | Update both `src/server/types.ts` and `src/client/state.ts` together. |
| Premature virtualization adds complexity | The current app is intentionally lightweight. | Gate virtualization behind profiling results after simpler fixes land. |

## Validation plan

Validation should cover both performance and behavior:

1. Baseline and after-change profiling for:
   - initial load
   - steady streaming
   - hidden-tab resume
   - active filtering
   - reconnect after missed updates
2. Behavioral verification for:
   - newest-first and oldest-first ordering
   - auto-scroll on/off
   - pause/unpause
   - clear buffer
   - source status visibility
3. Build validation using the existing repository commands:
   - `npm run typecheck`
   - `npm run build`

## Suggested execution order

1. Baseline instrumentation and reproducible scenarios
2. Render scheduling and input/storage debouncing
3. Bootstrap/API alignment and cursor-based resync
4. Derived-state caching
5. Visibility-aware catch-up
6. Re-profile and decide whether incremental DOM changes are still necessary
7. If required, implement incremental DOM updates
8. Re-profile and decide whether ring-buffer changes or virtualization are still necessary

## Todo list for execution tracking

1. Measure current client hot paths, reconnect behavior, and hidden-tab resume behavior.
2. Implement render batching and debounce hot user interactions.
3. Align bootstrap/API payload size with the effective client retention window.
4. Add cursor-based resync using `LogLine.id` and a capped `limit`.
5. Introduce cached derived display state and cheap filter keys where profiling supports it.
6. Add visibility-aware catch-up behavior for long-idle tabs.
7. Re-profile and decide whether incremental DOM updates are still needed.
8. If needed, refactor log rendering to incremental DOM updates.
9. Re-profile and decide whether a ring buffer or virtualization is still needed.

## Reviewer summary

This plan intentionally starts with measurement, then removes redundant work, then fixes oversized bootstrap/resume paths, and only then considers heavier structural techniques. That sequence fits the current codebase, preserves the framework-free design, and directly addresses the two symptoms described by the user: allocation/GC churn during long sessions and poor usability when returning to a tab after long runtimes.
