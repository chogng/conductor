import assert from "assert";

import {
  getDriveLetter,
  getRoot,
  hasDriveLetter,
  indexOfPath,
  isEqual,
  isEqualOrParent,
  isPathSeparator,
  toPosixPath,
  toSlashes,
} from "../../common/extpath.ts";

suite("base/test/common/extpath", () => {
  test("converts Windows paths to slash and posix forms", () => {
    assert.equal(toSlashes("C:\\data\\sample.csv"), "C:/data/sample.csv");
    assert.equal(toPosixPath("C:\\data\\sample.csv"), "/C:/data/sample.csv");
    assert.equal(toPosixPath("C:/data/sample.csv"), "/C:/data/sample.csv");
  });

  test("detects roots", () => {
    assert.equal(getRoot("/data/sample.csv"), "/");
    assert.equal(getRoot("C:/data/sample.csv"), "C:/");
    assert.equal(getRoot("file:///data/sample.csv"), "file:///");
    assert.equal(getRoot("//server/share/file.csv"), "//server/share/");
  });

  test("compares parent paths", () => {
    assert.equal(isEqual("/Data/sample.csv", "/data/sample.csv"), false);
    assert.equal(isEqual("/Data/sample.csv", "/data/sample.csv", true), true);
    assert.equal(isEqualOrParent("/data/folder/file.csv", "/data/folder", false, "/"), true);
    assert.equal(isEqualOrParent("/data/folderish/file.csv", "/data/folder", false, "/"), false);
    assert.equal(isEqualOrParent("/Data/Folder/file.csv", "/data/folder", true, "/"), true);
  });

  test("exposes small path helpers", () => {
    assert.equal(isPathSeparator("/".charCodeAt(0)), true);
    assert.equal(hasDriveLetter("C:/data", true), true);
    assert.equal(getDriveLetter("C:/data", true), "C");
    assert.equal(indexOfPath("/data/folder", "/DATA", true), 0);
  });
});
