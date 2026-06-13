/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { BrowserTemplateService } from "src/cs/workbench/services/template/browser/templateService";
import { createEmptyTemplateConfig } from "src/cs/workbench/services/template/common/templateConfigUtils";

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

  test("editTemplate publishes editor state", () => {
    const service = new BrowserTemplateService();
    const template = {
      ...createEmptyTemplateConfig({
        name: "Transfer",
        stopOnError: true,
      }),
      id: "template-a",
    };
    let latestMode = "";
    const disposable = service.onDidChangeTemplateState((state) => {
      latestMode = state.mode;
    });

    assert.equal(service.editTemplate(template), true);

    assert.deepEqual(service.getState(), {
      mode: "save",
      selectedTemplateId: "template-a",
      formState: createEmptyTemplateConfig({
        name: "Transfer",
        stopOnError: true,
      }),
      selectionsByFileId: {},
      templateListVersion: 0,
    });
    assert.equal(latestMode, "save");

    disposable.dispose();
    service.dispose();
  });
});
