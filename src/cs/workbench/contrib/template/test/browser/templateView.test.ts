import assert from "assert";

import { createEmptyTemplateEditorConfig } from "src/cs/workbench/services/template/common/templateEditorConfig";
import {
  createTemplateManagementViewState,
  resolveTemplateSaveId,
  shouldSyncTemplateEditorTableSelection,
} from "src/cs/workbench/contrib/template/browser/views/templateView";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/template/test/browser/templateView", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const autoTemplateSelectionId = "auto";

  test("createTemplateManagementViewState uses loaded templates for the selected label", () => {
    const config = createEmptyTemplateEditorConfig({
      name: "Transfer",
    });

    assert.deepEqual(
      createTemplateManagementViewState({
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

  test("createTemplateManagementViewState falls back to recommended label and draft stop-on-error", () => {
    const config = createEmptyTemplateEditorConfig({
      name: "",
      stopOnError: false,
    });

    const state = createTemplateManagementViewState({
      config,
      selectedTemplateId: autoTemplateSelectionId,
      stopOnErrorDraft: true,
      templates: null,
    });

    assert.equal(state.canDeleteTemplate, false);
    assert.equal(state.selectedTemplateLabel, "template.recommendedTemplate");
    assert.equal(state.stopOnError, true);
  });

  test("createTemplateManagementViewState falls back to selected template id before templates load", () => {
    const state = createTemplateManagementViewState({
      config: createEmptyTemplateEditorConfig(),
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
