# Phase 3 — Build & config

Scope: build pipeline and project configuration. 4 files.

**Phase status:** ✅ Reviewed — small, modern, reproducible build with a minimal
and current dependency tree. No security or correctness problems; a couple of
config-hygiene notes.

See [`00-criteria.md`](./00-criteria.md) for K1–K8 definitions.

**Top findings (priority order)**

1. ⚠️ `tsconfig.json` lists `scripts/**/*.mjs` in `include`, but `allowJs` is
   off, so `build.mjs` is **not** actually type-checked by `tsc --noEmit`. A
   single shared config also gives server code the `DOM` lib.
2. ⚠️ `package.json` devDep `@types/express-rate-limit` is a deprecated stub —
   `express-rate-limit` ships its own types since v6, so this is redundant.
3. ℹ️ `build.mjs` ships sourcemaps, does not minify, emits unhashed output
   filenames (stale-cache risk on upgrade), and hardcodes the four SVG copies.
4. ✅ Dependency tree is minimal and current (Express 5.2.1 + transitives), all
   integrity-pinned; `path-to-regexp` 8.x / `cookie` 0.7.2 / `qs` 6.15.2 are
   post-fix versions — no known criticals.
5. ✅ `build.mjs` confirms the `__APP_VERSION__` → `packageJson.version`
   substitution (resolves the phase-2 follow-up).

---

### `scripts/build.mjs` (52 lines)

**Overall status:** ✅ OK — does exactly what the docs describe; minor packaging notes.
**Review focus:** esbuild bundling of `src/server/index.ts` and
`src/client/main.ts`, recreation of `dist/`, copy of `index.html`, `styles.css`,
SVG assets. Output shape must match `dist/server/index.cjs` + `dist/client`.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Single build script: wipe/recreate `dist`, bundle server (CJS) + client (ESM), template `index.html`, copy CSS + SVGs. Clear. |
| K2 Correctness & bugs | ✅ | Recreates `dist` (L13–16), produces `dist/server/index.cjs` and `dist/client/main.js` matching the documented deployment shape. `replaceAll('__APP_VERSION__', packageJson.version)` (L41) substitutes the version — so `v__APP_VERSION__` in `index.html` renders as `v2.1.7`. Top-level await means any failure exits non-zero. |
| K3 Security | ✅ | No untrusted input; reads only repo files. Sourcemaps are emitted for both bundles (L25/L36) — they expose original source, acceptable for a self-hosted home-network tool but worth a conscious choice. |
| K4 Architecture & conventions | ✅ | Preserves the exact deployment contract from `CLAUDE.md` (`dist/server/index.cjs`, `dist/client`, copied assets). Server target `node20`, client targets Chrome/FF/Safari 120/17. |
| K5 Maintainability & readability | ⚠️ | The four SVG copies are hardcoded (L43–52); adding an asset means editing the script. Could iterate over the assets directory instead. No minification, and output filenames are unhashed (`main.js`/`styles.css`), so a browser may serve a stale bundle after an upgrade unless caching headers force revalidation. |
| K6 Performance | ✅ | esbuild bundle is fast; build cost is negligible. |
| K7 Tests & verifiability | ✅ | Verified by running `npm run build` (which also runs the typecheck). |
| K8 Documentation & accuracy | ✅ | Matches the build description in `CLAUDE.md` precisely. |

**Summary:** Correct and faithful to the documented build. Optional follow-ups:
glob the assets directory, consider minify + content-hashed filenames for cache
busting, and decide deliberately whether to ship production sourcemaps.

---

### `package.json` (26 lines)

**Overall status:** ✅ OK — minimal scripts/deps; one redundant type stub.
**Review focus:** Scripts (`typecheck`, `build`, `start`), dependency choices,
`engines.node >=20`, absence of test/lint scripts.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Project manifest: scripts, deps, Node engine. Clear. |
| K2 Correctness & bugs | ✅ | `build` runs `typecheck` first (L11 of package.json), then `build.mjs`; `start` runs the built `dist/server/index.cjs`. `type: module` matches the `.mjs`/ESM source. |
| K3 Security | ✅ | Only two runtime deps (`express`, `express-rate-limit`), shrinking attack surface. Caret ranges are pinned exactly by the lockfile (use `npm ci` in CI for reproducibility — verify in phase 4). |
| K4 Architecture & conventions | ✅ | `engines.node >=20`, `private: true`. No `test`/`lint` scripts — matches `CLAUDE.md`'s explicit statement that none are configured. |
| K5 Maintainability & readability | ⚠️ | `@types/express-rate-limit` (^6.0.2) is a deprecated DefinitelyTyped stub — `express-rate-limit` v8 bundles its own types, so this devDep is redundant and can be removed. |
| K6 Performance | ✅ | n/a. |
| K7 Tests & verifiability | ⚠️ | No `test` script anywhere in the project — the recurring cross-cutting gap (see phases 1–2). Adding even a minimal test runner would unlock the many pure-function test candidates found so far. |
| K8 Documentation & accuracy | ✅ | Scripts and deps match `CLAUDE.md` and the lockfile. |

**Summary:** Lean and correct. Remove the redundant `@types/express-rate-limit`
stub, and treat the missing test script as the headline item for phase 6.

---

### `package-lock.json` (1478 lines)

**Overall status:** ✅ OK — minimal, current, fully integrity-pinned tree.
**Review focus:** Dependency integrity, version pinning, known-vulnerable
transitive packages, consistency with `package.json`.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Lockfile v3 pinning the full resolved tree. |
| K2 Correctness & bugs | ✅ | Root deps match `package.json`. Resolved production tree: `express` 5.2.1, `express-rate-limit` 8.5.2, plus `body-parser` 2.2.2, `cookie` 0.7.2, `qs` 6.15.2, `path-to-regexp` 8.4.2, `send` 1.2.1, `serve-static` 2.2.1, `raw-body` 3.0.2, `router` 2.2.0, `finalhandler` 2.1.1, `on-finished` 2.4.1. Every entry carries a `sha512` integrity hash and a `resolved` URL. |
| K3 Security | ✅ | Versions are post-fix for the well-known advisories: `path-to-regexp` 8.x (ReDoS fixed vs 0.1/3/6.x), `cookie` 0.7.2 (≥0.7.0 fix), `qs` 6.15.2, `body-parser`/`raw-body` current. No known critical/high vulns for these pins as of the knowledge cutoff. The 40 `dev` entries are esbuild platform binaries + TypeScript + `@types/*` (build-time only, not shipped). |
| K4 Architecture & conventions | ✅ | Keeps dependencies minimal per `CLAUDE.md`; production runtime pulls in only the Express stack. |
| K5 Maintainability & readability | ✅ | Standard generated lockfile; nothing hand-edited. |
| K6 Performance | ✅ | n/a. |
| K7 Tests & verifiability | ✅ | Integrity hashes + `npm ci` make installs reproducible and verifiable. |
| K8 Documentation & accuracy | ✅ | Consistent with `package.json`; `name`/`version` (2.1.7) match. |

**Summary:** A clean, minimal, integrity-pinned tree with no flagged-vulnerable
versions. Recommend periodic `npm audit` in CI (check phase 4) to keep this
status current, since it is a point-in-time assessment.

---

### `tsconfig.json` (15 lines)

**Overall status:** ✅ OK — strict and modern; two scoping notes.
**Review focus:** Compiler options, strictness, module/target settings,
typecheck scope.

| Criterion | Status | Findings |
|-----------|--------|----------|
| K1 Purpose & responsibility | ✅ | Single typecheck config for the whole `src` tree. |
| K2 Correctness & bugs | ⚠️ | `include` lists `scripts/**/*.mjs` (L14), but `allowJs`/`checkJs` are not set, so TypeScript does not actually type-check `build.mjs` — the glob is effectively inert. Either enable `allowJs`+`checkJs` to genuinely check it, or drop the misleading entry. |
| K3 Security | ✅ | n/a. |
| K4 Architecture & conventions | ⚠️ | One shared config covers both server and client and includes the `DOM` lib (L6). That means server code (`src/server`) is type-checked with `DOM` globals in scope, so an accidental browser-only API reference in server code would not be caught. Splitting into `tsconfig` per surface (or a server-specific config without `DOM`) would tighten this. |
| K5 Maintainability & readability | ✅ | `strict: true`, `skipLibCheck`, `forceConsistentCasingInFileNames`, `moduleResolution: Bundler` — modern and sensible for an esbuild project. |
| K6 Performance | ✅ | `noEmit` (esbuild does the transpile); typecheck only. |
| K7 Tests & verifiability | ✅ | `tsc --noEmit` is the project's only automated correctness gate today — important given the absence of tests. |
| K8 Documentation & accuracy | ✅ | `noEmit` is consistent with the documented "build = typecheck + esbuild" split. |

**Summary:** Strict, modern, and the de-facto safety net for the codebase. Two
tidy-ups: make the `scripts/**/*.mjs` include real (enable `allowJs`/`checkJs`)
or remove it, and consider separating server/client type scopes so the `DOM`
lib does not leak into server type-checking.
