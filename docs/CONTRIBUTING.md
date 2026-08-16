# Contributing

## Getting started

### Machine setup

To begin you'll need Git and Node.js. The `OpenHabLogViewer` repository uses
Git as its source control system. If you haven't already installed it, you
can download it [here](https://git-scm.com/downloads) or, if you prefer a
GUI-based approach, try [GitHub Desktop](https://desktop.github.com/).

Once Git is installed, you'll also need **Node.js 22 or newer** — the version
`package.json` enforces via `engines.node`. Instructions and downloads for
your preferred OS can be found [here](https://nodejs.org/).

There is no database, external service, or additional toolchain to install:
the server tails plain text log files from disk, and the client is a
framework-free TypeScript bundle. For local development you only need two
readable files to point the app at — real openHAB logs, or any two text files
with a few lines in them (see [Configuration](../README.md#configuration) for
`EVENTS_LOG_PATH`/`OPENHAB_LOG_PATH`/`OPENHAB_LOG_DIR`).

> [!IMPORTANT]
> The above steps are a one-time setup for your machine and do not need to be
> repeated after the initial configuration.

### Cloning the repository

Now that your machine is set up, you can clone the `OpenHabLogViewer`
repository. Open a terminal and run this command:

```shell
git clone https://github.com/LarsLaskowski/OpenHabLogViewer.git
```

Cloning via SSH:

```shell
git clone git@github.com:LarsLaskowski/OpenHabLogViewer.git
```

### Installing dependencies

```shell
npm install
```

### Type-checking

```shell
npm run typecheck
```

This runs `tsc --build` across the server, client, and scripts TypeScript
projects (`tsconfig.server.json`, `tsconfig.client.json`,
`tsconfig.scripts.json`). There is no separate lint step configured in this
repository — TypeScript's `strict` mode plus the test suite plus the
SonarQube scan in CI are the quality gates.

### Building

```shell
npm run build
```

This runs `npm run typecheck` first, then bundles `src/server/index.ts` and
`src/client/entry.ts` with esbuild, recreates `dist/`, and copies
`index.html`, `styles.css`, and the SVG assets into `dist/client`. See
[`ARCHITECTURE.md`](ARCHITECTURE.md#build-and-deployment) for what the build
actually produces and why.

### Running locally

```shell
npm run build
npm run start
```

The application is then available at `http://localhost:9001` (or the
configured `PORT`). See [`README.md`](../README.md#configuration) for every
available environment variable.

### Running tests

```shell
npm test
```

For detailed rules on how unit tests should be structured, named, and when
they are required, see [`UNIT_TESTS.md`](UNIT_TESTS.md).

### Submitting a pull request

If you'd like to contribute by fixing a bug, implementing a feature, or even
correcting typos in the documentation, you'll need to submit a pull request.

Before submitting a pull request, be sure to
[rebase](https://www.atlassian.com/git/tutorials/merging-vs-rebasing) your
branch onto the current `main`. Do not use `git merge` or the *merge* button
provided by GitHub.

For PR naming use the following convention: `[area] Description` (no period
at the end).

- For the area, use the affected part of the codebase (for example `Server`,
  `Client`, `Tailer`, `SSE`, `Config`, `Docs`, `Deploy`).
- For the description, do not reference an issue number in there. A clear,
  short summary of what the change entails is enough; there is room to
  elaborate in the description.

When a PR is related to an issue, use the `Closes #issuenumber` syntax so the
issue links to the PR automatically and closes when the PR is merged.

Follow the PR template in
[`.github/pull_request_template.md`](../.github/pull_request_template.md) — in
particular, do not check off a checklist item that does not actually apply,
and leave "Follow-up work" as "None" rather than deleting the section when
there is none.

## Code style

There is no configured linter or formatter (no ESLint, no Prettier, no
`.editorconfig`) — match the style of the surrounding file:

- TypeScript ES modules throughout, `strict` compiler mode
  (`tsconfig.base.json`), 2-space indentation, single quotes, semicolons.
- Small, focused modules with explicit exported types/interfaces (see
  [`ARCHITECTURE.md`](ARCHITECTURE.md) for how the current modules are split
  and why).
- Descriptive `camelCase` for variables/functions, `PascalCase` for
  types/classes.
- Comments explain **why**, not what — the existing codebase is a good
  reference for the expected density (a short comment on a non-obvious
  constant, invariant, or workaround; none on self-explanatory code).
- Keep the frontend framework-free unless there is a strong technical reason
  to change it, and reuse existing helpers/patterns before adding new
  abstractions — see the full list of binding conventions in
  [`ARCHITECTURE.md` § Key conventions](ARCHITECTURE.md#key-conventions).
- User-facing text, comments, and documentation are written in **English**.
- When changing a shared payload shape, update both `src/server/types.ts` and
  `src/client/state.ts` by hand (see
  [`ARCHITECTURE.md`](ARCHITECTURE.md#shared-payload-types-are-mirrored-not-imported)
  for why these are mirrored instead of imported from one module).

## Stability policy

An essential consideration in every pull request is its impact on the running
system. Avoid introducing unnecessary breaking changes, performance or
functional regressions, or negative impacts on usability. In particular:

- Preserve the core features: live streaming, filtering, pause/clear,
  auto-scroll, theme switching, and persisted UI preferences.
- Preserve client-side and server-side bounds
  (`CLIENT_MAX_RENDERED_LINES`/its 500-line hard cap, `MAX_BUFFERED_LINES`,
  the SSE client limits) — these exist to keep the app responsive under live
  updates and bursty log volume.
- Preserve environment-variable overrides and their documented defaults (see
  [`README.md` § Configuration](../README.md#configuration)); do not change a
  default's meaning without updating both the code and the README table.
- Preserve the deployment shape: the built server runs from
  `dist/server/index.cjs`, the client is served from `dist/client`, and
  `deploy/systemd/openhab-log-viewer.service` assumes a Linux/systemd install
  rooted at `/opt/openhab-log-viewer`.
- Built-in authentication is intentionally out of scope unless explicitly
  requested by a maintainer — see [`SECURITY.md`](../SECURITY.md) for the
  accepted threat model.

## Reporting security issues

Do not report security vulnerabilities through public GitHub issues. See
[`SECURITY.md`](../SECURITY.md) for the private reporting process.

## License

By contributing to this project, you agree that your contributions will be
licensed under the same [MIT License](../LICENSE.md) that covers the project.
