/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { TemplateViewStateService } from "src/cs/workbench/contrib/template/browser/templateViewStateService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { createEmptyTemplateEditorConfig } from "src/cs/workbench/services/template/common/templateEditorConfig";

suite("workbench/contrib/template/browser/templateViewStateService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("editTemplate publishes editor state", () => {
    const service = new TemplateViewStateService();
    const template = {
      ...createEmptyTemplateEditorConfig({
        name: "Transfer",
      }),
      id: "template-a",
    };
    let latestMode = "";
    const disposable = service.onDidChangeTemplateState(state => {
      latestMode = state.mode;
    });

    assert.equal(service.editTemplate(template), true);

    assert.deepEqual(service.getState(), {
      mode: "editor",
      selectedTemplateId: "template-a",
      formState: createEmptyTemplateEditorConfig({
        name: "Transfer",
      }),
    });
    assert.equal(latestMode, "editor");

    disposable.dispose();
    service.dispose();
  });

  test("finishes template editor into management state", () => {
    const service = new TemplateViewStateService();
    const savedTemplate = {
      ...createEmptyTemplateEditorConfig({
        name: "Transfer",
      }),
      id: "template-a",
    };

    service.createTemplateDraft();
    service.finishTemplateEditor(savedTemplate);

    assert.deepEqual(service.getState(), {
      mode: "management",
      selectedTemplateId: "template-a",
      formState: createEmptyTemplateEditorConfig({
        name: "Transfer",
      }),
    });
    service.dispose();
  });

  test("cancels template editor with fallback or an empty form", () => {
    const service = new TemplateViewStateService();
    const fallbackTemplate = {
      ...createEmptyTemplateEditorConfig({
        name: "Output",
      }),
      id: "template-b",
    };

    service.editTemplate(fallbackTemplate);
    service.setFormState(createEmptyTemplateEditorConfig({
      name: "Draft",
    }));
    service.cancelTemplateEditor({
      fallbackTemplate,
    });

    assert.deepEqual(service.getState(), {
      mode: "management",
      selectedTemplateId: "template-b",
      formState: createEmptyTemplateEditorConfig({
        name: "Output",
      }),
    });

    service.createTemplateDraft();
    service.cancelTemplateEditor();

    assert.deepEqual(service.getState(), {
      mode: "management",
      selectedTemplateId: null,
      formState: createEmptyTemplateEditorConfig(),
    });
    service.dispose();
  });
});
