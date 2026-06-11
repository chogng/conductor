/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ExplorerFileNestingTrie } from "src/cs/workbench/contrib/files/common/explorerFileNestingTrie";

suite("workbench/contrib/files/common/explorerFileNestingTrie", () => {
  test("nests captured child patterns under matching parents", () => {
    const trie = new ExplorerFileNestingTrie([
      ["*.csv", ["$(basename).meta.csv", "$(basename).notes.txt"]],
    ]);

    const nesting = trie.nest([
      "device.csv",
      "device.meta.csv",
      "device.notes.txt",
      "other.meta.csv",
    ], "batch");

    assert.deepEqual([...(nesting.get("device.csv") ?? [])].sort(), [
      "device.meta.csv",
      "device.notes.txt",
    ]);
    assert.deepEqual([...(nesting.get("other.meta.csv") ?? [])], []);
  });

  test("flattens chained nesting to root ancestors", () => {
    const trie = new ExplorerFileNestingTrie([
      ["*.ts", ["$(basename).js"]],
      ["*.js", ["$(basename).min.js"]],
    ]);

    const nesting = trie.nest([
      "index.ts",
      "index.js",
      "index.min.js",
    ], "src");

    assert.deepEqual([...(nesting.get("index.ts") ?? [])].sort(), [
      "index.js",
      "index.min.js",
    ]);
  });
});
