import test from "node:test";
import assert from "node:assert/strict";

import {
  formatTemplateExportFileName,
  importTemplateFile,
} from "./templateController.ts";

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
