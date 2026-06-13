# Repository Review

This directory holds a full, file-by-file review of the OpenHab Log Viewer
repository. The goal is complete coverage: **every tracked file is reviewed,
none is skipped.**

The review is split into six phases. Each phase lives in its own file and can be
completed independently in a separate prompt (for example: "Complete phase 1" or
"Review `src/server/logTailer.ts`"). Each file in the repo has its own section
with a status marker, so progress is always visible.

## How to use this review

1. Read the criteria in [`00-criteria.md`](./00-criteria.md). Every file is
   scored against the same eight criteria (K1–K8).
2. Pick a phase file and fill in the per-file sections using the structure in
   [`_template.md`](./_template.md).
3. Update the status marker for each criterion and the file's overall status.
4. When all files of a phase are done, mark the phase as complete in the table
   below and capture cross-cutting findings in
   [`phase-6-synthesis.md`](./phase-6-synthesis.md).

## Status legend

- ⬜ Not yet reviewed
- ✅ OK — no action needed
- ⚠️ Note — minor issue or suggestion
- ❌ Problem — needs a fix

## Phases

| Phase | Scope | File | Files | Status |
|-------|-------|------|-------|--------|
| 1 | Server core | [`phase-1-server.md`](./phase-1-server.md) | 8 | ✅ |
| 2 | Client | [`phase-2-client.md`](./phase-2-client.md) | 7 | ✅ |
| 3 | Build & config | [`phase-3-build-config.md`](./phase-3-build-config.md) | 4 | ✅ |
| 4 | CI/CD & deployment | [`phase-4-cicd-deploy.md`](./phase-4-cicd-deploy.md) | 4 | ✅ |
| 5 | Docs, meta & assets | [`phase-5-docs-meta-assets.md`](./phase-5-docs-meta-assets.md) | 25 | ⬜ |
| 6 | Synthesis | [`phase-6-synthesis.md`](./phase-6-synthesis.md) | — | ⬜ |

**Total tracked files: 48** (phases 1–5 cover all of them; phase 6 is the
cross-cutting summary).

## Complete file inventory

Every tracked file and the phase that covers it. This list is the contract: if a
file is here, it must be reviewed.

| # | File | Phase |
|---|------|-------|
| 1 | `src/server/index.ts` | 1 |
| 2 | `src/server/config.ts` | 1 |
| 3 | `src/server/logTailer.ts` | 1 |
| 4 | `src/server/logLineParser.ts` | 1 |
| 5 | `src/server/logBuffer.ts` | 1 |
| 6 | `src/server/sseHub.ts` | 1 |
| 7 | `src/server/routes.ts` | 1 |
| 8 | `src/server/types.ts` | 1 |
| 9 | `src/client/main.ts` | 2 |
| 10 | `src/client/render.ts` | 2 |
| 11 | `src/client/performance.ts` | 2 |
| 12 | `src/client/state.ts` | 2 |
| 13 | `src/client/filters.ts` | 2 |
| 14 | `src/client/styles.css` | 2 |
| 15 | `src/client/index.html` | 2 |
| 16 | `scripts/build.mjs` | 3 |
| 17 | `package.json` | 3 |
| 18 | `package-lock.json` | 3 |
| 19 | `tsconfig.json` | 3 |
| 20 | `.github/workflows/ci.yml` | 4 |
| 21 | `.github/workflows/release.yml` | 4 |
| 22 | `.github/dependabot.yml` | 4 |
| 23 | `deploy/systemd/openhab-log-viewer.service` | 4 |
| 24 | `README.md` | 5 |
| 25 | `SECURITY.md` | 5 |
| 26 | `docs/images/openhablogviewer.png` | 5 |
| 27 | `.github/copilot-instructions.md` | 5 |
| 28 | `.github/ISSUE_TEMPLATE/bug_report.md` | 5 |
| 29 | `.github/ISSUE_TEMPLATE/feature_request.md` | 5 |
| 30 | `.github/skills/create-pr/SKILL.md` | 5 |
| 31 | `.github/skills/publish-pr/SKILL.md` | 5 |
| 32 | `.claude/CLAUDE.md` | 5 |
| 33 | `.claude/settings.json` | 5 |
| 34 | `.claude/skills/publish-pr/prompt.md` | 5 |
| 35 | `.claude/hooks/sonar-secrets/build-scripts/pretool-secrets.ps1` | 5 |
| 36 | `.claude/hooks/sonar-secrets/build-scripts/prompt-secrets.ps1` | 5 |
| 37 | `.mcp.json` | 5 |
| 38 | `.serena/project.yml` | 5 |
| 39 | `.serena/.gitignore` | 5 |
| 40 | `.serena/memories/suggested_commands.md` | 5 |
| 41 | `.serena/memories/completion_checklist.md` | 5 |
| 42 | `.serena/memories/project_overview.md` | 5 |
| 43 | `.serena/memories/style_conventions.md` | 5 |
| 44 | `.gitignore` | 5 |
| 45 | `src/assets/openHAB_appicon.svg` | 5 |
| 46 | `src/assets/openHAB_darkBG_appicon.svg` | 5 |
| 47 | `src/assets/openHAB_workswith.svg` | 5 |
| 48 | `src/assets/openHAB_workswith_darkBG.svg` | 5 |
