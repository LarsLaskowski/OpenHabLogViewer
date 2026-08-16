---
name: review-pr
description: Reviews a GitHub pull request by number and reports findings and actionable recommendations, without changing any code. Use this whenever the user wants a pull request examined, e.g. "review PR 42", "check #42", or passes a bare PR number for review. Posting a review comment is optional and only happens on explicit request.
---

Use this skill when the user gives you a GitHub pull request number (e.g. "review PR 42", "#42", or just "42") and wants it reviewed.

This skill is **read-only**. Its job is to understand the PR and give the user findings and actionable recommendations. It must **not** modify any code, commit, push, change the PR, or check out the branch in a way that alters the working tree beyond what is needed to inspect the diff. The output is a review, not a fix.

Write all output in **English**: your summary to the user, your recommendations, and — only if the user asks for it — any review comment posted to GitHub. This holds regardless of the language the user wrote in.

## Workflow

### 1. Load the pull request

- Confirm the PR number from the user's request. If none was given, stop and ask for one.
- Fetch metadata with GitHub CLI (non-interactive):
  `gh pr view <number> --json number,title,body,author,state,baseRefName,headRefName,labels,additions,deletions,changedFiles,comments,reviews`
- Fetch the diff: `gh pr diff <number>`.
- If the PR is already merged or closed, say so and ask whether the user still wants a review before continuing.

### 2. Understand the intent

- Read the PR title and body to understand what the change is supposed to do.
- If the PR references an issue (e.g. `Closes #N`), read that issue with `gh issue view <N>` so you can judge whether the change actually solves the stated problem.

### 3. Review the diff

Evaluate the change against what matters for this project. Focus on:

- **Correctness** — bugs, edge cases, error handling, race conditions, off-by-one and boundary issues. For this app pay attention to log tailing/rotation/truncation logic, SSE streaming, and reconnect/resync behavior.
- **Convention adherence** (`CLAUDE.md`, `docs/ARCHITECTURE.md`) — every physical log line stays its own UI row; frontend stays framework-free; shared payload changes update both `src/server/types.ts` and `src/client/state.ts`; new client defaults go through `createInitialState()`; user-facing text and comments are in English; file/source error and reconnect states stay visible.
- **Scope and size** — unrelated changes bundled in, accidental file inclusions, debug leftovers.
- **Test coverage** (`docs/UNIT_TESTS.md`) — new or changed behavior in `src/server`/`src/client` should have a matching colocated `*.test.ts`; a bug fix should have a regression test. Flag missing tests as a **Blocking** finding, not a Nit, unless the change is a pure refactor with no behavior change.
- **Tests and validation** — whether the change is verifiable and whether `npm run typecheck` / `npm test` / `npm run build` would plausibly pass.
- **Clarity** — naming, dead code, needless complexity, missing or misleading comments.

Do not run builds that modify files unnecessarily; reading the diff and the surrounding code is usually enough. You may read any file in the repo for context.

### 4. Report findings

Present the review to the user in this structure:

```
## PR #<number> — <title>

**Verdict:** <Approve / Approve with comments / Request changes / Needs discussion>

### Summary
<1–3 sentences on what the PR does and whether it achieves its goal.>

### Findings
- **[Blocking|Suggestion|Nit] <file:line>** — <what and why, with a recommended action.>
- ...

### Recommendations
<Concrete next steps the author should take.>
```

- Classify each finding as **Blocking** (must fix before merge), **Suggestion** (worth doing), or **Nit** (minor/optional).
- Reference exact `file:line` locations so findings are easy to act on.
- If you find nothing wrong, say so plainly rather than inventing issues.

### 5. Optional: post a review comment

- Only post anything to GitHub if the user explicitly asks for it. By default, just report back in the chat.
- If asked, post the review in **English** using GitHub CLI, e.g.:
  - `gh pr review <number> --comment --body "<english text>"` for a neutral comment,
  - `--approve` or `--request-changes` only when the user explicitly chooses that action.
- Do not add any attribution, "Generated with" footer, or other note referencing an AI/assistant.

## Rules

- Never modify code, commit, push, or change the PR contents — this skill only reviews.
- Prefer non-interactive commands only.
- Do not post any comment or review to GitHub unless the user explicitly requests it.
- Base your verdict on evidence from the diff and code; if something is uncertain, say so instead of guessing.
