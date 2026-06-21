/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { ExplorerWorkflowService } from "src/cs/workbench/contrib/files/browser/explorerWorkflowService";

suite("workbench/contrib/files/test/browser/explorerWorkflowService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("dispatches explorer workflow commands to the registered handler", () => {
    const service = store.add(new ExplorerWorkflowService());
    let importRequests = 0;
    let closeRequests = 0;
    const removedFileIds: string[] = [];
    const slicedFileIds: string[] = [];
    const registration = store.add(service.registerHandler({
      openFolderImport: () => {
        importRequests += 1;
      },
      closeFolder: () => {
        closeRequests += 1;
      },
      removeFile: fileId => {
        removedFileIds.push(fileId);
      },
      sliceFileWithTemplate: fileId => {
        slicedFileIds.push(fileId);
      },
    }));

    service.openFolderImport();
    service.closeFolder();
    service.removeFile(" file-a ");
    service.removeFile(" ");
    service.sliceFileWithTemplate(" file-c ");
    service.sliceFileWithTemplate(" ");

    assert.equal(importRequests, 1);
    assert.equal(closeRequests, 1);
    assert.deepEqual(removedFileIds, ["file-a"]);
    assert.deepEqual(slicedFileIds, ["file-c"]);

    registration.dispose();
    service.removeFile("file-b");
    service.sliceFileWithTemplate("file-d");

    assert.deepEqual(removedFileIds, ["file-a"]);
    assert.deepEqual(slicedFileIds, ["file-c"]);
    service.dispose();
  });
});
