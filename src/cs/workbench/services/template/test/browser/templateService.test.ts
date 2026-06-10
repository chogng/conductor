/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { BrowserTemplateService } from "src/cs/workbench/services/template/browser/templateService";

suite("workbench/services/template/browser/templateService", () => {
  test("publishes template view input", () => {
    const service = new BrowserTemplateService();
    const input = {
      conductorSettings: { theme: "light" },
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

    assert.equal(service.getViewInput(), input);
    assert.deepEqual(inputs, [input]);
    disposable.dispose();
    service.dispose();
  });
});
