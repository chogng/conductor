/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { BrowserTemplateService } from "src/cs/workbench/services/template/browser/templateService";
import type { ITemplateStoreService } from "src/cs/workbench/services/template/common/templateStore";
import { createEmptyTemplateApplyConfig } from "src/cs/workbench/services/template/common/templateApplyConfigUtils";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/template/browser/templateService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const legacyAutoTemplateId = "0";

  test("owns template list snapshots and publishes list changes", async () => {
    const savedTemplate = {
      ...createEmptyTemplateApplyConfig({
        name: "Transfer",
        xColumns: [0],
        xDataEnd: "A3",
        xDataStart: "A2",
        yColumns: [1],
      }),
      id: "template-a",
    };
    const templateStoreService = createTemplateStoreServiceForTest({
      templates: [savedTemplate, { id: legacyAutoTemplateId, name: "Auto" }],
    });
    const { service } = createTemplateServiceForTest(templateStoreService);
    const listEvents: Array<readonly unknown[]> = [];
    const disposable = service.onDidChangeTemplates(templates => {
      listEvents.push(templates);
    });

    assert.equal(service.hasLoadedTemplateList(), false);
    assert.deepEqual(service.getTemplateList(), []);

    assert.deepEqual(await service.refreshTemplates(), [savedTemplate]);

    assert.equal(service.hasLoadedTemplateList(), true);
    assert.deepEqual(service.getTemplateList(), [savedTemplate]);
    assert.equal(service.getSnapshot().version, 1);
    assert.equal(service.getTemplate("template-a")?.id, "template-a");
    assert.equal(listEvents.length, 1);

    assert.deepEqual(await service.refreshTemplates(), [savedTemplate]);

    assert.equal(service.getSnapshot().version, 1);
    assert.equal(listEvents.length, 1);

    disposable.dispose();
    service.dispose();
  });

  test("delegates template persistence to store service", async () => {
    const template = createEmptyTemplateApplyConfig({
      name: "Transfer",
    });
    const savedTemplate = {
      ...template,
      id: "template-a",
    };
    const templateStoreService = createTemplateStoreServiceForTest({
      templates: [savedTemplate, { id: legacyAutoTemplateId, name: "Auto" }],
      savedTemplate,
    });
    const { service } = createTemplateServiceForTest(templateStoreService);

    assert.deepEqual(await service.refreshTemplates(), [savedTemplate]);
    assert.deepEqual(service.getTemplateList(), [savedTemplate]);
    assert.equal(await service.saveTemplate(template), savedTemplate);
    assert.equal(service.getSnapshot().version, 1);

    await service.deleteTemplate("template-a");

    assert.deepEqual(templateStoreService.deletedTemplateIds, ["template-a"]);
    assert.deepEqual(service.getTemplateList(), []);
    assert.equal(service.getSnapshot().version, 2);
    service.dispose();
  });
});

const createTemplateServiceForTest = (
  templateStoreService = createTemplateStoreServiceForTest(),
) => {
  return {
    service: new BrowserTemplateService(templateStoreService),
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
