# Changelog

## 0.1.0 (2026-10-27)

- Initial release: `find_relevant_tests` MCP tool and `find`
  CLI command finding the tests relevant to one source file
  from a caller-supplied file/import map.
- Relevance in three graph-and-naming forms, one reason per
  test by precedence: `self` (the source is itself a test),
  `direct` (the test imports the source), `convention` (the
  test's path is the source path with `.test` / `.spec`
  inserted before the final extension, as a sibling or in
  the `__tests__` form), and `transitive` (the test reaches
  the source through other files, at its shortest import
  distance).
- Ranked output (reason rank, then distance, then path)
  with `total_files`, `test_files_considered` counting every
  test file in the set, and `run_command` naming the exact
  command that runs just the relevant tests — the tool
  finds tests, it does not execute them.
- Path-naming validation errors for malformed input,
  including the fixed not-present message when
  `source_file` names no supplied file.
