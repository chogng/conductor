/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { BrowserTemplateService } from "src/cs/workbench/services/template/browser/templateService";

suite("workbench/services/template/browser/templateService", () => {
  test("publishes template view input", () => {
    const service = new BrowserTemplateService();
    const input = {
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
      }],
    };
    let changeCount = 0;
    const disposable = service.onDidChangeTemplateViewInput(() => {
      changeCount += 1;
    });

    service.updateViewInput(input);
    service.updateViewInput({
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
      }],
    });

    assert.equal(service.getViewInput(), input);
    assert.equal(changeCount, 1);
    disposable.dispose();
    service.dispose();
  });
});
