import assert from "node:assert/strict";
import test from "node:test";

import { extname, posix, win32 } from "./path.ts";

test("returns file extensions from windows paths", () => {
    assert.equal(extname("C:\\data\\sample.csv"), ".csv");
    assert.equal(win32.extname("C:/data/archive.tar.gz"), ".gz");
});

test("returns file extensions from posix paths", () => {
    assert.equal(posix.extname("/data/sample.csv"), ".csv");
    assert.equal(posix.extname("/data/.profile"), "");
});

test("ignores directory dots and trailing separators", () => {
    assert.equal(extname("C:\\data.v1\\sample"), "");
    assert.equal(extname("C:\\data\\sample.csv\\"), ".csv");
});
