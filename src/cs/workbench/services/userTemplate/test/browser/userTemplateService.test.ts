/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type {
  ITemplateService,
  Template,
  TemplateApplyPresetRecord,
  TemplateApplyPresetSaveInput,
  TemplateSnapshot,
} from "src/cs/workbench/services/template/common/template";
import { UserTemplateService } from "src/cs/workbench/services/userTemplate/browser/userTemplateService";

suite("workbench/services/userTemplate/test/browser/userTemplateService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("projects legacy template snapshots into user template snapshots", () => {
    const templateService = store.add(new TestTemplateService([createTemplate({
      id: "template-a",
      name: "Transfer",
      version: 3,
    })]));
    const service = store.add(new UserTemplateService(templateService));

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
    const templateService = store.add(new TestTemplateService());
    const service = store.add(new UserTemplateService(templateService));
    const events: string[] = [];
    const disposable = service.onDidChangeUserTemplates(event => {
      events.push(event.effectiveFingerprint);
    });

    templateService.setTemplates([createTemplate({ id: "template-a" })]);

    assert.equal(events.length, 1);
    assert.equal(service.getTemplate("template-a")?.id, "template-a");
    disposable.dispose();
  });
});

class TestTemplateService extends Disposable implements ITemplateService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeTemplatesEmitter =
    this._register(new Emitter<readonly TemplateApplyPresetRecord[]>());
  public readonly onDidChangeTemplates =
    this.onDidChangeTemplatesEmitter.event;
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
    return Promise.resolve();
  }

  public saveTemplate(_template: TemplateApplyPresetSaveInput): Promise<TemplateApplyPresetRecord> {
    throw new Error("Unexpected template save in user template test.");
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
