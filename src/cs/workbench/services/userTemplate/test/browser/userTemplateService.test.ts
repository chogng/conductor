/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
  StorageScope,
  StorageTarget,
  type StorageValue,
} from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import type { Template } from "src/cs/workbench/services/template/common/template";
import { UserDataProfileResourceService } from "src/cs/workbench/services/userDataProfile/browser/userDataProfileResourceService";
import { UserDataProfileResourceId } from "src/cs/workbench/services/userDataProfile/common/userDataProfile";
import { UserTemplateImportExportService } from "src/cs/workbench/services/userTemplate/browser/userTemplateImportExportService";
import { UserTemplateService } from "src/cs/workbench/services/userTemplate/browser/userTemplateService";
import {
  USER_TEMPLATE_WORKSPACE_STORAGE_KEY,
  UserTemplateStoreService,
} from "src/cs/workbench/services/userTemplate/browser/userTemplateStoreService";

suite("workbench/services/userTemplate/test/browser/userTemplateService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("persists native templates by scope and exposes CRUD operations", async () => {
    const { service, storageService, userDataProfileResourceService } = createUserTemplateServiceForTest(store);
    const events: number[] = [];
    store.add(service.onDidChangeUserTemplates(event => {
      events.push(event.version);
    }));

    const created = await service.createTemplate({
      id: "template-a",
      name: "Transfer",
      scope: "profile",
      template: createTemplate({ name: "Transfer" }),
      tags: ["iv", "transfer", "iv"],
    });
    const updated = await service.updateTemplate(created.id, {
      name: "Transfer Native",
      scope: "workspace",
      description: "Confirmed from review",
    });
    const duplicated = await service.duplicateTemplate(updated.id);

    assert.equal(created.id, "template-a");
    assert.equal(updated.version, 2);
    assert.equal(updated.scope, "workspace");
    assert.equal(updated.template.id, "template-a");
    assert.equal(updated.template.name, "Transfer Native");
    assert.deepEqual(updated.tags, ["iv", "transfer"]);
    assert.equal(duplicated.id, "transfer-native-copy");
    assert.equal(service.getSnapshot().templates.length, 2);
    assert.equal(events.length, 3);
    assert.deepEqual(
      userDataProfileResourceService.readResource(UserDataProfileResourceId.UserTemplates),
      {
        version: 2,
        templates: [],
      },
    );
    assert.deepEqual(
      storageService.getObject(USER_TEMPLATE_WORKSPACE_STORAGE_KEY, StorageScope.WORKSPACE),
      {
        version: 2,
        templates: [updated, duplicated],
      },
    );

    const exported = service.exportTemplates();
    assert.equal(exported.source, "conductor.userTemplate");
    assert.deepEqual(exported.templates.map(template => template.id), [
      "template-a",
      "transfer-native-copy",
    ]);

    await service.deleteTemplate(updated.id);

    assert.equal(service.getTemplate(updated.id), undefined);
    assert.deepEqual(service.getSnapshot().templates.map(template => template.id), [
      "transfer-native-copy",
    ]);
  });

  test("imports templates and skips duplicate ids unless overwrite is requested", async () => {
    const { service } = createUserTemplateServiceForTest(store);

    const first = await service.importTemplates({
      templates: [createTemplate({ id: "template-a", name: "Transfer" })],
    });
    const skipped = await service.importTemplates({
      templates: [createTemplate({ id: "template-a", name: "Transfer Again" })],
    });
    const overwritten = await service.importTemplates({
      overwrite: true,
      templates: [createTemplate({ id: "template-a", name: "Transfer Overwritten" })],
    });

    assert.equal(first.imported.length, 1);
    assert.equal(skipped.imported.length, 0);
    assert.equal(skipped.skipped[0]?.reason, "duplicateId");
    assert.equal(overwritten.imported[0]?.id, "template-a");
    assert.equal(service.getTemplate("template-a")?.name, "Transfer Overwritten");
  });

  test("import/export service owns native payload validation", async () => {
    const { importExportService } = createUserTemplateServiceForTest(store);

    const invalid = await importExportService.importTemplatesFromPayload({
      source: "conductor",
      version: 1,
      templates: [createTemplate({ id: "legacy-template" })],
    });
    const imported = await importExportService.importTemplatesFromPayload({
      source: "conductor.userTemplate",
      version: 1,
      templates: [createTemplate({ id: "template-a", name: "Transfer" })],
    });
    const exported = importExportService.exportTemplates(["template-a"]);

    assert.deepEqual({
      invalid,
      importedCount: imported?.imported.length,
      exportedSource: exported.source,
      exportedTemplateIds: exported.templates.map(template => template.id),
    }, {
      invalid: null,
      importedCount: 1,
      exportedSource: "conductor.userTemplate",
      exportedTemplateIds: ["template-a"],
    });
  });

  test("profile resource export/import replaces profile user templates", async () => {
    const first = createUserTemplateServiceForTest(store);
    await first.service.createTemplate({
      id: "template-a",
      name: "Transfer",
      scope: "profile",
      template: createTemplate({ id: "template-a", name: "Transfer" }),
    });
    await first.service.createTemplate({
      id: "workspace-template",
      name: "Workspace Template",
      scope: "workspace",
      template: createTemplate({ id: "workspace-template", name: "Workspace Template" }),
    });

    const payload = await first.userDataProfileResourceService.exportProfile();
    const resource = payload.resources.find(candidate => candidate.id === UserDataProfileResourceId.UserTemplates);
    assert.ok(resource);
    assert.equal(resource.content.includes("workspace-template"), false);

    const second = createUserTemplateServiceForTest(store);
    await second.service.createTemplate({
      id: "stale-profile-template",
      name: "Stale Profile Template",
      scope: "profile",
      template: createTemplate({ id: "stale-profile-template", name: "Stale Profile Template" }),
    });
    await second.service.createTemplate({
      id: "workspace-template",
      name: "Workspace Template",
      scope: "workspace",
      template: createTemplate({ id: "workspace-template", name: "Workspace Template" }),
    });

    const imported = await second.userDataProfileResourceService.importProfileFromPayload(payload);

    assert.deepEqual({
      imported: imported?.imported,
      skipped: imported?.skipped,
      templateIds: second.service.getSnapshot().templates.map(template => template.id),
    }, {
      imported: [UserDataProfileResourceId.UserTemplates],
      skipped: [],
      templateIds: ["template-a", "workspace-template"],
    });
  });

});

type TestDisposableStore = ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>;

const createUserTemplateServiceForTest = (
  store: TestDisposableStore,
) => {
  const storageService = store.add(new TestStorageService());
  const userDataProfileResourceService = store.add(new UserDataProfileResourceService(storageService));
  const storeService = store.add(new UserTemplateStoreService(userDataProfileResourceService, storageService));
  const service = store.add(new UserTemplateService(storeService));
  const importExportService = store.add(new UserTemplateImportExportService(
    service,
    userDataProfileResourceService,
  ));
  return {
    importExportService,
    service,
    storageService,
    storeService,
    userDataProfileResourceService,
  };
};

class TestStorageService extends AbstractStorageService {
  private readonly values = new Map<string, string>();

  protected readValue(key: string, scope: StorageScope): string | undefined {
    return this.values.get(this.storageKey(key, scope));
  }

  protected writeValue(key: string, scope: StorageScope, value: string): void {
    this.values.set(this.storageKey(key, scope), value);
  }

  protected deleteValue(key: string, scope: StorageScope): void {
    this.values.delete(this.storageKey(key, scope));
  }

  protected readKeys(scope: StorageScope): string[] {
    const prefix = this.storageKey("", scope);
    return [...this.values.keys()]
      .filter(key => key.startsWith(prefix))
      .map(key => key.slice(prefix.length));
  }

  public override store(key: string, value: StorageValue, scope: StorageScope, target: StorageTarget): void {
    super.store(key, value, scope, target);
  }

  private storageKey(key: string, scope: StorageScope): string {
    return `${scope}:${key}`;
  }
}

const createTemplate = (
  overrides: Partial<Template> = {},
): Template => ({
  schemaVersion: 1,
  id: "template-test",
  name: "Template",
  version: 1,
  blocks: [],
  stopOnError: false,
  ...overrides,
});
