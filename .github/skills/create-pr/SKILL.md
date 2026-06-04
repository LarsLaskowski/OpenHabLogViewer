---
name: create-pr
description: Always creates a new branch first, then commits any uncommitted changes, pushes the branch, and opens a pull request. Use when asked to create a PR or publish changes as a pull request.
---

Use this skill when the user wants to create a pull request from the current working changes.

**Always create a new branch before committing** — never commit directly to `main` or the base branch.

Follow this workflow:

1. Inspect the repository state with non-interactive Git commands:
   - confirm the current branch
   - review `git status --short --branch`
   - confirm the `origin` remote exists
2. If there are no relevant local changes and no unpushed commits, stop and say so plainly.
3. Choose or confirm a branch name based on the change. If the user already provided one, use it. Otherwise derive a short kebab-case branch name from the work (e.g. `add-sonarqube-integration`, `fix-login-bug`).
4. If already on a feature branch (not `main`/`master`/`develop`), stay on it and skip branch creation. Otherwise, create and switch to the new branch from the current base branch.
5. Stage only the intended files for this task. Do not include unrelated changes.
6. Create a non-interactive Git commit with a concise message that describes what changed and why.
7. Push the branch to `origin` and set upstream tracking.
8. Create a pull request with GitHub CLI:
   - base branch: `main`, unless the user explicitly requests a different base
   - title: concise summary of the change (under 70 characters)
   - body: what changed, why, and anything a reviewer should know. Wrap the body in a HEREDOC to preserve formatting.
   - If the repo has a PR template, follow it.
9. After the pull request is created, switch back to the `main` branch.
10. Report the branch name and pull request URL. Wrap the URL in a `<pr-created>` tag on its own line so the UI can render a live status card, like this: `<pr-created>https://github.com/owner/repo/pull/123</pr-created>`

Additional rules:

- Prefer non-interactive commands only.
- Do not amend existing commits unless the user explicitly asks.
- Do not include unrelated modified files in the commit.
- If a PR already exists for the branch, push any new commits and report the existing URL (no duplicate PR).
- If push or PR creation fails, stop and report the failure clearly instead of continuing as if it succeeded.
- If switching back to `main` would discard or conflict with uncommitted work, stop and explain the blocker.
