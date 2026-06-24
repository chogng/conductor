/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
  StorageScope,
  StorageTarget,
  type StorageValue,
} from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import type {
  ITemplateService,
  Template,
  TemplateApplyPresetRecord,
  TemplateApplyPresetSaveInput,
  TemplateSnapshot,
} from "src/cs/workbench/services/template/common/template";
import { UserTemplateService } from "src/cs/workbench/services/userTemplate/browser/userTemplateService";
import {
  USER_TEMPLATE_GLOBAL_STORAGE_KEY,
  USER_TEMPLATE_WORKSPACE_STORAGE_KEY,
  UserTemplateStoreService,
} from "src/cs/workbench/services/userTemplate/browser/userTemplateStoreService";

suite("workbench/services/userTemplate/test/browser/userTemplateService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("projects legacy template snapshots into user template snapshots", () => {
    const { service } = createUserTemplateServiceForTest(store, {
      legacyTemplates: [createTemplate({
        id: "template-a",
        name: "Transfer",
        version: 3,
      })],
    });

    const snapshot = service.getSnapshot();

    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.globalVersion, 1);
    assert.equal(snapshot.templates.length, 1);
    assert.equal(snapshot.templates[0]?.id, "template-a");
    assert.equal(snapshot.templates[0]?.source, "legacyPreset");
    assert.equal(snapshot.templates[0]?.template.name, "Transfer");
    assert.ok(snapshot.effectiveFingerprint.includes("template-a"));
  });

  test("fires user template changes when the legacy catalog changes", () => {
    const { service, templateService } = createUserTemplateServiceForTest(store);
    const events: string[] = [];
    const disposable = service.onDidChangeUserTemplates(event => {
      events.push(event.effectiveFingerprint);
    });

    templateService.setTemplates([createTemplate({ id: "template-a" })]);

    assert.equal(events.length, 1);
    assert.equal(service.getTemplate("template-a")?.id, "template-a");
    disposable.dispose();
  });

  test("persists native templates by scope and exposes CRUD operations", async () => {
    const { service, storageService } = createUserTemplateServiceForTest(store);
    const events: number[] = [];
    store.add(service.onDidChangeUserTemplates(event => {
      events.push(event.version);
    }));

    const created = await service.createTemplate({
      id: "template-a",
      name: "Transfer",
      scope: "global",
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
      storageService.getObject(USER_TEMPLATE_GLOBAL_STORAGE_KEY, StorageScope.PROFILE),
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

  test("native templates shadow legacy projections with the same id", async () => {
    const { service } = createUserTemplateServiceForTest(store, {
      legacyTemplates: [createTemplate({
        id: "template-a",
        name: "Legacy Transfer",
      })],
    });

    const updated = await service.updateTemplate("template-a", {
      name: "Native Transfer",
    });

    const snapshot = service.getSnapshot();
    assert.equal(updated.id, "template-a");
    assert.equal(snapshot.templates.length, 1);
    assert.equal(snapshot.templates[0]?.source, "imported");
    assert.equal(snapshot.templates[0]?.name, "Native Transfer");
  });

  test("deletes legacy projections through the migration bridge", async () => {
    const { service, templateService } = createUserTemplateServiceForTest(store, {
      legacyTemplates: [createTemplate({
        id: "template-a",
        name: "Legacy Transfer",
      })],
    });

    await service.deleteTemplate("template-a");

    assert.deepEqual(templateService.deletedTemplateIds, ["template-a"]);
  });
});

type TestDisposableStore = ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>;

const createUserTemplateServiceForTest = (
  store: TestDisposableStore,
  {
    legacyTemplates = [],
  }: {
    readonly legacyTemplates?: readonly Template[];
  } = {},
) => {
  const storageService = store.add(new TestStorageService());
  const storeService = store.add(new UserTemplateStoreService(storageService));
  const templateService = store.add(new TestTemplateService(legacyTemplates));
  const service = store.add(new UserTemplateService(storeService, templateService));
  return {
    service,
    storageService,
    storeService,
    templateService,
  };
};

class TestTemplateService extends Disposable implements ITemplateService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeTemplatesEmitter =
    this._register(new Emitter<readonly TemplateApplyPresetRecord[]>());
  public readonly onDidChangeTemplates =
    this.onDidChangeTemplatesEmitter.event;
  public readonly deletedTemplateIds: string[] = [];
  private version = 1;

  public constructor(
    private templates: readonly Template[] = [],
  ) {
    super();
  }

  public setTemplates(templates: readonly Template[]): void {
    this.templates = templates;
    this.version += 1;
    this.onDidChangeTemplatesEmitter.fire([]);
  }

  public getSnapshot(): TemplateSnapshot {
    return {
      version: this.version,
      templates: this.templates,
    };
  }

  public getTemplate(id: string): Template | undefined {
    return this.templates.find(template => String(template.id ?? "").trim() === id);
  }

  public getTemplateList(): readonly TemplateApplyPresetRecord[] {
    return [];
  }

  public hasLoadedTemplateList(): boolean {
    return true;
  }

  public refreshTemplates(): Promise<readonly TemplateApplyPresetRecord[]> {
    return Promise.resolve([]);
  }

  public deleteTemplate(_id: string): Promise<void> {
    this.deletedTemplateIds.push(_id);
    return Promise.resolve();
  }

  public saveTemplate(_template: TemplateApplyPresetSaveInput): Promise<TemplateApplyPresetRecord> {
    throw new Error("Unexpected template save in user template test.");
  }
}

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
