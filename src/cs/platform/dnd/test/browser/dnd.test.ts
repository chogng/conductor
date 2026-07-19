/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert";
import { extractFileSystemHandles } from "src/cs/platform/dnd/browser/dnd";
import type {
  FileSystemFileHandle,
} from "src/cs/platform/files/browser/webFileSystemAccess";

suite("platform/dnd/test/browser/dnd", () => {
  test("extracts valid file system handles without requiring a file provider", async () => {
    const handle: FileSystemFileHandle = {
      kind: "file",
      name: "transfer.csv",
      getFile: async () => new File([], "transfer.csv"),
    };
    const items = [
      {
        getAsFileSystemHandle: async () => handle,
      },
      {
        getAsFileSystemHandle: async () => null,
      },
      {
        getAsFileSystemHandle: async () => {
          throw new Error("Handle access failed.");
        },
      },
    ] as unknown as DataTransferItemList;

    assert.deepEqual(await extractFileSystemHandles(items), [handle]);
  });
});
