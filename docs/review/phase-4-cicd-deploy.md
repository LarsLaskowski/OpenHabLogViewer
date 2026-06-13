# Phase 4 — CI/CD & deployment

Scope: GitHub Actions, dependency updates, systemd deployment. 4 files.

**Phase status:** ⬜ Not yet reviewed

See [`00-criteria.md`](./00-criteria.md) for K1–K8 definitions.

---

### `.github/workflows/ci.yml` (56 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Build/typecheck pipeline, Node version, trigger events, action
pinning, permissions.

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

### `.github/workflows/release.yml` (107 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Release automation, versioning, artifact publishing, token
scope and permissions, action pinning.

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

### `.github/dependabot.yml` (21 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Update ecosystems, schedule, grouping, scope.

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

### `deploy/systemd/openhab-log-viewer.service` (23 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Linux/systemd install rooted at `/opt/openhab-log-viewer`,
user/permissions, hardening directives, paths to `/var/log/openhab/*`.

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
