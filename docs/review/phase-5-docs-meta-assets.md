# Phase 5 — Docs, meta & assets

Scope: documentation, repository meta/config, tooling, and static assets.
25 files.

**Phase status:** ✅ Reviewed — documentation is thorough and largely accurate,
assets are clean, and tooling config is reasonable. The notable items are a few
documentation inaccuracies (a wrong MCP path reference, the `/api/resync`
omission, and a third instance of the render-limit mismatch) plus a
Windows-only tooling assumption while the deploy target is Linux.

> **Correction to the scaffold:** the three `.serena/memories/*.md` files are
> **not** empty. `wc -l` reported 0 lines only because they have no trailing
> newline; each contains valid single-line content (244 / 427 / 395 bytes). They
> are reviewed as populated below.

See [`00-criteria.md`](./00-criteria.md) for K1–K8 definitions.

**Top findings (priority order)**

1. ⚠️ `.github/copilot-instructions.md` (L43) says `.vscode/mcp.json` configures
   the **Playwright** MCP server, but the repo ships `.mcp.json` at the root
   configuring **sonarqube**, and no `.vscode/mcp.json` is tracked. Wrong file
   path and wrong server.
2. ⚠️ `/api/resync` is omitted from both architecture docs (`CLAUDE.md` L19 and
   `copilot-instructions.md` L19) — same drift flagged in phase 1, now confirmed
   across two files.
3. ⚠️ `README.md` (L207) sets `CLIENT_MAX_RENDERED_LINES=1500` in its systemd
   example, but the client caps at 500 — the third instance of the mismatch
   (also in `state.ts` and the systemd unit).
4. ⚠️ Tooling is Windows-only (`.claude/settings.json` runs `powershell …ps1`;
   `.mcp.json` runs `sonar.exe`; the Serena memory says "Windows development
   commands"), while the runtime/deploy target is Linux. Internally consistent
   (Windows dev → Linux deploy) but the hooks/MCP will not run on a
   non-Windows dev machine.
5. ⚠️ Two diverging `publish-pr` definitions (`.github/skills` vs `.claude/skills`,
   the latter adds version-bump logic); all PR skills assume the `gh` CLI.
6. ✅ All four SVGs are script/handler/entity-free; `SECURITY.md` is solid;
   `.gitignore` is comprehensive.

---

### `README.md` (245 lines)

**Overall status:** ⚠️ Note — thorough and mostly accurate; one misleading example.
**Review focus:** Accuracy vs. current code/config, install/run steps, env vars,
screenshots.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Comprehensive user/operator doc: features, config table, build, usage, full systemd walkthrough, operating notes. |
| K2 Correctness & bugs | ✅ | Build/run/deploy steps match `package.json`, `build.mjs`, and the systemd unit. The config table values match `config.ts` defaults exactly. |
| K3 Security | ✅ | Clear reverse-proxy/auth guidance and `TRUST_PROXY` rationale (L34–36) consistent with the server implementation. |
| K4 Architecture & conventions | ✅ | Accurately describes per-line rendering, continuation rows, source distinction, theme/order defaults. |
| K5 Maintainability & readability | ✅ | Well-structured with anchored sections. |
| K6 Performance | ✅ | n/a. |
| K7 Tests & verifiability | ✅ | n/a (states the build/typecheck flow correctly). |
| K8 Documentation & accuracy | ⚠️ | The env-file example (L207) sets `CLIENT_MAX_RENDERED_LINES=1500`, which the client silently caps at 500 — align with the documented ceiling. Endpoints `/api/resync` is not mentioned (README doesn't enumerate endpoints, so minor). Otherwise accurate. |

**Summary:** A strong README. Fix the `1500` example so it doesn't advertise a
value the client ignores.

---

### `SECURITY.md` (54 lines)

**Overall status:** ✅ OK — clear, realistic policy.
**Review focus:** Disclosure policy, supported versions, alignment with the
"auth out of scope / reverse proxy" stance.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Reporting channel, supported versions, deployment guidance, in/out-of-scope list. |
| K2 Correctness & bugs | ✅ | Coherent; SLAs (5 business days / 30 days) stated. |
| K3 Security | ✅ | Recommends read-only log access and no direct internet exposure (L37–38) — matches the phase-4 systemd-hardening recommendation. Scope explicitly covers path traversal and info disclosure. |
| K4 Architecture & conventions | ✅ | Consistent with the deliberate no-auth design. |
| K5 Maintainability & readability | ✅ | Concise. |
| K8 Documentation & accuracy | ✅ | Matches the app's actual security posture. |

**Summary:** No issues. Note that the read-only access it recommends is not yet
enforced by the systemd unit (phase-4 item).

---

### `docs/images/openhablogviewer.png` (binary)

**Overall status:** ✅ OK — referenced and reasonable.
**Review focus:** Is the screenshot referenced, current, and reasonably sized?

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Product screenshot referenced from `README.md` L5 with valid relative path. |
| K8 Documentation & accuracy | ✅ | Path resolves; no broken-link risk. Verify visually that it reflects the current UI on any major redesign. |

**Summary:** Fine (other criteria n/a for a binary image).

---

### `.github/copilot-instructions.md` (44 lines)

**Overall status:** ⚠️ Note — mostly mirrors `CLAUDE.md`; one wrong MCP reference.
**Review focus:** Consistency with `.claude/CLAUDE.md` conventions; no
contradictory guidance.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Copilot variant of the project guide; closely parallels `CLAUDE.md`. |
| K2 Correctness & bugs | ⚠️ | L43 references `.vscode/mcp.json` and the **Playwright** MCP server, but the repo has `.mcp.json` (root) configuring **sonarqube** and no `.vscode/mcp.json`. Either add the referenced file or correct the text. |
| K4 Architecture & conventions | ⚠️ | L19 lists routes as `/api/health`, `/api/bootstrap`, `/api/stream`, omitting `/api/resync` (same drift as `CLAUDE.md`). |
| K5 Maintainability & readability | ⚠️ | Duplicates most of `CLAUDE.md`; the two must be kept in sync manually, which is how the `/api/resync` omission persists in both. |
| K8 Documentation & accuracy | ⚠️ | The MCP reference and the route list are both inaccurate. |

**Summary:** Bring the route list in line (add `/api/resync`) and fix the MCP
reference (`.mcp.json` / sonarqube, not `.vscode/mcp.json` / Playwright).

---

### `.github/ISSUE_TEMPLATE/bug_report.md` (32 lines)

**Overall status:** ✅ OK — standard template.
**Review focus:** Completeness and usefulness of the bug template.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Standard GitHub bug template with repro/expected/environment sections. |
| K5 Maintainability & readability | ✅ | Clear. Minor: the "Desktop … OS: [e.g. iOS]" example is slightly off for a desktop section, and `labels` is empty (a default `bug` label would help triage). |
| K8 Documentation & accuracy | ✅ | Generic but appropriate for a web app. |

**Summary:** Fine; optionally add a default `bug` label.

---

### `.github/ISSUE_TEMPLATE/feature_request.md` (20 lines)

**Overall status:** ✅ OK — standard template.
**Review focus:** Completeness and usefulness of the feature template.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Standard problem/solution/alternatives/context template. |
| K5 Maintainability & readability | ✅ | Clear. Empty `labels` (an `enhancement` default would help). |
| K8 Documentation & accuracy | ✅ | Appropriate. |

**Summary:** Fine; optionally add a default `enhancement` label.

---

### `.github/skills/create-pr/SKILL.md` (37 lines)

**Overall status:** ✅ OK — thorough workflow; `gh`-dependent.
**Review focus:** Correctness of the documented PR-creation workflow.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Branch-first PR creation workflow with safety rules. |
| K2 Correctness & bugs | ⚠️ | Step 8 uses the GitHub CLI (`gh`). In environments without `gh` (e.g. Claude Code on the web, which uses GitHub MCP tools), this skill cannot run as written — environment-dependent. |
| K5 Maintainability & readability | ✅ | Clear, well-sequenced, good guard rails. |
| K8 Documentation & accuracy | ✅ | Internally consistent. |

**Summary:** Solid local-Git workflow; note the `gh` dependency for non-CLI
environments.

---

### `.github/skills/publish-pr/SKILL.md` (33 lines)

**Overall status:** ⚠️ Note — duplicate name diverging from the `.claude` version.
**Review focus:** Correctness of the documented PR-publish workflow; overlap
with `.claude/skills/publish-pr/prompt.md`.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Branch → commit → push → PR → back to main. |
| K2 Correctness & bugs | ⚠️ | Also `gh`-dependent (same caveat as create-pr). |
| K5 Maintainability & readability | ⚠️ | Shares the name `publish-pr` with `.claude/skills/publish-pr/prompt.md` but has **different** content (this one has no version-bump logic). Two divergent definitions invite confusion over which is authoritative. |
| K8 Documentation & accuracy | ✅ | Internally consistent. |

**Summary:** Works, but reconcile or clearly differentiate the two `publish-pr`
skills.

---

### `.claude/CLAUDE.md` (39 lines)

**Overall status:** ⚠️ Note — the project rule set; one route omission.
**Review focus:** The project's rule set — internal consistency and whether the
code actually follows it.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Authoritative conventions doc; drives the whole review's K4 criterion. |
| K4 Architecture & conventions | ⚠️ | The code largely complies (verified across phases 1–2). One inaccuracy: L19 lists only `/api/health`, `/api/bootstrap`, `/api/stream` — `/api/resync` (implemented and used by the client) is missing. |
| K5 Maintainability & readability | ✅ | Clear, comprehensive conventions. |
| K8 Documentation & accuracy | ⚠️ | Add `/api/resync` to the routes description so the doc matches `routes.ts`. |

**Summary:** Excellent guide; the only fix is documenting `/api/resync`.

---

### `.claude/settings.json` (28 lines)

**Overall status:** ⚠️ Note — valid hooks; Windows-only.
**Review focus:** Hooks and permissions configuration; references to the
sonar-secrets hook scripts.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Registers PreToolUse(Read) and UserPromptSubmit hooks for secret scanning via the two `.ps1` scripts. |
| K2 Correctness & bugs | ⚠️ | The hook command is `powershell -NoProfile -File …ps1`. On a non-Windows dev host `powershell` is typically absent, so the hook command fails (the scripts themselves no-op when `sonar` is missing, but only if PowerShell runs at all). |
| K3 Security | ✅ | Wiring secret-scanning into Read and prompt submission is a sound defensive measure. No secrets in the file. |
| K5 Maintainability & readability | ✅ | Small and clear. |
| K8 Documentation & accuracy | ✅ | Paths match the actual `.ps1` locations. |

**Summary:** Reasonable secret-scanning hooks, but Windows-bound; consider a
cross-platform invocation if non-Windows dev is expected.

---

### `.claude/skills/publish-pr/prompt.md` (40 lines)

**Overall status:** ⚠️ Note — richer publish flow; diverges from the `.github` twin.
**Review focus:** Correctness; consistency with the `.github/skills` equivalents.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Publish-PR workflow that additionally computes a SemVer bump from diff size (steps 3–5). |
| K2 Correctness & bugs | ⚠️ | Bump heuristic (patch <50 lines or <3 files; minor otherwise; never major auto) is reasonable but `gh`-dependent like the others. |
| K5 Maintainability & readability | ⚠️ | Same name as `.github/skills/publish-pr/SKILL.md` but with extra version-bump logic — the two should be unified or explicitly scoped to their tools. |
| K8 Documentation & accuracy | ✅ | Internally consistent and detailed. |

**Summary:** The more capable of the two `publish-pr` skills; reconcile the
duplication to avoid ambiguity.

---

### `.claude/hooks/sonar-secrets/build-scripts/pretool-secrets.ps1` (5 lines)

**Overall status:** ✅ OK — safe, defensive hook.
**Review focus:** What the pre-tool secrets hook does; cross-platform concern.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Pipes hook stdin to `sonar hook claude-pre-tool-use`. |
| K2 Correctness & bugs | ✅ | Guards with `Get-Command sonar` and `exit 0` when absent, so it is a clean no-op without the CLI. |
| K3 Security | ✅ | Forwards data to a local `sonar` binary only; no exfiltration path of its own. |
| K5 Maintainability & readability | ✅ | Five lines, clear. |
| K8 Documentation & accuracy | ✅ | Behavior matches the hook wiring. |

**Summary:** Minimal and safe. PowerShell-only (see `settings.json`).

---

### `.claude/hooks/sonar-secrets/build-scripts/prompt-secrets.ps1` (5 lines)

**Overall status:** ✅ OK — safe, defensive hook.
**Review focus:** What the prompt secrets hook does; same cross-platform concern.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Pipes prompt stdin to `sonar hook claude-prompt-submit`. |
| K2 Correctness & bugs | ✅ | Same `Get-Command` guard + `exit 0` no-op as the pre-tool script. |
| K3 Security | ✅ | Same local-only forwarding. |
| K5 Maintainability & readability | ✅ | Clear. |
| K8 Documentation & accuracy | ✅ | Matches the wiring. |

**Summary:** Minimal and safe; PowerShell-only.

---

### `.mcp.json` (11 lines)

**Overall status:** ⚠️ Note — valid config; Windows binary + doc mismatch.
**Review focus:** MCP server configuration; any embedded secrets or risky scope.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Configures a single `sonarqube` MCP server via `sonar.exe run mcp`. |
| K3 Security | ✅ | No secrets/tokens embedded (auth presumably handled by the `sonar` CLI's own config). |
| K5 Maintainability & readability | ✅ | Minimal. `sonar.exe` ties it to Windows. |
| K8 Documentation & accuracy | ⚠️ | Contradicts `copilot-instructions.md`, which claims `.vscode/mcp.json` configures Playwright. This file is the actual MCP config and it is sonarqube. |

**Summary:** Fine as a Windows sonarqube MCP config; the docs that describe it
are what's wrong (see `copilot-instructions.md`).

---

### `.serena/project.yml` (140 lines)

**Overall status:** ✅ OK — mostly default Serena template.
**Review focus:** Serena tooling configuration; accuracy vs. the actual project.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Serena project config; almost entirely the annotated default template. |
| K5 Maintainability & readability | ✅ | Heavily commented defaults. `languages: []` means no language server is configured, so Serena runs with reduced symbol capability — a tooling preference, not a bug. |
| K8 Documentation & accuracy | ✅ | `project_name` and `ignore_all_files_in_gitignore: true` are appropriate. |

**Summary:** Standard config; consider setting `languages: [typescript]` if
richer Serena symbol support is wanted.

---

### `.serena/.gitignore` (2 lines)

**Overall status:** ✅ OK.
**Review focus:** Correct ignore scope for Serena cache.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Ignores `/cache` and `/project.local.yml`. |
| K8 Documentation & accuracy | ✅ | Correct scope; keeps local/cache state out of git. |

**Summary:** Correct.

---

### `.serena/memories/suggested_commands.md` (5 lines / 1 logical line)

**Overall status:** ✅ OK — accurate.
**Review focus:** Commands match `package.json` scripts and `CLAUDE.md`.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Lists the dev commands and notes a Windows/PowerShell environment. |
| K8 Documentation & accuracy | ✅ | `npm install`/`typecheck`/`build`/`start` match `package.json`. Confirms Windows-based development (consistent with the `.ps1`/`.exe` tooling). |

**Summary:** Accurate; reinforces the Windows-dev / Linux-deploy split.

---

### `.serena/memories/completion_checklist.md` (244 bytes, no trailing newline)

**Overall status:** ✅ OK — accurate (NOT empty).
**Review focus:** Was flagged as empty by the scaffold — it is not.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Post-change checklist: run `npm run typecheck` and `npm run build`, no new tooling, keep behavior backward-compatible, update README only when affected. |
| K8 Documentation & accuracy | ✅ | Matches the project's actual validation flow (no tests, build = typecheck + esbuild). Only nit: missing trailing newline. |

**Summary:** Accurate guidance; the scaffold's "empty" note was wrong.

---

### `.serena/memories/project_overview.md` (427 bytes, no trailing newline)

**Overall status:** ✅ OK — accurate (NOT empty).
**Review focus:** Was flagged as empty by the scaffold — it is not.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | One-paragraph overview: Node + TS, Express backend + small client, tails events.log/openhab.log, bounded buffers, SSE, row layout (time/source/level/logger/message). |
| K8 Documentation & accuracy | ✅ | Matches the implementation reviewed in phases 1–2. Missing trailing newline only. |

**Summary:** Accurate summary; correct the scaffold's empty note.

---

### `.serena/memories/style_conventions.md` (395 bytes, no trailing newline)

**Overall status:** ✅ OK — accurate (NOT empty).
**Review focus:** Was flagged as empty by the scaffold — it is not.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Style notes: TS ESM, exported types, small modules, functional DOM rendering, camelCase/PascalCase, mirrored client/server interfaces, plain CSS, surgical changes. |
| K8 Documentation & accuracy | ✅ | Consistent with the actual code style and the mirrored-types convention from `CLAUDE.md`. Missing trailing newline only. |

**Summary:** Accurate; correct the scaffold's empty note.

---

### `.gitignore` (44 lines)

**Overall status:** ✅ OK — comprehensive.
**Review focus:** Ignored paths; no accidental tracking gaps or over-broad rules.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Ignores deps, build output, logs, env files, editor/OS/temp files, and `.claude/settings.local.json`. |
| K3 Security | ✅ | Ignores `.env`/`.env.*` (with an `.env.example` exception) and `*.log`, preventing accidental secret/log commits. |
| K8 Documentation & accuracy | ✅ | Forward-looking entries (`coverage/`, `*.tsbuildinfo`) anticipate tests/TS build info. Correctly ignores `dist/`. |

**Summary:** Solid, no gaps.

---

### `src/assets/openHAB_appicon.svg` (1419 bytes)

**Overall status:** ✅ OK — clean asset.
**Review focus:** Asset integrity, referenced by client, no embedded scripts.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Light-theme favicon (set in `index.html` and swapped in `applyTheme`). |
| K3 Security | ✅ | No `<script>`, event handlers, `<foreignObject>`, or entities (verified by search). Served via `<img>` and CSP `img-src 'self'`, so even SVG scripts could not execute. |
| K8 Documentation & accuracy | ✅ | Referenced and used. |

**Summary:** Clean and used.

---

### `src/assets/openHAB_darkBG_appicon.svg` (1431 bytes)

**Overall status:** ✅ OK — clean asset.
**Review focus:** Asset integrity, dark-background variant usage.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Dark-theme favicon (swapped in `applyTheme`). |
| K3 Security | ✅ | Script/handler/entity-free (verified). |
| K8 Documentation & accuracy | ✅ | Referenced and used. |

**Summary:** Clean and used.

---

### `src/assets/openHAB_workswith.svg` (42,525 bytes)

**Overall status:** ✅ OK — clean asset; somewhat large.
**Review focus:** Asset integrity, "works with" badge usage.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Light-theme brand image (`#app-brand-image` in `index.html`). |
| K3 Security | ✅ | Script/handler/entity-free (verified). |
| K6 Performance | ⚠️ | ~42 KB; fine over a LAN but could be optimized (SVGO) if size matters. |
| K8 Documentation & accuracy | ✅ | Referenced and used. |

**Summary:** Clean and used; optional size optimization.

---

### `src/assets/openHAB_workswith_darkBG.svg` (42,471 bytes)

**Overall status:** ✅ OK — clean asset; somewhat large.
**Review focus:** Asset integrity, dark-background "works with" variant.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Dark-theme brand image (swapped in `applyTheme`). |
| K3 Security | ✅ | Script/handler/entity-free (verified). |
| K6 Performance | ⚠️ | ~42 KB; same optional optimization note. |
| K8 Documentation & accuracy | ✅ | Referenced and used. |

**Summary:** Clean and used; optional size optimization.
