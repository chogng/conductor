/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ExplorerWorkflowService } from "src/cs/workbench/contrib/files/browser/explorerWorkflowService";

suite("workbench/contrib/files/test/browser/explorerWorkflowService", () => {
  test("dispatches explorer workflow commands to the registered handler", () => {
    const service = new ExplorerWorkflowService();
    let importRequests = 0;
    let closeRequests = 0;
    const removedFileIds: string[] = [];
    const registration = service.registerHandler({
      openFolderImport: () => {
        importRequests += 1;
      },
      closeFolder: () => {
        closeRequests += 1;
      },
      removeFile: fileId => {
        removedFileIds.push(fileId);
      },
    });

    service.openFolderImport();
    service.closeFolder();
    service.removeFile(" file-a ");
    service.removeFile(" ");

    assert.equal(importRequests, 1);
    assert.equal(closeRequests, 1);
    assert.deepEqual(removedFileIds, ["file-a"]);

    registration.dispose();
    service.removeFile("file-b");

    assert.deepEqual(removedFileIds, ["file-a"]);
    service.dispose();
  });
});
