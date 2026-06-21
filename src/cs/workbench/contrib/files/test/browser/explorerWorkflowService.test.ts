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
    const closedFileIds: string[] = [];
    const deletedFileIds: string[] = [];
    const slicedFileIds: string[] = [];
    const registration = store.add(service.registerHandler({
      openFolderImport: () => {
        importRequests += 1;
      },
      closeFolder: () => {
        closeRequests += 1;
      },
      closeFile: fileId => {
        closedFileIds.push(fileId);
      },
      deleteFile: fileId => {
        deletedFileIds.push(fileId);
      },
      sliceFileWithTemplate: fileId => {
        slicedFileIds.push(fileId);
      },
    }));

    service.openFolderImport();
    service.closeFolder();
    service.closeFile(" file-a ");
    service.closeFile(" ");
    service.deleteFile(" file-b ");
    service.deleteFile(" ");
    service.sliceFileWithTemplate(" file-c ");
    service.sliceFileWithTemplate(" ");

    assert.equal(importRequests, 1);
    assert.equal(closeRequests, 1);
    assert.deepEqual(closedFileIds, ["file-a"]);
    assert.deepEqual(deletedFileIds, ["file-b"]);
    assert.deepEqual(slicedFileIds, ["file-c"]);

    registration.dispose();
    service.closeFile("file-d");
    service.deleteFile("file-e");
    service.sliceFileWithTemplate("file-d");

    assert.deepEqual(closedFileIds, ["file-a"]);
    assert.deepEqual(deletedFileIds, ["file-b"]);
    assert.deepEqual(slicedFileIds, ["file-c"]);
    service.dispose();
  });
});
