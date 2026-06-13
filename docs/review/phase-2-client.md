# Phase 2 — Client

Scope: `src/client/*` — rendering, state, performance, UI conventions
(framework-free). 7 files.

**Phase status:** ⬜ Not yet reviewed

See [`00-criteria.md`](./00-criteria.md) for K1–K8 definitions.

---

### `src/client/main.ts` (1498 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Bootstrap from `/api/bootstrap`, localStorage preference
restore, `EventSource` connection, state layering. Largest file in the repo —
watch for over-broad responsibilities and split opportunities.

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

### `src/client/render.ts` (341 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Plain DOM rendering, one row per physical log line, source
badges, placeholder metadata cells for continuation lines.

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

### `src/client/performance.ts` (225 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Render limits, `CLIENT_MAX_RENDERED_LINES`, behavior under
sustained live updates.

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

### `src/client/state.ts` (118 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** `createInitialState()` as the single source of UI defaults;
client-side `LogLine` / `SourceStatus` / `BootstrapResponse` shapes mirroring
the server.

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

### `src/client/filters.ts` (52 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Filter logic correctness across level / logger / source / text.

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

### `src/client/styles.css` (417 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Light (default) and dark theme, source badge/status styling,
responsiveness, no whole-row source styling.

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

### `src/client/index.html` (103 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Markup structure, asset references (SVGs, styles), accessibility.

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
