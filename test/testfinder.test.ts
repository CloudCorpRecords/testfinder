import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findRelevantTests } from "../src/testfinder.js";

/**
 * All tests are pure local computation over inline file /
 * import maps: no filesystem, no network, and no test is
 * ever executed. Each behaviour in the spec is pinned by its
 * own case, including reason precedence, ranking, the run
 * command, the test-file definition, and every validation
 * path. Two spec judgement calls are pinned explicitly and
 * flagged in the build report: a basename ending in ".test"
 * / ".spec" counts as a test file (so the spec's own
 * extensionless-source example, src/foo -> src/foo.test, is
 * reachable), and a convention reason always carries a null
 * distance, even when the file also reaches the source
 * transitively.
 */

const file = (path: string, imports?: string[]) => ({
  path,
  ...(imports !== undefined ? { imports } : {}),
});

describe("findRelevantTests — self, direct, and transitive relevance", () => {
  it("reports the source itself with reason self when the source is a test", () => {
    const out = findRelevantTests("src/foo.test.ts", [
      file("src/foo.test.ts", ["src/foo.ts"]),
      file("src/foo.ts"),
    ]);
    assert.deepEqual(out, {
      source_file: "src/foo.test.ts",
      relevant_tests: [{ path: "src/foo.test.ts", reason: "self", distance: 0 }],
      total_files: 2,
      test_files_considered: 1,
      run_command: "npx tsx --test src/foo.test.ts",
    });
  });

  it("reports a direct importer with reason direct and distance 1", () => {
    const out = findRelevantTests("src/foo.ts", [
      file("src/foo.ts"),
      file("src/check.test.ts", ["src/foo.ts"]),
    ]);
    assert.deepEqual(out.relevant_tests, [
      { path: "src/check.test.ts", reason: "direct", distance: 1 },
    ]);
    assert.equal(out.run_command, "npx tsx --test src/check.test.ts");
    assert.equal(out.total_files, 2);
    assert.equal(out.test_files_considered, 1);
  });

  it("reports transitive importers with their shortest distances", () => {
    const out = findRelevantTests("src/foo.ts", [
      file("src/foo.ts"),
      file("src/bar.ts", ["src/foo.ts"]),
      file("src/baz.ts", ["src/bar.ts"]),
      file("src/bar.test.ts", ["src/bar.ts"]),
      file("src/baz.test.ts", ["src/baz.ts"]),
    ]);
    assert.deepEqual(out.relevant_tests, [
      { path: "src/bar.test.ts", reason: "transitive", distance: 2 },
      { path: "src/baz.test.ts", reason: "transitive", distance: 3 },
    ]);
    assert.equal(
      out.run_command,
      "npx tsx --test src/bar.test.ts src/baz.test.ts",
    );
  });

  it("resolves diamond imports to the shortest distance", () => {
    // The test reaches the source in 2 edges via a, and in
    // 3 edges via b -> c; the shortest distance wins.
    const out = findRelevantTests("src/s.ts", [
      file("src/s.ts"),
      file("src/a.ts", ["src/s.ts"]),
      file("src/c.ts", ["src/s.ts"]),
      file("src/b.ts", ["src/c.ts"]),
      file("src/t.test.ts", ["src/a.ts", "src/b.ts"]),
    ]);
    assert.deepEqual(out.relevant_tests, [
      { path: "src/t.test.ts", reason: "transitive", distance: 2 },
    ]);
  });

  it("lets distance flow through non-test files but never reports them", () => {
    const out = findRelevantTests("src/foo.ts", [
      file("src/foo.ts"),
      file("src/app.ts", ["src/foo.ts"]),
      file("src/mid.ts", ["src/foo.ts"]),
      file("src/deep.test.ts", ["src/mid.ts"]),
    ]);
    assert.deepEqual(out.relevant_tests, [
      { path: "src/deep.test.ts", reason: "transitive", distance: 2 },
    ]);
    assert.equal(out.test_files_considered, 1);
  });

  it("ignores external import names: they create no edges and no errors", () => {
    const out = findRelevantTests("src/foo.ts", [
      file("src/foo.ts", ["react"]),
      file("src/ext.test.ts", ["lodash", "left-pad"]),
      file("src/real.test.ts", ["react", "src/foo.ts"]),
    ]);
    assert.deepEqual(out.relevant_tests, [
      { path: "src/real.test.ts", reason: "direct", distance: 1 },
    ]);
    assert.equal(out.test_files_considered, 2);
    assert.equal(out.total_files, 3);
  });

  it("ignores self-imports for graph purposes", () => {
    const out = findRelevantTests("src/foo.ts", [
      file("src/foo.ts", ["src/foo.ts"]),
      file("src/lonely.test.ts", ["src/lonely.test.ts"]),
      file("src/d.test.ts", ["src/foo.ts", "src/d.test.ts"]),
    ]);
    // The lonely test imports only itself, so it never
    // reaches the source; the direct test stays direct even
    // though it also imports itself.
    assert.deepEqual(out.relevant_tests, [
      { path: "src/d.test.ts", reason: "direct", distance: 1 },
    ]);
  });

  it("de-duplicates repeated import entries", () => {
    const out = findRelevantTests("src/foo.ts", [
      file("src/foo.ts"),
      file("src/dup.test.ts", ["src/foo.ts", "src/foo.ts", "src/foo.ts"]),
    ]);
    assert.deepEqual(out.relevant_tests, [
      { path: "src/dup.test.ts", reason: "direct", distance: 1 },
    ]);
  });
});

describe("findRelevantTests — naming-convention matches", () => {
  it("matches sibling .test and .spec files inserted before the extension", () => {
    const out = findRelevantTests("src/foo.ts", [
      file("src/foo.ts"),
      file("src/foo.test.ts"),
      file("src/foo.spec.ts", []),
    ]);
    assert.deepEqual(out, {
      source_file: "src/foo.ts",
      relevant_tests: [
        { path: "src/foo.spec.ts", reason: "convention", distance: null },
        { path: "src/foo.test.ts", reason: "convention", distance: null },
      ],
      total_files: 3,
      test_files_considered: 2,
      run_command: "npx tsx --test src/foo.spec.ts src/foo.test.ts",
    });
  });

  it("matches the __tests__ sibling form for both suffixes", () => {
    const out = findRelevantTests("src/foo.ts", [
      file("src/foo.ts"),
      file("src/__tests__/foo.test.ts"),
      file("src/__tests__/foo.spec.ts"),
    ]);
    assert.deepEqual(out.relevant_tests, [
      { path: "src/__tests__/foo.spec.ts", reason: "convention", distance: null },
      { path: "src/__tests__/foo.test.ts", reason: "convention", distance: null },
    ]);
  });

  it("matches convention forms for a source with no directory", () => {
    const out = findRelevantTests("foo.ts", [
      file("foo.ts"),
      file("foo.test.ts"),
      file("__tests__/foo.test.ts"),
    ]);
    assert.deepEqual(out.relevant_tests, [
      { path: "__tests__/foo.test.ts", reason: "convention", distance: null },
      { path: "foo.test.ts", reason: "convention", distance: null },
    ]);
  });

  it("appends the suffix for an extensionless source, in both forms and suffixes", () => {
    // Pinned judgement call: "src/foo.test" has no ".test."
    // substring, so it counts as a test file via the
    // trailing-suffix rule; without that rule the spec's
    // extensionless example could never be relevant.
    const out = findRelevantTests("src/foo", [
      file("src/foo"),
      file("src/foo.test"),
      file("src/foo.spec"),
      file("src/__tests__/foo.test"),
      file("src/__tests__/foo.spec"),
    ]);
    assert.deepEqual(out.relevant_tests, [
      { path: "src/__tests__/foo.spec", reason: "convention", distance: null },
      { path: "src/__tests__/foo.test", reason: "convention", distance: null },
      { path: "src/foo.spec", reason: "convention", distance: null },
      { path: "src/foo.test", reason: "convention", distance: null },
    ]);
    assert.equal(out.test_files_considered, 4);
    assert.equal(out.total_files, 5);
    assert.equal(
      out.run_command,
      "npx tsx --test src/__tests__/foo.spec src/__tests__/foo.test src/foo.spec src/foo.test",
    );
  });

  it("inserts before the final extension only for multi-dot sources", () => {
    const out = findRelevantTests("src/foo.bar.ts", [
      file("src/foo.bar.ts"),
      file("src/foo.bar.test.ts"),
      file("src/foo.test.ts"),
    ]);
    // src/foo.test.ts is a test file but matches no
    // convention for src/foo.bar.ts and imports nothing.
    assert.deepEqual(out.relevant_tests, [
      { path: "src/foo.bar.test.ts", reason: "convention", distance: null },
    ]);
    assert.equal(out.test_files_considered, 2);
  });
});

describe("findRelevantTests — reason precedence", () => {
  it("prefers direct over convention for a file that is both", () => {
    const out = findRelevantTests("src/foo.ts", [
      file("src/foo.ts"),
      file("src/foo.test.ts", ["src/foo.ts"]),
    ]);
    assert.deepEqual(out.relevant_tests, [
      { path: "src/foo.test.ts", reason: "direct", distance: 1 },
    ]);
  });

  it("prefers convention over transitive, with a null distance", () => {
    // Pinned judgement call: the convention file reaches the
    // source in 2 edges via mid, but its reason is
    // convention, and a convention reason carries null.
    const out = findRelevantTests("src/foo.ts", [
      file("src/foo.ts"),
      file("src/mid.ts", ["src/foo.ts"]),
      file("src/foo.test.ts", ["src/mid.ts"]),
    ]);
    assert.deepEqual(out.relevant_tests, [
      { path: "src/foo.test.ts", reason: "convention", distance: null },
    ]);
  });

  it("prefers self over a transitive loop back to the source", () => {
    const out = findRelevantTests("src/a.test.ts", [
      file("src/a.test.ts", ["src/b.ts"]),
      file("src/b.ts", ["src/a.test.ts"]),
    ]);
    assert.deepEqual(out.relevant_tests, [
      { path: "src/a.test.ts", reason: "self", distance: 0 },
    ]);
  });
});

describe("findRelevantTests — ranking and run command", () => {
  it("ranks by reason, then distance, then path, and builds the run command in that order", () => {
    const out = findRelevantTests("src/s.test.ts", [
      file("src/s.test.ts"),
      file("src/z-direct.test.ts", ["src/s.test.ts"]),
      file("src/a-direct.test.ts", ["src/s.test.ts"]),
      file("src/s.test.test.ts"),
      file("src/mid1.ts", ["src/s.test.ts"]),
      file("src/mid2.ts", ["src/mid1.ts"]),
      file("src/near.test.ts", ["src/mid1.ts"]),
      file("src/far.test.ts", ["src/mid2.ts"]),
    ]);
    assert.deepEqual(out, {
      source_file: "src/s.test.ts",
      relevant_tests: [
        { path: "src/s.test.ts", reason: "self", distance: 0 },
        { path: "src/a-direct.test.ts", reason: "direct", distance: 1 },
        { path: "src/z-direct.test.ts", reason: "direct", distance: 1 },
        { path: "src/s.test.test.ts", reason: "convention", distance: null },
        { path: "src/near.test.ts", reason: "transitive", distance: 2 },
        { path: "src/far.test.ts", reason: "transitive", distance: 3 },
      ],
      total_files: 8,
      test_files_considered: 6,
      run_command:
        "npx tsx --test src/s.test.ts src/a-direct.test.ts src/z-direct.test.ts src/s.test.test.ts src/near.test.ts src/far.test.ts",
    });
  });

  it("returns an empty list and a null run command when nothing is relevant", () => {
    const out = findRelevantTests("src/foo.ts", [
      file("src/foo.ts"),
      file("src/bar.ts"),
      file("src/unrelated.test.ts", ["src/bar.ts"]),
    ]);
    assert.deepEqual(out, {
      source_file: "src/foo.ts",
      relevant_tests: [],
      total_files: 3,
      test_files_considered: 1,
      run_command: null,
    });
  });
});

describe("findRelevantTests — counting and the test-file definition", () => {
  it("counts every test file in the set, relevant or not, across all definition forms", () => {
    const out = findRelevantTests("src/foo.ts", [
      file("src/foo.ts"),
      file("src/foo.test.ts", ["src/foo.ts"]),
      file("src/bar.spec.ts"),
      file("tests/util.ts"),
      file("src/test/helper.ts"),
      file("docs/readme.md"),
    ]);
    assert.deepEqual(out.relevant_tests, [
      { path: "src/foo.test.ts", reason: "direct", distance: 1 },
    ]);
    assert.equal(out.total_files, 6);
    // .test. file, .spec. file, a "tests" segment file, and
    // a "test" segment file; the readme is not a test file.
    assert.equal(out.test_files_considered, 4);
  });

  it("treats an omitted imports field the same as an empty one", () => {
    const omitted = findRelevantTests("src/foo.ts", [
      file("src/foo.ts"),
      file("src/foo.test.ts"),
    ]);
    const explicit = findRelevantTests("src/foo.ts", [
      file("src/foo.ts", []),
      file("src/foo.test.ts", []),
    ]);
    assert.deepEqual(omitted, explicit);
  });
});

describe("findRelevantTests — validation", () => {
  it("rejects a missing source_file", () => {
    assert.throws(
      () => findRelevantTests(undefined, [file("src/a.ts")]),
      /source_file is required/,
    );
  });

  it("rejects an empty or non-string source_file", () => {
    assert.throws(
      () => findRelevantTests("", [file("src/a.ts")]),
      /source_file must be a non-empty string/,
    );
    assert.throws(
      () => findRelevantTests(42, [file("src/a.ts")]),
      /source_file must be a non-empty string/,
    );
  });

  it("rejects a source_file outside the set with the exact spec message", () => {
    let caught: unknown;
    try {
      findRelevantTests("src/nope.ts", [file("src/a.ts")]);
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof Error);
    assert.equal(
      caught.message,
      'source_file "src/nope.ts" is not present in files',
    );
  });

  it("rejects missing files", () => {
    assert.throws(
      () => findRelevantTests("src/a.ts", undefined),
      /files is required/,
    );
  });

  it("rejects empty or non-array files", () => {
    assert.throws(
      () => findRelevantTests("src/a.ts", []),
      /files must be a non-empty array/,
    );
    assert.throws(
      () => findRelevantTests("src/a.ts", "nope"),
      /files must be a non-empty array/,
    );
  });

  it("rejects a file entry that is not an object, naming the path", () => {
    assert.throws(
      () => findRelevantTests("src/a.ts", [42]),
      /files\[0\] must be an object/,
    );
    assert.throws(
      () => findRelevantTests("src/a.ts", [file("src/a.ts"), "b"]),
      /files\[1\] must be an object/,
    );
  });

  it("rejects a file missing its path, naming the path", () => {
    assert.throws(
      () => findRelevantTests("src/a.ts", [{ imports: [] }]),
      /files\[0\]\.path is required/,
    );
  });

  it("rejects an empty or non-string file path, naming the path", () => {
    assert.throws(
      () => findRelevantTests("src/a.ts", [file("")]),
      /files\[0\]\.path must be a non-empty string/,
    );
    assert.throws(
      () => findRelevantTests("src/a.ts", [{ path: 42 }]),
      /files\[0\]\.path must be a non-empty string/,
    );
  });

  it("rejects a duplicate file path, naming the second occurrence", () => {
    assert.throws(
      () =>
        findRelevantTests("src/a.ts", [
          file("src/a.ts"),
          file("src/b.ts"),
          file("src/a.ts"),
        ]),
      /files\[2\]\.path duplicates files\[0\]\.path "src\/a\.ts"/,
    );
  });

  it("rejects a non-array imports field, naming the path", () => {
    assert.throws(
      () =>
        findRelevantTests("src/a.ts", [
          { path: "src/a.ts", imports: "src/b.ts" },
        ]),
      /files\[0\]\.imports must be an array/,
    );
  });

  it("rejects a non-string imports entry, naming the path", () => {
    assert.throws(
      () =>
        findRelevantTests("src/a.ts", [
          file("src/a.ts"),
          { path: "src/b.ts", imports: [42] },
        ]),
      /files\[1\]\.imports\[0\] must be a string/,
    );
  });

  it("never rejects an import name outside the set: it is external, not unknown", () => {
    assert.doesNotThrow(() =>
      findRelevantTests("src/a.ts", [file("src/a.ts", ["totally-external"])]),
    );
  });
});
