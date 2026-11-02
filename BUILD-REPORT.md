# testfinder — Build Report

MCP Rebuild 1000, Batch 15. Original program build from the
packages-100 plan (cluster H #98), built from the spec in
`~/workspace/mcp-rebuild-100/specs-batch15/testfinder.md`
(read first). There is no external original; the tool surface
is the program's defined spec. Local build only — nothing
pushed or published.

Identity: repo `testfinder`, npm `@reneturcios/testfinder`,
MCP name `io.github.CloudCorpRecords/testfinder`, version
`0.1.0`, bin `testfinder` → `dist/cli.js`.

PROCESS NOTE (honest): the builder session wrote all source,
test, and factory files plus the fixture, then was blocked by
the VM exec write guard (EPERM on exec content writes) and an
npm-cache packument miss, and ended before install/build/
parity. The coordinator completed the remaining steps in the
foreground (lockfile generation, install, build, tests,
parity, this report) — the Batch 12 importfix precedent. All
numbers below are the coordinator's own foreground runs.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json`, `server.json` (description "Find the tests
  relevant to a source file from an import map, ranked, with
  the run command.", 90 chars ≤100; npm entry carries
  `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/testfinder:0.1.0` carries **no**
  `version` field), `Dockerfile` (node:20-alpine two-stage,
  label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/testfinder"`),
  `tsconfig.json`, `.gitignore`, `LICENSE` (MIT, Copyright
  (c) 2026 Rene Turcios), `README.md` (fresh text),
  `CHANGELOG.md` (single 0.1.0 entry, 2026-10-27),
  `package-lock.json` (Route 3, see below)
- `src/index.ts`, `src/cli.ts` (`find --input <args.json>`
  where the file holds the full arguments object, `mcp`,
  `--version`; exit 2 usage / 1 runtime error), `src/mcp.ts`,
  `src/types.ts`, `src/testfinder.ts` (core,
  `VERSION = "0.1.0"`)
- `test/testfinder.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (publish-container `IMAGE = ghcr.io/cloudcorprecords/testfinder`,
  smoke-test server-name assertion `testfinder`)

## Tools implemented (1)

- `find_relevant_tests` — arguments: `source_file` (string,
  required, non-empty, must be one of the supplied files)
  and `files` (array, required, minItems 1) of `{path
  (string, required, non-empty, unique), imports (array of
  strings, optional, default [])}`.

  Returns `{source_file, relevant_tests, total_files,
  test_files_considered, run_command}`. Test files are
  recognised by the spec's pinned definition (basename
  containing ".test." or ".spec.", or a `test` / `tests` /
  `__tests__` path segment). Relevant tests are the source
  itself (when it is a test), its importers in the reverse
  import graph, and naming-convention matches (sibling
  `.test` / `.spec` insertion and the `__tests__` sibling
  form), each carrying one reason by the pinned precedence
  self > direct > convention > transitive, ranked by reason,
  then distance, then path. `run_command` is the single
  `npx tsx --test <paths…>` line in ranked order, or null
  when nothing is relevant. The tool performs the FIND half
  of the plan entry and returns the command; it does not
  execute tests — the spec's pinned scope choice.

  The fixture literal
  (`harness/fixtures/testfinder-tools-original.json`) and
  the `src/mcp.ts` literal are identical, with no `$schema`
  and no `additionalProperties`.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with an
  explicit inputSchema literal exactly matching the fixture,
  per the standing fleet rule. Every `tools/call` is
  validated by the core itself, so the MCP and CLI paths
  share one validation implementation.
- Validation is path-naming and total, including the spec's
  exact not-present message
  `source_file "<value>" is not present in files`.
- Reverse-graph distances are shortest-path (BFS) over
  de-duplicated, in-set import edges; self-imports are
  ignored for graph purposes.

## Verification (coordinator, foreground, this session)

- `npx tsc --noEmit` exit 0; `npm run build` exit 0 with a
  genuine tsc emit (dist carries .js, .d.ts, and .js.map
  for all five modules)
- `npm test` (`tsx --test test/*.test.ts`): **32 tests,
  32 pass, 0 fail** — self/direct/transitive relevance,
  diamond shortest distance, convention matches (sibling,
  `__tests__`, extensionless, multi-dot), both precedence
  pins, full ranking order, run_command string and null
  case, test_files_considered, external/self/duplicate
  import handling, and every validation path
- `dist/cli.js --version` → `0.1.0`; unknown command exits
  2; `find --input <missing file>` exits 1 naming the file;
  `find --input <valid file>` exits 0 — hand-checked against
  a 4-file graph: `src/foo.test.ts` direct (distance 1)
  ranked before `src/bar.test.ts` transitive (distance 2),
  run_command `npx tsx --test src/foo.test.ts
  src/bar.test.ts`
- Parity: `harness/parity.py` vs
  `harness/fixtures/testfinder-tools-original.json` →
  **PASS, parity 100.0, identical_tools 1/1** (absolute
  paths; the harness does not expand `~`)

## Lockfile status

`package-lock.json` generated clean via Route 3 (temp copy
without `node_modules`/`dist`/`package-lock.json`, offline
`npm install --package-lock-only --ignore-scripts
--offline`), verified by the coordinator: parses, name
`@reneturcios/testfinder`, **128 package entries**. The
offline route initially failed on an SDK packument cache
miss during the write-guard phase; it succeeded unchanged
once the guard phase lifted — no online step and no copied
lockfile was used. Local `node_modules` was installed via
`npm install --ignore-scripts --offline` against the placed
lockfile; gitignored.

## Gaps / honest notes

- The plan line says "finds and runs"; the build implements
  the deterministic find half and returns the run command
  without executing tests (pinned in the spec, recorded in
  the scoreboard gaps).
- Container build not exercised locally; the
  publish-container workflow smoke-tests the image at
  publish time.
- Nothing pushed or published; this is a local build only.
