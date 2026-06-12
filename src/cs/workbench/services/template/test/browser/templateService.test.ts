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
    const inputs: unknown[] = [];
    const disposable = service.onDidChangeTemplateViewInput(nextInput => {
      inputs.push(nextInput);
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
    assert.deepEqual(inputs, [input]);
    disposable.dispose();
    service.dispose();
  });
});
