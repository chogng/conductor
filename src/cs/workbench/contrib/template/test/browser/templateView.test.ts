import assert from "assert";

import { createEmptyTemplateApplyConfig } from "src/cs/workbench/services/template/common/templateApplyConfigUtils";
import {
  createTemplateApplyViewState,
  resolveTemplateSaveId,
  shouldSyncTemplateEditorTableSelection,
} from "src/cs/workbench/contrib/template/browser/views/templateView";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/template/test/browser/templateView", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const autoTemplateSelectionId = "auto";

  test("createTemplateApplyViewState uses loaded templates for the selected label", () => {
    const config = createEmptyTemplateApplyConfig({
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
        selectedTemplateLabel: "Loaded template",
        stopOnError: false,
      },
    );
  });

  test("createTemplateApplyViewState falls back to recommended label and draft stop-on-error", () => {
    const config = createEmptyTemplateApplyConfig({
      name: "",
      stopOnError: false,
    });

    const state = createTemplateApplyViewState({
      config,
      selectedTemplateId: autoTemplateSelectionId,
      stopOnErrorDraft: true,
      templates: null,
    });

    assert.equal(state.canDeleteTemplate, false);
    assert.equal(state.selectedTemplateLabel, "template.recommendedTemplate");
    assert.equal(state.stopOnError, true);
  });

  test("createTemplateApplyViewState falls back to selected template id before templates load", () => {
    const state = createTemplateApplyViewState({
      config: createEmptyTemplateApplyConfig(),
      selectedTemplateId: "template-a",
      stopOnErrorDraft: null,
      templates: null,
    });

    assert.equal(state.canDeleteTemplate, true);
    assert.equal(state.selectedTemplateLabel, "template-a");
  });

  test("syncs template table selection only in the template editor", () => {
    assert.equal(shouldSyncTemplateEditorTableSelection("management"), false);
    assert.equal(shouldSyncTemplateEditorTableSelection("editor"), true);
  });

  test("resolves custom template id for editor saves", () => {
    assert.equal(resolveTemplateSaveId(" template-a "), "template-a");
    assert.equal(resolveTemplateSaveId(autoTemplateSelectionId), undefined);
    assert.equal(resolveTemplateSaveId(null), undefined);
  });
});
