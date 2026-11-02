/**
 * testfinder types.
 *
 * testfinder answers one question for a fast edit-test loop:
 * given one source file, which tests in the set are relevant
 * to it? The caller supplies the whole file set — every
 * file's path and the paths it imports — and testfinder
 * reports, as pure local computation:
 *
 *   - the relevant test files, each with the single reason
 *     it is relevant (`self`, `direct`, `convention`, or
 *     `transitive`) and, where the reason comes from the
 *     import graph, its shortest import distance to the
 *     source file
 *   - how many files were supplied in total and how many of
 *     them are test files, relevant or not
 *   - the exact command line that runs just the relevant
 *     tests, or null when there are none
 *
 * An import naming a path outside the supplied set is
 * external: it is ignored for graph purposes and never an
 * error. Nothing is fetched, executed, or read from disk:
 * the answer comes only from the map supplied, and no test
 * is ever run — the tool finds tests and names the command
 * that would run them.
 */

/** One file in the set, as supplied by the caller. */
export interface TestFinderFile {
  /** File path; unique across the supplied set. */
  path: string;
  /**
   * Paths this file imports. Paths outside the supplied set
   * are external and ignored. Defaults to [] when omitted.
   */
  imports: string[];
}

/** Why one relevant test is relevant to the source file. */
export type RelevantReason = "self" | "direct" | "convention" | "transitive";

/** One test relevant to the source file. */
export interface RelevantTest {
  /** Path of the relevant test file. */
  path: string;
  /**
   * The single reason, by precedence: `self` (the test is
   * the source file itself) over `direct` (it imports the
   * source file) over `convention` (its path is a naming-
   * convention match for the source) over `transitive` (it
   * reaches the source file through other files).
   */
  reason: RelevantReason;
  /**
   * Shortest import distance to the source file: 0 for
   * `self`, the graph distance for `direct` / `transitive`,
   * and null for a `convention` match.
   */
  distance: number | null;
}

/** The relevant-tests result for one source file. */
export interface TestFinderResult {
  /** The source file the tests were found for. */
  source_file: string;
  /**
   * Relevant tests in ranked order: by reason rank (`self`,
   * then `direct`, then `convention`, then `transitive`),
   * within `direct` / `transitive` by distance ascending,
   * remaining ties by path ascending (code-unit).
   */
  relevant_tests: RelevantTest[];
  /** Number of files in the supplied set. */
  total_files: number;
  /** Number of test files in the supplied set, relevant or not. */
  test_files_considered: number;
  /**
   * The command that runs exactly the relevant tests
   * ("npx tsx --test " followed by their paths in ranked
   * order), or null when no test is relevant.
   */
  run_command: string | null;
}
