# Phase 5 — Docs, meta & assets

Scope: documentation, repository meta/config, tooling, and static assets.
25 files. This phase has the most files; consider splitting it into sub-prompts
(docs, GitHub meta, Claude/Serena tooling, assets) if needed.

**Phase status:** ⬜ Not yet reviewed

See [`00-criteria.md`](./00-criteria.md) for K1–K8 definitions.

> Note: three `.serena/memories/*.md` files are **0 bytes (empty)** in the repo
> snapshot — flagged for verification below.

---

### `README.md` (245 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Accuracy vs. current code/config, install/run steps, env vars,
screenshots.

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

### `SECURITY.md` (54 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Disclosure policy, supported versions, alignment with the
"auth out of scope / reverse proxy" stance.

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

### `docs/images/openhablogviewer.png` (binary)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Is the screenshot referenced, current, and reasonably sized?

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_ (other criteria n/a for a binary image)

---

### `.github/copilot-instructions.md` (44 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Consistency with `.claude/CLAUDE.md` conventions; no
contradictory guidance.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K4 Architecture & conventions | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `.github/ISSUE_TEMPLATE/bug_report.md` (32 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Completeness and usefulness of the bug template.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `.github/ISSUE_TEMPLATE/feature_request.md` (20 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Completeness and usefulness of the feature template.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `.github/skills/create-pr/SKILL.md` (37 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Correctness of the documented PR-creation workflow.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K2 Correctness & bugs | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `.github/skills/publish-pr/SKILL.md` (33 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Correctness of the documented PR-publish workflow; overlap
with `.claude/skills/publish-pr/prompt.md`.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K2 Correctness & bugs | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `.claude/CLAUDE.md` (39 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** The project's rule set — internal consistency and whether the
code actually follows it (cross-check against phases 1–2).

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K4 Architecture & conventions | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `.claude/settings.json` (28 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Hooks and permissions configuration; references to the
sonar-secrets hook scripts.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K2 Correctness & bugs | ⬜ | _to be completed_ |
| K3 Security | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `.claude/skills/publish-pr/prompt.md` (40 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Correctness; consistency with the `.github/skills` equivalents.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K2 Correctness & bugs | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `.claude/hooks/sonar-secrets/build-scripts/pretool-secrets.ps1` (5 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** What the pre-tool secrets hook does; cross-platform concern
(PowerShell in a Linux-targeted project).

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K2 Correctness & bugs | ⬜ | _to be completed_ |
| K3 Security | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `.claude/hooks/sonar-secrets/build-scripts/prompt-secrets.ps1` (5 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** What the prompt secrets hook does; same cross-platform concern.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K2 Correctness & bugs | ⬜ | _to be completed_ |
| K3 Security | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `.mcp.json` (11 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** MCP server configuration; any embedded secrets or risky scope.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K3 Security | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `.serena/project.yml` (140 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Serena tooling configuration; accuracy vs. the actual project.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K5 Maintainability & readability | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `.serena/.gitignore` (2 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Correct ignore scope for Serena cache.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `.serena/memories/suggested_commands.md` (5 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Commands match `package.json` scripts and `CLAUDE.md`.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `.serena/memories/completion_checklist.md` (0 lines — EMPTY)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** ⚠️ File is empty — decide whether to populate or remove.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `.serena/memories/project_overview.md` (0 lines — EMPTY)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** ⚠️ File is empty — decide whether to populate or remove.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `.serena/memories/style_conventions.md` (0 lines — EMPTY)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** ⚠️ File is empty — decide whether to populate or remove.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `.gitignore` (44 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Ignored paths (`dist/`, `node_modules/`, etc.); no accidental
tracking gaps or over-broad rules.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K3 Security | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `src/assets/openHAB_appicon.svg` (10 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Asset integrity, referenced by client, no embedded scripts.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K3 Security | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `src/assets/openHAB_darkBG_appicon.svg` (10 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Asset integrity, dark-background variant usage.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K3 Security | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `src/assets/openHAB_workswith.svg` (11 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Asset integrity, "works with" badge usage.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K3 Security | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_

---

### `src/assets/openHAB_workswith_darkBG.svg` (10 lines)

**Overall status:** ⬜ Not yet reviewed
**Review focus:** Asset integrity, dark-background "works with" variant.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ⬜ | _to be completed_ |
| K3 Security | ⬜ | _to be completed_ |
| K8 Documentation & accuracy | ⬜ | _to be completed_ |

**Summary:** _to be completed_
