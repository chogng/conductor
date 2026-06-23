/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { TemplateViewStateService } from "src/cs/workbench/contrib/template/browser/templateViewStateService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { createEmptyTemplateApplyConfig } from "src/cs/workbench/services/template/common/templateApplyConfigUtils";

suite("workbench/contrib/template/browser/templateViewStateService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("editTemplate publishes editor state", () => {
    const service = new TemplateViewStateService();
    const template = {
      ...createEmptyTemplateApplyConfig({
        name: "Transfer",
        stopOnError: true,
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
      formState: createEmptyTemplateApplyConfig({
        name: "Transfer",
        stopOnError: true,
      }),
    });
    assert.equal(latestMode, "editor");

    disposable.dispose();
    service.dispose();
  });

  test("finishes template editor into management state", () => {
    const service = new TemplateViewStateService();
    const savedTemplate = {
      ...createEmptyTemplateApplyConfig({
        name: "Transfer",
        stopOnError: true,
      }),
      id: "template-a",
    };

    service.createTemplateDraft();
    service.finishTemplateEditor(savedTemplate);

    assert.deepEqual(service.getState(), {
      mode: "management",
      selectedTemplateId: "template-a",
      formState: createEmptyTemplateApplyConfig({
        name: "Transfer",
        stopOnError: true,
      }),
    });
    service.dispose();
  });

  test("cancels template editor with fallback or stop-on-error preference", () => {
    const service = new TemplateViewStateService();
    const fallbackTemplate = {
      ...createEmptyTemplateApplyConfig({
        name: "Output",
        stopOnError: true,
      }),
      id: "template-b",
    };

    service.editTemplate(fallbackTemplate);
    service.setFormState(createEmptyTemplateApplyConfig({
      name: "Draft",
      stopOnError: false,
    }));
    service.cancelTemplateEditor({
      fallbackTemplate,
    });

    assert.deepEqual(service.getState(), {
      mode: "management",
      selectedTemplateId: "template-b",
      formState: createEmptyTemplateApplyConfig({
        name: "Output",
        stopOnError: true,
      }),
    });

    service.createTemplateDraft({ stopOnError: true });
    service.cancelTemplateEditor({ stopOnError: true });

    assert.deepEqual(service.getState(), {
      mode: "management",
      selectedTemplateId: null,
      formState: createEmptyTemplateApplyConfig({
        stopOnError: true,
      }),
    });
    service.dispose();
  });
});
