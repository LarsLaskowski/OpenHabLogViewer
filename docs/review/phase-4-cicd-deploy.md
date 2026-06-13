# Phase 4 — CI/CD & deployment

Scope: GitHub Actions, dependency updates, systemd deployment. 4 files.

**Phase status:** ✅ Reviewed — CI/release pipelines show strong supply-chain
hygiene. Two hardening items: the systemd unit has no sandboxing, and the
release workflow interpolates an untrusted input into a shell script. Plus a
concrete confirmation of the phase-2 render-limit mismatch.

See [`00-criteria.md`](./00-criteria.md) for K1–K8 definitions.

**Top findings (priority order)**

1. ⚠️ `deploy/systemd/openhab-log-viewer.service` has **no hardening
   directives** (`NoNewPrivileges`, `ProtectSystem`, `ProtectHome`,
   `PrivateTmp`, `ReadOnlyPaths`, …). For a network-facing service that only
   needs to read two log files, this is a missed, easy win. Runs as a non-root
   `openhab` user, which is good but not enough.
2. ⚠️ `release.yml` interpolates `${{ github.event.inputs.tag }}` directly into
   a bash script (L46) *before* the SemVer validation runs — a GitHub Actions
   script-injection pattern. Exploitable only by users who can trigger
   `workflow_dispatch` (write access), but should be passed via an `env:` var.
3. ⚠️ The shipped systemd config sets `CLIENT_MAX_RENDERED_LINES=1500` (L14),
   but the client hard-caps at 500 (`state.ts`, phase-2 finding #2) — a concrete,
   in-the-box example of a configured value that silently does nothing.
4. ℹ️ Node version drift: CI builds on Node 20 & 22, but `release.yml` builds the
   published artifact on Node 24 (not in the CI matrix); a tag push triggers the
   release but not the CI workflow, so the release build is ungated.
5. ✅ Excellent supply-chain hygiene: all actions pinned to full commit SHAs,
   least-privilege `permissions`, `npm ci`, and `npm audit --omit=dev` (resolves
   the phase-3 follow-ups on reproducible installs and auditing).

---

### `.github/workflows/ci.yml` (56 lines)

**Overall status:** ✅ OK — clean, secure CI; minor version/redundancy notes.
**Review focus:** Build/typecheck pipeline, Node version, trigger events, action
pinning, permissions.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Two jobs: type-check & build across a Node matrix, and a production dependency audit. Clear. |
| K2 Correctness & bugs | ✅ | `npm ci` for reproducible installs; `typecheck` then `build` (note: `build` runs `typecheck` again, so the standalone typecheck step is redundant but harmless). `fail-fast: false` surfaces all matrix failures. |
| K3 Security | ✅ | Top-level `permissions: contents: read` (least privilege). Both actions pinned to full commit SHAs with version comments (`checkout` v6.0.3, `setup-node` v6.4.0). `npm audit --omit=dev --audit-level=high` gates on high-severity production vulns. Strong. |
| K4 Architecture & conventions | ⚠️ | Matrix Node 20 & 22 matches `engines.node >=20`, but `release.yml` builds on Node 24 — the released artifact is built on a version CI never exercises. Consider adding 24 to the matrix (or aligning the release Node version). |
| K5 Maintainability & readability | ⚠️ | The `audit` job repeats checkout + setup-node + `npm ci`; acceptable, but a composite/reusable step would cut duplication. |
| K6 Performance | ✅ | npm cache enabled; jobs are small. |
| K7 Tests & verifiability | ⚠️ | No test step (no tests exist) — build/typecheck is the only gate, consistent with earlier phases. |
| K8 Documentation & accuracy | ✅ | Steps match `package.json` scripts. |

**Summary:** A secure, well-pinned CI. Worth aligning the Node versions with the
release workflow and (eventually) adding a test job once tests exist.

---

### `.github/workflows/release.yml` (107 lines)

**Overall status:** ⚠️ Note — well-structured release; one input-injection hardening item.
**Review focus:** Release automation, versioning, artifact publishing, token
scope and permissions, action pinning.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Tag-driven release: validate SemVer tag, align `package.json`, build, package tar.gz + zip, publish a GitHub Release with generated notes. Excellent header documentation (L1–19). |
| K2 Correctness & bugs | ✅ | `set -euo pipefail` throughout; strict `^v[0-9]+\.[0-9]+\.[0-9]+$` validation; `npm version --no-git-tag-version --allow-same-version` edits the artifact's `package.json` without a commit; checkout uses `ref: tag` + `fetch-depth: 0` for notes. Logic is sound. |
| K3 Security | ⚠️ | **Script injection:** `TAG="${{ github.event.inputs.tag }}"` (L46) substitutes the raw dispatch input into the shell script text *before* the regex check, so a crafted input could break out of the assignment. Limited to users with `workflow_dispatch` (write) access, but should be passed through an `env:` variable and referenced as `"$TAG_INPUT"`. The later `${{ steps.tag.outputs.* }}` uses are safe (derived from the validated, digits-and-dots-only tag). `permissions: contents: write` is the minimum needed; actions are SHA-pinned (incl. `softprops/action-gh-release` v3.0.0); `concurrency` prevents overlapping releases. |
| K4 Architecture & conventions | ⚠️ | Packages `dist` + `deploy` + `package.json` + `README.md`, matching the documented deployment shape. Builds on Node 24 — not covered by the CI matrix (see `ci.yml`). |
| K5 Maintainability & readability | ✅ | Clear, well-commented steps. |
| K6 Performance | ✅ | Single job; npm cache. Fine. |
| K7 Tests & verifiability | ⚠️ | No test gate before publishing; relies on build success only. |
| K8 Documentation & accuracy | ✅ | The header comment accurately documents the tag/dispatch flow. |

**Summary:** A solid, well-documented release pipeline. The one real fix is to
stop interpolating `github.event.inputs.tag` into the shell directly — move it to
an `env:` var — and to reconcile the Node 24 build with the CI matrix.

---

### `.github/dependabot.yml` (21 lines)

**Overall status:** ✅ OK — sensible update automation.
**Review focus:** Update ecosystems, schedule, grouping, scope.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Weekly Dependabot for npm and github-actions ecosystems. Clear. |
| K2 Correctness & bugs | ✅ | Valid v2 config; groups `@types/*` into one PR and all github-actions updates into one PR; PR limit 10 each. |
| K3 Security | ✅ | Keeping SHA-pinned actions and npm deps current is good hygiene; the github-actions ecosystem updates will bump the pinned SHAs as new versions ship. |
| K4 Architecture & conventions | ✅ | Complements the minimal-deps + SHA-pinning approach. |
| K5 Maintainability & readability | ✅ | Concise. Production npm deps (e.g. `express`) get individual PRs (not grouped) — reasonable for a 2-dependency project. |
| K6 Performance | ✅ | n/a. |
| K7 Tests & verifiability | ✅ | Dependabot PRs are gated by CI (build/typecheck/audit). |
| K8 Documentation & accuracy | ✅ | Self-explanatory. |

**Summary:** No issues. Appropriate, low-noise update automation that pairs well
with the SHA-pinned workflows.

---

### `deploy/systemd/openhab-log-viewer.service` (23 lines)

**Overall status:** ⚠️ Note — functional unit, but no sandboxing and a misleading env value.
**Review focus:** Linux/systemd install rooted at `/opt/openhab-log-viewer`,
user/permissions, hardening directives, paths to `/var/log/openhab/*`.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Runs the built server as a `simple` service with auto-restart. Clear. |
| K2 Correctness & bugs | ✅ | `ExecStart=/usr/bin/node dist/server/index.cjs` with `WorkingDirectory=/opt/openhab-log-viewer` matches the build output; `Restart=always`/`RestartSec=5`; `After=network.target`; `EnvironmentFile=-…` (optional) is correct. |
| K3 Security | ⚠️ | Runs as non-root `User=openhab` (good), but there are **no hardening directives**. For a network-facing reader of two log files, add at least `NoNewPrivileges=true`, `ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true`, `ReadWritePaths=` (none needed) / `ReadOnlyPaths=/var/log/openhab`, and consider `RestrictAddressFamilies=AF_INET AF_INET6`, `CapabilityBoundingSet=`, `MemoryDenyWriteExecute=true`. The app never writes to disk, so a near-read-only sandbox is feasible. |
| K4 Architecture & conventions | ⚠️ | Env values diverge from app defaults intentionally (`MAX_BUFFERED_LINES=10000`, `INITIAL_LINES_PER_FILE=500`). But `CLIENT_MAX_RENDERED_LINES=1500` (L14) exceeds the client's hard cap of 500 (`state.ts`), so it is silently ineffective — a concrete instance of the phase-2 mismatch. Either lower it to ≤500 or raise the client cap. The TRUST_PROXY hint comment is correct. |
| K5 Maintainability & readability | ✅ | Compact and clear. |
| K6 Performance | ✅ | n/a. |
| K7 Tests & verifiability | ✅ | n/a — verified by deployment. |
| K8 Documentation & accuracy | ⚠️ | The `CLIENT_MAX_RENDERED_LINES=1500` value misrepresents what the client will actually render; align it with the documented cap. |

**Summary:** The unit works and correctly drops root, but should gain standard
systemd sandboxing directives, and `CLIENT_MAX_RENDERED_LINES` should be set to a
value the client honors (≤500) — or the cap raised — so the shipped config is
not misleading.
