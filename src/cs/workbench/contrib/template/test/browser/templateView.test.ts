import assert from "assert";

import { createEmptyTemplateConfig } from "src/cs/workbench/contrib/template/common/templateManagerUtils";
import { AUTO_TEMPLATE_ID } from "src/cs/workbench/contrib/template/common/autoTemplate";
import { createTemplateApplyViewState } from "src/cs/workbench/contrib/template/browser/views/templateView";

suite("workbench/contrib/template/test/browser/templateView", () => {
  test("createTemplateApplyViewState uses loaded templates for the selected label", () => {
    const config = createEmptyTemplateConfig({
      name: "Transfer",
    });

    assert.deepEqual(
      createTemplateApplyViewState({
        config,
        selectedTemplateId: "template-a",
        stopOnErrorDraft: null,
        templates: [{ id: "template-a", name: "Loaded template" }],
      }),
      {
        canDeleteTemplate: true,
        canExportTemplate: true,
        selectedTemplateLabel: "Loaded template",
        stopOnError: false,
      },
    );
  });

  test("createTemplateApplyViewState falls back to auto label and draft stop-on-error", () => {
    const config = createEmptyTemplateConfig({
      name: "",
      stopOnError: false,
    });

    const state = createTemplateApplyViewState({
      config,
      selectedTemplateId: AUTO_TEMPLATE_ID,
      stopOnErrorDraft: true,
      templates: null,
    });

    assert.equal(state.canDeleteTemplate, false);
    assert.equal(state.canExportTemplate, false);
    assert.equal(state.selectedTemplateLabel, "template_auto_extraction");
    assert.equal(state.stopOnError, true);
  });

  test("createTemplateApplyViewState falls back to selected template id before templates load", () => {
    const state = createTemplateApplyViewState({
      config: createEmptyTemplateConfig(),
      selectedTemplateId: "template-a",
      stopOnErrorDraft: null,
      templates: null,
    });

    assert.equal(state.canDeleteTemplate, true);
    assert.equal(state.selectedTemplateLabel, "template-a");
  });
});
