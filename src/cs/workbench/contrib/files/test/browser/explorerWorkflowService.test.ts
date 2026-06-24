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
    }));

    service.openFolderImport();
    service.closeFolder();
    service.closeFile(" file-a ");
    service.closeFile(" ");
    service.deleteFile(" file-b ");
    service.deleteFile(" ");

    assert.equal(importRequests, 1);
    assert.equal(closeRequests, 1);
    assert.deepEqual(closedFileIds, ["file-a"]);
    assert.deepEqual(deletedFileIds, ["file-b"]);

    registration.dispose();
    service.closeFile("file-d");
    service.deleteFile("file-e");

    assert.deepEqual(closedFileIds, ["file-a"]);
    assert.deepEqual(deletedFileIds, ["file-b"]);
    service.dispose();
  });
});
