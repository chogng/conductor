/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  formatTemplateExportFileName,
  importTemplateFile,
} from "src/cs/workbench/services/template/browser/templateFileTransfer";

suite("workbench/services/template/browser/templateFileTransfer", () => {
  test("formatTemplateExportFileName creates a safe json filename", () => {
    assert.equal(formatTemplateExportFileName("  Transfer: A/B?  "), "Transfer- A-B-.json");
    assert.equal(formatTemplateExportFileName(""), "analysis-template.json");
  });

  test("importTemplateFile reads JSON and passes source filename", async () => {
    const file = new File([JSON.stringify({ name: "demo" })], "template.json", {
      type: "application/json",
    });
    let receivedPayload;
    let receivedOptions;

    await importTemplateFile(file, (payload, options) => {
      receivedPayload = payload;
      receivedOptions = options;
    });

    assert.deepEqual(receivedPayload, { name: "demo" });
    assert.deepEqual(receivedOptions, { fileName: "template.json" });
  });
});
