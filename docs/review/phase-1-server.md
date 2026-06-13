# Phase 1 — Server core

Scope: `src/server/*` — the heart of the app (data flow, security, error
handling). 8 files.

**Phase status:** ⬜ Not yet reviewed

See [`00-criteria.md`](./00-criteria.md) for K1–K8 definitions.

---

### `src/server/index.ts` (146 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Composition root — config load, shared singletons, tailer
startup order, serving the built client.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K2 Correctness & bugs | ⬜ | _to be completed_ |
| K3 Security | ⬜ | _to be completed_ |
| K4 Architecture & conventions | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K6 Performance | ⬜ | _to be completed_ |
| K7 Tests & verifiability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `src/server/config.ts` (92 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Env-var overrides, defaults, validation of paths and limits.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K2 Correctness & bugs | ⬜ | _to be completed_ |
| K3 Security | ⬜ | _to be completed_ |
| K4 Architecture & conventions | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K6 Performance | ⬜ | _to be completed_ |
| K7 Tests & verifiability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `src/server/logTailer.ts` (357 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** File watching/polling, last-N bootstrap read, tailing,
missing-file / permission / rotation / truncation detection, `SourceStatus`
emission.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K2 Correctness & bugs | ⬜ | _to be completed_ |
| K3 Security | ⬜ | _to be completed_ |
| K4 Architecture & conventions | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K6 Performance | ⬜ | _to be completed_ |
| K7 Tests & verifiability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `src/server/logLineParser.ts` (104 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Header vs. continuation line logic, inherited timestamp /
level / logger / group context.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K2 Correctness & bugs | ⬜ | _to be completed_ |
| K3 Security | ⬜ | _to be completed_ |
| K4 Architecture & conventions | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K6 Performance | ⬜ | _to be completed_ |
| K7 Tests & verifiability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `src/server/logBuffer.ts` (46 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Ring buffer behavior, capacity limits, eviction.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K2 Correctness & bugs | ⬜ | _to be completed_ |
| K3 Security | ⬜ | _to be completed_ |
| K4 Architecture & conventions | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K6 Performance | ⬜ | _to be completed_ |
| K7 Tests & verifiability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `src/server/sseHub.ts` (112 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** SSE client registry, broadcast, heartbeat, disconnect
cleanup, backpressure.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K2 Correctness & bugs | ⬜ | _to be completed_ |
| K3 Security | ⬜ | _to be completed_ |
| K4 Architecture & conventions | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K6 Performance | ⬜ | _to be completed_ |
| K7 Tests & verifiability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `src/server/routes.ts` (188 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** `/api/health`, `/api/bootstrap`, `/api/stream`; rate limiting,
input handling, response shape vs. client expectations.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K2 Correctness & bugs | ⬜ | _to be completed_ |
| K3 Security | ⬜ | _to be completed_ |
| K4 Architecture & conventions | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K6 Performance | ⬜ | _to be completed_ |
| K7 Tests & verifiability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `src/server/types.ts` (80 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** `LogLine`, `SourceStatus`, `BootstrapResponse` shapes; must
stay in parallel with `src/client/state.ts`.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K2 Correctness & bugs | ⬜ | _to be completed_ |
| K3 Security | ⬜ | _to be completed_ |
| K4 Architecture & conventions | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K6 Performance | ⬜ | _to be completed_ |
| K7 Tests & verifiability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_
