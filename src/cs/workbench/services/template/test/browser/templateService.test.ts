/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter } from "src/cs/base/common/event";
import { BrowserTemplateService } from "src/cs/workbench/services/template/browser/templateService";
import { AUTO_TEMPLATE_ID } from "src/cs/workbench/services/template/common/autoTemplate";
import type { ITemplateStoreService } from "src/cs/workbench/services/template/common/templateStore";
import { createEmptyTemplateConfig } from "src/cs/workbench/services/template/common/templateConfigUtils";
import { createTemplateSelection } from "src/cs/workbench/services/template/common/templateSelection";
import type { ISessionService } from "src/cs/workbench/services/session/common/session";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/template/browser/templateService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("publishes template view input", () => {
    const { service } = createTemplateServiceForTest();
    const input = {
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
      }],
    };
    let changeCount = 0;
    const disposable = service.onDidChangeTemplateViewInput(() => {
      changeCount += 1;
    });

    service.updateViewInput(input);
    service.updateViewInput({
      rawFiles: [{
        file: {},
        fileId: "file-a",
        fileName: "Raw.csv",
      }],
    });

    assert.equal(service.getViewInput(), input);
    assert.equal(changeCount, 1);
    disposable.dispose();
    service.dispose();
  });

  test("editTemplate publishes editor state", () => {
    const { service } = createTemplateServiceForTest();
    const template = {
      ...createEmptyTemplateConfig({
        name: "Transfer",
        stopOnError: true,
      }),
      id: "template-a",
    };
    let latestMode = "";
    const disposable = service.onDidChangeTemplateState((state) => {
      latestMode = state.mode;
    });

    assert.equal(service.editTemplate(template), true);

    assert.deepEqual(service.getState(), {
      mode: "editor",
      selectedTemplateId: "template-a",
      formState: createEmptyTemplateConfig({
        name: "Transfer",
        stopOnError: true,
      }),
      selectionsByFileId: {},
      templateListVersion: 0,
    });
    assert.equal(latestMode, "editor");

    disposable.dispose();
    service.dispose();
  });

  test("finishes template editor through service owner state", () => {
    const { service } = createTemplateServiceForTest();
    const savedTemplate = {
      ...createEmptyTemplateConfig({
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
      formState: createEmptyTemplateConfig({
        name: "Transfer",
        stopOnError: true,
      }),
      selectionsByFileId: {},
      templateListVersion: 0,
    });
    service.dispose();
  });

  test("cancels template editor through service owner state", () => {
    const { service } = createTemplateServiceForTest();
    const fallbackTemplate = {
      ...createEmptyTemplateConfig({
        name: "Output",
        stopOnError: true,
      }),
      id: "template-b",
    };

    service.editTemplate(fallbackTemplate);
    service.setFormState(createEmptyTemplateConfig({
      name: "Draft",
      stopOnError: false,
    }));
    service.cancelTemplateEditor({
      fallbackTemplate,
    });

    assert.deepEqual(service.getState(), {
      mode: "management",
      selectedTemplateId: "template-b",
      formState: createEmptyTemplateConfig({
        name: "Output",
        stopOnError: true,
      }),
      selectionsByFileId: {},
      templateListVersion: 0,
    });

    service.createTemplateDraft({ stopOnError: true });
    service.cancelTemplateEditor({ stopOnError: true });

    assert.deepEqual(service.getState(), {
      mode: "management",
      selectedTemplateId: null,
      formState: createEmptyTemplateConfig({
        stopOnError: true,
      }),
      selectionsByFileId: {},
      templateListVersion: 0,
    });
    service.dispose();
  });

  test("removes deleted file template selections on session changes", () => {
    const { service, sessionEvents } = createTemplateServiceForTest();
    service.setSelectionsByFileId({
      "file-a": createTemplateSelection("template-a"),
      "file-b": createTemplateSelection("template-b"),
    });

    sessionEvents.fire({
      fileIds: ["file-a"],
      reason: "filesRemoved",
      sessionVersion: 1,
    });

    assert.deepEqual(service.getState().selectionsByFileId, {
      "file-b": createTemplateSelection("template-b"),
    });

    sessionEvents.fire({
      fileIds: ["file-b"],
      reason: "sessionCleared",
      sessionVersion: 2,
    });

    assert.deepEqual(service.getState().selectionsByFileId, {});
    service.dispose();
    sessionEvents.dispose();
  });

  test("sets file template selections through service owner API", () => {
    const { service } = createTemplateServiceForTest();

    service.setFileTemplateSelection(" file-a ", createTemplateSelection(" template-a "));
    service.setFileTemplateSelection("file-b", { kind: "auto" });
    service.setFileTemplateSelection(" ", createTemplateSelection("template-ignored"));

    assert.deepEqual(service.getState().selectionsByFileId, {
      "file-a": createTemplateSelection("template-a"),
      "file-b": { kind: "auto" },
    });
    service.dispose();
  });

  test("owns template list snapshots and publishes list changes", async () => {
    const savedTemplate = {
      ...createEmptyTemplateConfig({
        name: "Transfer",
      }),
      id: "template-a",
    };
    const templateStoreService = createTemplateStoreServiceForTest({
      templates: [savedTemplate, { id: AUTO_TEMPLATE_ID, name: "Auto" }],
    });
    const { service } = createTemplateServiceForTest(templateStoreService);
    const listEvents: Array<readonly unknown[]> = [];
    const disposable = service.onDidChangeTemplateList(templates => {
      listEvents.push(templates);
    });

    assert.equal(service.hasLoadedTemplateList(), false);
    assert.deepEqual(service.getTemplateList(), []);

    assert.deepEqual(await service.refreshTemplates(), [savedTemplate]);

    assert.equal(service.hasLoadedTemplateList(), true);
    assert.deepEqual(service.getTemplateList(), [savedTemplate]);
    assert.equal(service.getState().templateListVersion, 1);
    assert.equal(listEvents.length, 1);

    assert.deepEqual(await service.refreshTemplates(), [savedTemplate]);

    assert.equal(service.getState().templateListVersion, 1);
    assert.equal(listEvents.length, 1);

    disposable.dispose();
    service.dispose();
  });

  test("clears file template selections when deleting a template", async () => {
    const savedTemplate = {
      ...createEmptyTemplateConfig({
        name: "Transfer",
      }),
      id: "template-a",
    };
    const templateStoreService = createTemplateStoreServiceForTest({
      templates: [savedTemplate],
    });
    const { service } = createTemplateServiceForTest(templateStoreService);

    await service.getTemplates();
    service.setSelectionsByFileId({
      "file-a": createTemplateSelection("template-a"),
      "file-b": createTemplateSelection("template-b"),
      "file-c": { kind: "auto" },
    });

    await service.deleteTemplate("template-a");

    assert.deepEqual(service.getState().selectionsByFileId, {
      "file-b": createTemplateSelection("template-b"),
      "file-c": { kind: "auto" },
    });
    assert.deepEqual(templateStoreService.deletedTemplateIds, ["template-a"]);
    service.dispose();
  });

  test("delegates template persistence to store service", async () => {
    const template = createEmptyTemplateConfig({
      name: "Transfer",
    });
    const savedTemplate = {
      ...template,
      id: "template-a",
    };
    const templateStoreService = createTemplateStoreServiceForTest({
      templates: [savedTemplate, { id: AUTO_TEMPLATE_ID, name: "Auto" }],
      savedTemplate,
    });
    const { service } = createTemplateServiceForTest(templateStoreService);

    assert.deepEqual(await service.getTemplates(), [savedTemplate]);
    assert.deepEqual(service.getCachedTemplates(), [savedTemplate]);
    assert.equal(await service.saveTemplate(template), savedTemplate);
    assert.equal(service.getState().templateListVersion, 1);

    await service.deleteTemplate("template-a");

    assert.deepEqual(templateStoreService.deletedTemplateIds, ["template-a"]);
    assert.deepEqual(service.getCachedTemplates(), []);
    assert.equal(service.getState().templateListVersion, 2);
    service.dispose();
  });
});

const createTemplateServiceForTest = (
  templateStoreService = createTemplateStoreServiceForTest(),
) => {
  const sessionEvents = new Emitter<SessionChangeEvent>();
  const sessionService = {
    onDidChangeSession: sessionEvents.event,
  } as ISessionService;

  return {
    service: new BrowserTemplateService(sessionService, templateStoreService),
    sessionEvents,
  };
};

const createTemplateStoreServiceForTest = (options: {
  readonly templates?: readonly unknown[];
  readonly savedTemplate?: unknown;
} = {}) => {
  const deletedTemplateIds: string[] = [];
  return {
    _serviceBrand: undefined,
    deletedTemplateIds,
    getTemplates: async () => options.templates ?? [],
    saveTemplate: async () => options.savedTemplate ?? null,
    deleteTemplate: async (id: string) => {
      deletedTemplateIds.push(id);
    },
  } as ITemplateStoreService & { readonly deletedTemplateIds: string[] };
};
