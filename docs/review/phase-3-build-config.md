# Phase 3 — Build & config

Scope: build pipeline and project configuration. 4 files.

**Phase status:** ⬜ Not yet reviewed

See [`00-criteria.md`](./00-criteria.md) for K1–K8 definitions.

---

### `scripts/build.mjs` (52 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** esbuild bundling of `src/server/index.ts` and
`src/client/main.ts`, recreation of `dist/`, copy of `index.html`, `styles.css`,
SVG assets. Output shape must match `dist/server/index.cjs` + `dist/client`.

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

### `package.json` (26 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Scripts (`typecheck`, `build`, `start`), dependency choices,
`engines.node >=20`, absence of test/lint scripts.

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

### `package-lock.json` (1478 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Dependency integrity, version pinning, known-vulnerable
transitive packages, consistency with `package.json`.

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

### `tsconfig.json` (15 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Compiler options, strictness, module/target settings,
typecheck scope.

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
