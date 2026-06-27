import assert from "assert";

import { basename, extname, posix, win32 } from "../../common/path.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/common/path", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns file extensions from windows paths", () => {
    assert.equal(extname("C:\\data\\sample.csv"), ".csv");
    assert.equal(win32.extname("C:/data/archive.tar.gz"), ".gz");
  });

  test("returns base names from windows paths", () => {
    assert.equal(basename("C:\\data\\sample.csv"), "sample.csv");
    assert.equal(win32.basename("C:/data/archive.tar.gz", ".gz"), "archive.tar");
    assert.equal(win32.basename("C:\\"), "");
  });

  test("returns file extensions from posix paths", () => {
    assert.equal(posix.extname("/data/sample.csv"), ".csv");
    assert.equal(posix.extname("/data/.profile"), "");
  });

  test("returns base names from posix paths", () => {
    assert.equal(posix.basename("/data/sample.csv"), "sample.csv");
    assert.equal(posix.basename("/data/archive.tar.gz", ".gz"), "archive.tar");
    assert.equal(posix.basename("/data/folder/"), "folder");
    assert.equal(posix.basename("/"), "");
  });

  test("ignores directory dots and trailing separators", () => {
    assert.equal(extname("C:\\data.v1\\sample"), "");
    assert.equal(extname("C:\\data\\sample.csv\\"), ".csv");
  });
});
