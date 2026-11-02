/**
 * testfinder core: find the tests relevant to one source file.
 *
 *   findRelevantTests(sourceFile, files) -> result
 *
 * Behaviour:
 * - A file is a TEST file when its basename contains ".test."
 *   or ".spec.", when its basename ends with ".test" or
 *   ".spec" (the trailing-suffix form, e.g. the extensionless
 *   source convention target "src/foo.test"), or when any
 *   path segment is exactly "test", "tests", or "__tests__".
 * - The import graph uses only imports naming supplied
 *   files; duplicate import entries are de-duplicated, and
 *   a file importing itself is ignored for graph purposes.
 *   In the reverse graph, a file's distance to the source is
 *   the number of import edges on the shortest path from
 *   that file to the source (direct importers: distance 1).
 *   Distances are shortest-path distances, computed by a
 *   breadth-first walk out from the source over the reverse
 *   edges, so diamonds resolve to the shorter route.
 * - Candidate tests are the test files that are the source
 *   itself, reach the source in the import graph, or match
 *   the source by naming convention: the source path with
 *   ".test" or ".spec" inserted before the final extension
 *   as a sibling (src/foo.ts -> src/foo.test.ts), or the
 *   "__tests__" sibling form (src/__tests__/foo.test.ts).
 *   A source whose basename has no "." gets the suffix
 *   appended instead (src/foo -> src/foo.test), in both the
 *   sibling and the "__tests__" forms and for both suffixes.
 * - Each candidate carries ONE reason, by precedence:
 *   "self" (the candidate is the source) > "direct"
 *   (distance 1) > "convention" (naming match, no direct
 *   import) > "transitive" (distance >= 2). Distance is 0
 *   for self, the graph distance for direct/transitive, and
 *   null whenever the reason is convention — including a
 *   convention match that also reaches the source
 *   transitively, whose reason is convention.
 * - Ranking is by reason rank (self, direct, convention,
 *   transitive); within direct/transitive by distance
 *   ascending; remaining ties by path ascending (code-unit).
 * - `run_command` is "npx tsx --test " followed by the
 *   relevant test paths in ranked order joined with " "
 *   when at least one test is relevant, otherwise null.
 *   `total_files` is the size of the supplied set and
 *   `test_files_considered` counts every test file in the
 *   set, relevant or not.
 *
 * The tool finds tests; it never executes them. Validation
 * is strict and path-naming: any malformed input throws an
 * Error naming the offending path and no partial result is
 * produced. The one validation message fixed verbatim by
 * the spec is the not-present message for `source_file`.
 */
import type {
  RelevantReason,
  RelevantTest,
  TestFinderFile,
  TestFinderResult,
} from "./types.js";

export const VERSION = "0.1.0";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Whether a path names a test file: its basename contains
 * ".test." or ".spec." or ends with ".test" / ".spec", or
 * any of its path segments is exactly "test", "tests", or
 * "__tests__".
 */
function isTestFile(path: string): boolean {
  const segments = path.split("/");
  const basename = segments[segments.length - 1];
  if (basename.includes(".test.") || basename.includes(".spec.")) return true;
  if (basename.endsWith(".test") || basename.endsWith(".spec")) return true;
  return segments.some(
    (segment) => segment === "test" || segment === "tests" || segment === "__tests__",
  );
}

/**
 * The naming-convention paths for a source file: the source
 * basename with ".test" / ".spec" inserted before its final
 * extension (or the suffix appended when the basename has
 * no "."), placed both beside the source and inside a
 * "__tests__" directory beside the source.
 */
function conventionPaths(sourceFile: string): Set<string> {
  const slash = sourceFile.lastIndexOf("/");
  const dir = slash === -1 ? "" : sourceFile.slice(0, slash);
  const basename = slash === -1 ? sourceFile : sourceFile.slice(slash + 1);
  const dot = basename.lastIndexOf(".");
  const inserted =
    dot === -1
      ? [`${basename}.test`, `${basename}.spec`]
      : [
          `${basename.slice(0, dot)}.test${basename.slice(dot)}`,
          `${basename.slice(0, dot)}.spec${basename.slice(dot)}`,
        ];
  const paths = new Set<string>();
  for (const name of inserted) {
    paths.add(dir === "" ? name : `${dir}/${name}`);
    paths.add(dir === "" ? `__tests__/${name}` : `${dir}/__tests__/${name}`);
  }
  return paths;
}

/**
 * Validate the raw `source_file` and `files` arguments and
 * return the normalised file list (imports defaulted to []
 * and de-duplicated). The not-present check runs last, once
 * the file set itself is known to be well-formed.
 */
function validateInputs(
  sourceFile: unknown,
  files: unknown,
): { source: string; validFiles: TestFinderFile[] } {
  if (sourceFile === undefined) throw new Error("source_file is required");
  if (typeof sourceFile !== "string" || sourceFile.length === 0) {
    throw new Error("source_file must be a non-empty string");
  }
  if (files === undefined) throw new Error("files is required");
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("files must be a non-empty array");
  }

  const validFiles: TestFinderFile[] = [];
  const indexByPath = new Map<string, number>();
  files.forEach((raw, i) => {
    const entryPath = `files[${i}]`;
    if (!isRecord(raw)) throw new Error(`${entryPath} must be an object`);
    if (raw.path === undefined) throw new Error(`${entryPath}.path is required`);
    if (typeof raw.path !== "string" || raw.path.length === 0) {
      throw new Error(`${entryPath}.path must be a non-empty string`);
    }
    const firstIndex = indexByPath.get(raw.path);
    if (firstIndex !== undefined) {
      throw new Error(
        `${entryPath}.path duplicates files[${firstIndex}].path "${raw.path}"`,
      );
    }
    indexByPath.set(raw.path, i);

    let imports: string[] = [];
    if (raw.imports !== undefined) {
      if (!Array.isArray(raw.imports)) {
        throw new Error(`${entryPath}.imports must be an array`);
      }
      raw.imports.forEach((entry, j) => {
        if (typeof entry !== "string") {
          throw new Error(`${entryPath}.imports[${j}] must be a string`);
        }
      });
      imports = [...new Set(raw.imports as string[])];
    }
    validFiles.push({ path: raw.path, imports });
  });

  if (!indexByPath.has(sourceFile)) {
    throw new Error(`source_file "${sourceFile}" is not present in files`);
  }
  return { source: sourceFile, validFiles };
}

const REASON_RANK: Record<RelevantReason, number> = {
  self: 0,
  direct: 1,
  convention: 2,
  transitive: 3,
};

/** Find the tests relevant to `sourceFile` in the supplied file set. */
export function findRelevantTests(
  sourceFile: unknown,
  files: unknown,
): TestFinderResult {
  const { source, validFiles } = validateInputs(sourceFile, files);

  const known = new Set(validFiles.map((f) => f.path));

  // Reverse import edges over supplied files only: for each
  // file, the supplied files that import it. Self-imports
  // are dropped before any edge is recorded, and imports
  // naming paths outside the set never become edges.
  const importersOf = new Map<string, string[]>(
    validFiles.map((f) => [f.path, [] as string[]]),
  );
  for (const file of validFiles) {
    for (const imported of file.imports) {
      if (!known.has(imported) || imported === file.path) continue;
      (importersOf.get(imported) as string[]).push(file.path);
    }
  }

  // Shortest distances from the source over the reverse
  // graph, by breadth-first search: a file at distance d
  // reaches the source in d import edges and no fewer.
  const distance = new Map<string, number>([[source, 0]]);
  const queue: string[] = [source];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    const nextDistance = (distance.get(current) as number) + 1;
    for (const importer of importersOf.get(current) as string[]) {
      if (!distance.has(importer)) {
        distance.set(importer, nextDistance);
        queue.push(importer);
      }
    }
  }

  const conventions = conventionPaths(source);
  const testFiles = validFiles.filter((f) => isTestFile(f.path));

  const relevant: RelevantTest[] = [];
  for (const file of testFiles) {
    const graphDistance = distance.get(file.path);
    if (file.path === source) {
      relevant.push({ path: file.path, reason: "self", distance: 0 });
    } else if (graphDistance === 1) {
      relevant.push({ path: file.path, reason: "direct", distance: 1 });
    } else if (conventions.has(file.path)) {
      // A naming match with no direct import: convention
      // outranks transitive, and a convention reason always
      // carries a null distance, even when the file also
      // reaches the source through other files.
      if (graphDistance === undefined || graphDistance >= 2) {
        relevant.push({ path: file.path, reason: "convention", distance: null });
      }
    } else if (graphDistance !== undefined && graphDistance >= 2) {
      relevant.push({
        path: file.path,
        reason: "transitive",
        distance: graphDistance,
      });
    }
  }

  relevant.sort((a, b) => {
    const rankDelta = REASON_RANK[a.reason] - REASON_RANK[b.reason];
    if (rankDelta !== 0) return rankDelta;
    const distanceDelta = (a.distance ?? 0) - (b.distance ?? 0);
    if (distanceDelta !== 0) return distanceDelta;
    return byCodeUnit(a.path, b.path);
  });

  return {
    source_file: source,
    relevant_tests: relevant,
    total_files: validFiles.length,
    test_files_considered: testFiles.length,
    run_command:
      relevant.length > 0
        ? `npx tsx --test ${relevant.map((t) => t.path).join(" ")}`
        : null,
  };
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
