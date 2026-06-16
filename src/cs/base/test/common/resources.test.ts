import assert from "assert";

import {
  basename,
  basenameOrAuthority,
  dirname,
  distinctParents,
  extUri,
  extUriIgnorePathCase,
  extname,
  joinPath,
  relativePath,
  addTrailingPathSeparator,
  removeTrailingPathSeparator,
  resolvePath,
} from "../../common/resources.ts";
import { URI } from "../../common/uri.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/common/resources", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("resolves URI path names", () => {
    const resource = URI.file("/data/sample.csv");

    assert.equal(basename(resource), "sample.csv");
    assert.equal(extname(resource), ".csv");
    assert.equal(dirname(resource).path, "/data");
    assert.equal(dirname(URI.file("/")).path, "/");
  });

  test("joins and resolves paths without encoding file names into fs paths", () => {
    const root = URI.file("/data");

    assert.equal(joinPath(root, "folder", "sample file.csv").path, "/data/folder/sample file.csv");
    assert.equal(resolvePath(root, "../other/sample.csv").path, "/other/sample.csv");
  });

  test("compares resources with upstream-style casing helpers", () => {
    const first = URI.file("/Data/Sample.csv");
    const second = URI.file("/data/sample.csv");

    assert.equal(extUri.isEqual(first, second), false);
    assert.equal(extUriIgnorePathCase.isEqual(first, second), true);
    assert.equal(extUriIgnorePathCase.isEqualOrParent(first, URI.file("/data")), true);
  });

  test("supports authority and fragment handling", () => {
    const first = URI.from({
      authority: "Example.com",
      fragment: "one",
      path: "/workspace/file.csv",
      scheme: "memfs",
    });
    const second = URI.from({
      authority: "Example.com",
      fragment: "two",
      path: "/workspace/file.csv",
      scheme: "memfs",
    });

    assert.equal(basenameOrAuthority(URI.from({ authority: "remote", path: "/", scheme: "memfs" })), "remote");
    assert.equal(extUri.isEqualOrParent(first, URI.from({ authority: "example.com", path: "/workspace", scheme: "memfs" }), true), true);
    assert.equal(extUri.isEqual(first, second), false);
    assert.equal(extUri.isEqual(first, second, true), true);
  });

  test("computes relative paths and trims trailing separators", () => {
    const from = URI.file("/data/folder");
    const to = URI.file("/data/folder/nested/sample.csv");

    assert.equal(relativePath(from, to), "nested/sample.csv");
    assert.equal(removeTrailingPathSeparator(URI.file("/data/folder/")).path, "/data/folder");
    assert.equal(addTrailingPathSeparator(URI.file("/data/folder")).path, "/data/folder/");
    assert.equal(addTrailingPathSeparator(URI.file("/")).path, "/");
  });

  test("filters nested parents", () => {
    const resources = [
      URI.file("/data"),
      URI.file("/data/nested/sample.csv"),
      URI.file("/other/sample.csv"),
    ];

    assert.deepEqual(distinctParents(resources, resource => resource).map(resource => resource.path), [
      "/data",
      "/other/sample.csv",
    ]);
  });
});
