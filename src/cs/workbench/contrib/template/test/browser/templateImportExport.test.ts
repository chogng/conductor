/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
  formatTemplateExportFileName,
  importTemplateFile,
} from "src/cs/workbench/contrib/template/browser/templateImportExport";

suite("workbench/contrib/template/browser/templateImportExport", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

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
