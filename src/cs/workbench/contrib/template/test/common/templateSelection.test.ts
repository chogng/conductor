import assert from "assert";

import {
  createTemplateSelection,
  getTemplateSelectionId,
  removeTemplateSelectionsForFiles,
  resolveTemplateSelectionForFile,
} from "../../common/templateSelection.ts";

suite("workbench/contrib/template/test/common/templateSelection", () => {
  test("creates auto selection from empty or auto ids", () => {
    assert.deepEqual(createTemplateSelection(null), { kind: "auto" });
    assert.deepEqual(createTemplateSelection("__auto__"), { kind: "auto" });
  });

  test("creates saved template selection from template id", () => {
    assert.deepEqual(createTemplateSelection("template-a"), {
      kind: "template",
      templateId: "template-a",
    });
  });

  test("resolves file selection before current selection", () => {
    const current = createTemplateSelection("template-current");
    const selection = resolveTemplateSelectionForFile(
      "file-a",
      {
        "file-a": createTemplateSelection("template-file"),
      },
      current,
    );

    assert.equal(getTemplateSelectionId(selection), "template-file");
  });

  test("falls back to current selection when file has no override", () => {
    const current = createTemplateSelection("template-current");
    const selection = resolveTemplateSelectionForFile("file-a", {}, current);

    assert.equal(getTemplateSelectionId(selection), "template-current");
  });

  test("removes selections for deleted files", () => {
    const selections = {
      "file-a": createTemplateSelection("template-a"),
      "file-b": createTemplateSelection("template-b"),
    };
    const next = removeTemplateSelectionsForFiles(selections, ["file-a"]);

    assert.deepEqual(next, {
      "file-b": createTemplateSelection("template-b"),
    });
  });
});
