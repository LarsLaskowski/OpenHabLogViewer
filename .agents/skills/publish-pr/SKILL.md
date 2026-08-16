---
name: publish-pr
description: Creates a branch, commits the current changes, pushes the branch, opens a pull request, and switches back to main. Use this when asked to publish local changes as a pull request.
---

Use this skill when the user wants the current local changes published to GitHub as a pull request.

All user-facing output you create — branch name, commit message, PR title and body — must be written in **English**, regardless of the language the user wrote in. Never mention Codex, Anthropic, or any other AI/assistant tooling in the PR title or body, and do not add any `Co-Authored-By` trailer, "Generated with" footer, session link, or other note attributing the work to an AI.

Follow this workflow:

1. Inspect the repository state first with non-interactive Git commands:
   - confirm the current branch
   - review `git status --short --branch`
   - confirm the `origin` remote exists
2. If there are no relevant local changes to publish, stop and say so plainly.
3. Measure the size of the changes using `git diff --stat HEAD` (for tracked modifications) and `git status --short` (for untracked files). Count the total number of changed lines (insertions + deletions) and the number of affected source files (exclude `package.json` itself from this count).
4. Determine the version bump type based on change size:
   - **Patch bump** (e.g. `1.2.0` → `1.2.1`): fewer than 50 changed lines, or fewer than 3 source files affected.
   - **Minor bump** (e.g. `1.2.0` → `1.3.0`): 50 or more changed lines AND 3 or more source files affected.
   - **Never bump the major version automatically.** The major segment must only change when the user explicitly requests it.
5. Read the current version from `package.json`, compute the new version according to step 4, and update `package.json` with the new version using a JSON-safe in-place edit (preserve all formatting). Report the old and new version to the user (e.g. `version bump: 1.2.0 → 1.2.1 (patch)`).
6. Choose or confirm a branch name based on the change. If the user already provided one, use it. Otherwise derive a short kebab-case branch name from the work.
7. Create and switch to the branch from the current base branch.
8. Stage only the intended files for this task plus the updated `package.json`. Do not include unrelated changes.
9. Create a non-interactive Git commit with a concise message that mentions the version bump (e.g. `bump version to 1.2.1`).
10. Push the branch to `origin` and set upstream tracking.
11. Create a pull request with GitHub CLI:
    - base branch: `main`, unless the user explicitly requests a different base
    - title: concise English summary of the change, following the `[area] Description` convention from `docs/CONTRIBUTING.md`
    - body: follow the structure in `.github/pull_request_template.md` (Description, Issues, Reviewer Notes, Test Plan, Checklist, Next Steps), including the version bump and whether unit tests were added per `docs/UNIT_TESTS.md`
    - Do not add any attribution, "Generated with" footer, or other note referencing an AI/assistant in the PR title or body.
12. After the pull request is created, switch back to the `main` branch.
13. Report the branch name and pull request URL clearly.

Additional rules:

- Prefer non-interactive commands only.
- Do not amend existing commits unless the user explicitly asks.
- Do not include unrelated modified files in the commit.
- If push or PR creation fails, stop and report the failure clearly instead of continuing as if it succeeded.
- If switching back to `main` would discard or conflict with uncommitted work, stop and explain the blocker.
- When computing the version bump, use the diff against HEAD (or the working tree if no commits exist on the branch yet). Do not count `package.json` itself as a changed source file when deciding between patch and minor.
