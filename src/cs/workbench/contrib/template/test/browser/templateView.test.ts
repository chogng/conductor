import assert from "assert";

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
    assert.deepEqual(
      createTemplateManagementViewState({
        selectedTemplateId: "template-a",
        templates: [{ id: "template-a", name: "Loaded template" }],
      }),
      {
        canDeleteTemplate: true,
        selectedTemplateLabel: "Loaded template",
      },
    );
  });

  test("createTemplateManagementViewState falls back to the recommended label", () => {
    const state = createTemplateManagementViewState({
      selectedTemplateId: autoTemplateSelectionId,
      templates: null,
    });

    assert.equal(state.canDeleteTemplate, false);
    assert.equal(state.selectedTemplateLabel, "template.recommendedTemplate");
  });

  test("createTemplateManagementViewState falls back to selected template id before templates load", () => {
    const state = createTemplateManagementViewState({
      selectedTemplateId: "template-a",
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
