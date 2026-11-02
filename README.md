# testfinder

Running the whole test suite after every small edit is a
slow loop. testfinder narrows it: give it one source file
plus the project's file/import map — every file's path and
the paths it imports — and it works out which tests are
actually relevant to that file, why each one is relevant,
and the exact command that runs just those tests:

- **Direct importers** — test files that import the source
  file themselves, at distance 1.
- **Naming-convention matches** — test files whose path is
  the source path with `.test` or `.spec` inserted before
  the final extension, either beside the source
  (`src/foo.ts` → `src/foo.test.ts`) or in the `__tests__`
  form (`src/__tests__/foo.test.ts`). A source whose name
  has no extension gets the suffix appended instead
  (`src/foo` → `src/foo.test`).
- **Transitive importers** — test files that reach the
  source through other files, each at its shortest import
  distance, so a diamond in the graph resolves to the
  shorter route.

Every relevant test carries exactly one reason, decided by
precedence: `self` (the source file is itself a test) over
`direct` over `convention` over `transitive`. Results are
ranked by that reason order, then by distance, then by
path, and `run_command` is the `npx tsx --test` line that
runs them in ranked order — or `null` when nothing is
relevant. The result also reports `total_files` and
`test_files_considered`, the count of test files in the
set whether relevant or not. A file counts as a test when
its name carries `.test.` / `.spec.` (or ends in `.test` /
`.spec`), or when it lives under a `test`, `tests`, or
`__tests__` directory.

Imports that name paths outside the supplied set are
external: they are ignored, never followed, and never an
error. Duplicate import entries are de-duplicated and a
file importing itself is ignored for graph purposes, though
distances still flow through ordinary non-test files on
the way to a test. Malformed input — a missing or unknown
`source_file`, an empty file set, a duplicate file path, a
wrongly typed field — is a validation error naming the
offending path (for example
`files[1].imports[0] must be a string`), and no partial
result is produced. The computation is pure and local,
and the tool only finds tests: running them, with the
command it returns, is left to your own environment.

## CLI

```bash
npx @reneturcios/testfinder find --input args.json
npx @reneturcios/testfinder --version
```

`args.json` contains the full arguments object:

```json
{
  "source_file": "src/foo.ts",
  "files": [
    { "path": "src/foo.ts" },
    { "path": "src/bar.ts", "imports": ["src/foo.ts"] },
    { "path": "src/foo.test.ts" },
    { "path": "src/bar.test.ts", "imports": ["src/bar.ts", "react"] }
  ]
}
```

`imports` defaults to `[]` per file; here `react` is
external to the set and ignored. `src/foo.test.ts` is a
naming-convention match with no import of its own, and
`src/bar.test.ts` reaches the source through `src/bar.ts`
at distance 2. The result is printed as JSON:

```json
{
  "source_file": "src/foo.ts",
  "relevant_tests": [
    { "path": "src/foo.test.ts", "reason": "convention", "distance": null },
    { "path": "src/bar.test.ts", "reason": "transitive", "distance": 2 }
  ],
  "total_files": 4,
  "test_files_considered": 2,
  "run_command": "npx tsx --test src/foo.test.ts src/bar.test.ts"
}
```

Exit codes: `0` on success, `1` on a runtime error (including
an unreadable or invalid input file, or invalid input), `2`
on a usage error.

## MCP server

```bash
npx -y @reneturcios/testfinder mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "testfinder": {
      "command": "npx",
      "args": ["-y", "@reneturcios/testfinder", "mcp"]
    }
  }
}
```

### Tools

- `find_relevant_tests` — Find the tests relevant to one
  source file from a file/import map.
  - `source_file` (string, required) — path of the source
    file; must be one of the supplied files
  - `files` (array, required, at least one) — files as
    `{path, imports?}` objects; `path` is unique across
    the set, and each `imports` entry either names another
    supplied file or anything else (external, ignored)

  Returns `{source_file, relevant_tests, total_files,
  test_files_considered, run_command}`, where each entry of
  `relevant_tests` is `{path, reason, distance}`.

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/testfinder
docker run --rm -v "$PWD:/w" ghcr.io/cloudcorprecords/testfinder find --input /w/args.json
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (pure local, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
