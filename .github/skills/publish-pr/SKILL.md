---
name: publish-pr
description: Creates a branch, commits the current changes, pushes the branch, opens a pull request, and switches back to main. Use this when asked to publish local changes as a pull request.
---

Use this skill when the user wants the current local changes published to GitHub as a pull request.

Follow this workflow:

1. Inspect the repository state first with non-interactive Git commands:
   - confirm the current branch
   - review `git status --short --branch`
   - confirm the `origin` remote exists
2. If there are no relevant local changes to publish, stop and say so plainly.
3. Choose or confirm a branch name based on the change. If the user already provided one, use it. Otherwise derive a short kebab-case branch name from the work.
4. Create and switch to the branch from the current base branch.
5. Stage only the intended files for this task. Do not include unrelated changes.
6. Create a non-interactive Git commit with a concise message that matches the change.
7. Push the branch to `origin` and set upstream tracking.
8. Create a pull request with GitHub CLI:
   - base branch: `main`, unless the user explicitly requests a different base
   - title: concise summary of the change, following the `[area] Description` convention from `docs/CONTRIBUTING.md`
   - body: follow the structure in `.github/pull_request_template.md` (Description, Issues, Reviewer Notes, Test Plan, Checklist, Next Steps)
9. After the pull request is created, switch back to the `main` branch.
10. Report the branch name and pull request URL clearly.

Additional rules:

- Prefer non-interactive commands only.
- Do not amend existing commits unless the user explicitly asks.
- Do not include unrelated modified files in the commit.
- If push or PR creation fails, stop and report the failure clearly instead of continuing as if it succeeded.
- If switching back to `main` would discard or conflict with uncommitted work, stop and explain the blocker.
