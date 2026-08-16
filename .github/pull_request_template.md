<!---
Thanks for filing a pull request! Before you submit, please read the following:

Search open/closed issues before submitting. Someone may have pushed the same thing before!

Provide a summary of your changes in the title field above, using the `[area] Description` convention from CONTRIBUTING.md (e.g. `[Tailer] Handle truncated events.log during rotation`).
-->

# Pull Request

## 📖 Description

<!---
Provide some background and a description of your work.
What problem does this change solve?
Is this a breaking change, chore, fix, feature, etc?
-->

## 🎫 Issues

<!---
* List and link relevant issues here, for example: Closes #123
-->

## 👩‍💻 Reviewer Notes

<!---
Provide some notes for reviewers to help them provide targeted feedback and testing.

Do you recommend a smoke test for this PR? What steps should be followed?
Are there particular areas of the code the reviewer should focus on?
-->

## 📑 Test Plan

<!---
Please provide a summary of the tests affected by this work and any unique strategies employed in testing the features/fixes.
List new or updated test files (see UNIT_TESTS.md) and what they cover.
-->

## ✅ Checklist

### General

<!--- Review the list and put an x in the boxes that apply. -->

- [ ] I have added unit tests for my changes, per [UNIT_TESTS.md](../docs/UNIT_TESTS.md).
- [ ] I have run `npm test` and `npm run typecheck` locally and they pass.
- [ ] I have updated the project documentation (README, ARCHITECTURE, etc.) to reflect my changes, where applicable.
- [ ] I have read the [CONTRIBUTING](../docs/CONTRIBUTING.md) documentation and followed the project's code style and conventions.

### Server-specific (`src/server`)

<!--- Review the list and put an x in the boxes that apply. -->
<!--- Remove this section if not applicable. -->

- [ ] I have added or updated a module in `src/server` (tailer, parser, buffer, routes, SSE hub, config, etc.).
- [ ] I have kept `src/server/types.ts` in sync with `src/client/state.ts` for any shared payload change (see [ARCHITECTURE.md](../docs/ARCHITECTURE.md#shared-payload-types-are-mirrored-not-imported)).
- [ ] I have preserved existing server-side bounds and defaults (buffer/SSE limits, poll interval clamps) unless the change explicitly targets them.

### Client-specific (`src/client`)

<!--- Review the list and put an x in the boxes that apply. -->
<!--- Remove this section if not applicable. -->

- [ ] I have added or updated a client module (`render.ts`, `main.ts`, `derivedLogView.ts`, `filters.ts`, `preferences.ts`, etc.).
- [ ] I have kept the frontend framework-free and added any new default UI state to `createInitialState()` in `src/client/state.ts`.
- [ ] I have kept every physical log line as its own visible UI row (continuation lines are not merged).

## ⏭ Next Steps

<!---
Optional. Note any intentionally deferred work. Write "None" if not applicable.
-->
