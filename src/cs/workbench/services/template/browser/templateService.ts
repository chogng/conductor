/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  ITemplateService as ITemplateServiceId,
  type ITemplateService,
  type TemplateApplyPresetRecord,
  type TemplateApplyPresetSaveInput,
  type TemplateSnapshot,
} from "src/cs/workbench/services/template/common/template";
import { isAutoTemplateId } from "src/cs/workbench/services/template/common/autoTemplate";
import { filterUserTemplateApplyPresetRecords } from "src/cs/workbench/services/template/common/templateRecords";
import { createTemplateSnapshotFromApplyPresets } from "src/cs/workbench/services/template/common/templateLegacyAdapter";
import {
  ITemplateStoreService,
} from "src/cs/workbench/services/template/common/templateStore";

export class BrowserTemplateService extends Disposable implements ITemplateService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeTemplatesEmitter =
    this._register(new Emitter<readonly TemplateApplyPresetRecord[]>());
  public readonly onDidChangeTemplates =
    this.onDidChangeTemplatesEmitter.event;

  private cachedTemplates: readonly TemplateApplyPresetRecord[] = [];
  private hasLoadedTemplates = false;
  private templateListVersion = 0;
  private templateListRefresh: Promise<readonly TemplateApplyPresetRecord[]> | null = null;
  private templateListRefreshRunId = 0;

  public constructor(
    @ITemplateStoreService private readonly templateStoreService: ITemplateStoreService,
  ) {
    super();
  }

  getSnapshot(): TemplateSnapshot {
    return createTemplateSnapshotFromApplyPresets(
      this.cachedTemplates,
      this.templateListVersion,
    );
  }

  getTemplate(id: string): TemplateSnapshot["templates"][number] | undefined {
    const templateId = String(id ?? "").trim();
    if (!templateId) {
      return undefined;
    }

    return this.getSnapshot().templates.find(template => String(template.id ?? "").trim() === templateId);
  }

  getTemplateList(): readonly TemplateApplyPresetRecord[] {
    return this.cachedTemplates;
  }

  hasLoadedTemplateList(): boolean {
    return this.hasLoadedTemplates;
  }

  async refreshTemplates(): Promise<readonly TemplateApplyPresetRecord[]> {
    if (this.templateListRefresh) {
      return this.templateListRefresh;
    }

    const refresh = this.loadTemplatesFromStore();
    this.templateListRefresh = refresh;
    try {
      return await refresh;
    } finally {
      if (this.templateListRefresh === refresh) {
        this.templateListRefresh = null;
      }
    }
  }

  private async loadTemplatesFromStore(): Promise<readonly TemplateApplyPresetRecord[]> {
    const runId = this.templateListRefreshRunId + 1;
    this.templateListRefreshRunId = runId;
    const remote = await this.templateStoreService.getTemplates();
    const templates = filterUserTemplateApplyPresetRecords(remote) as TemplateApplyPresetRecord[];
    if (this.templateListRefreshRunId === runId) {
      this.setCachedTemplates(templates);
      this.hasLoadedTemplates = true;
      return this.cachedTemplates;
    }

    return templates;
  }

  async deleteTemplate(id: string): Promise<void> {
    await this.templateStoreService.deleteTemplate(id);
    this.invalidateTemplateListRefresh();
    this.setCachedTemplates(this.cachedTemplates.filter(template => getTemplateId(template) !== id));
  }

  async saveTemplate(template: TemplateApplyPresetSaveInput): Promise<TemplateApplyPresetRecord> {
    const saved = await this.templateStoreService.saveTemplate(template);
    const savedTemplate = isTemplateApplyPresetRecord(saved) ? saved : template;
    this.invalidateTemplateListRefresh();
    this.setCachedTemplates(upsertCachedTemplate(this.cachedTemplates, savedTemplate));
    return savedTemplate;
  }

  private setCachedTemplates(templates: readonly TemplateApplyPresetRecord[]): void {
    const normalizedTemplates = filterUserTemplateApplyPresetRecords(templates) as TemplateApplyPresetRecord[];
    this.hasLoadedTemplates = true;
    if (areTemplateListsEqual(this.cachedTemplates, normalizedTemplates)) {
      return;
    }

    this.cachedTemplates = normalizedTemplates;
    this.templateListVersion += 1;
    this.onDidChangeTemplatesEmitter.fire(this.cachedTemplates);
  }

  private invalidateTemplateListRefresh(): void {
    this.templateListRefreshRunId += 1;
    this.templateListRefresh = null;
  }
}

const isTemplateApplyPresetRecord = (value: unknown): value is TemplateApplyPresetRecord =>
  Boolean(value) && typeof value === "object";

const getTemplateId = (template: TemplateApplyPresetRecord): string | null => {
  const templateId = String(template.id ?? "").trim();
  return templateId && !isAutoTemplateId(templateId) ? templateId : null;
};

const upsertCachedTemplate = (
  templates: readonly TemplateApplyPresetRecord[],
  template: TemplateApplyPresetRecord,
): readonly TemplateApplyPresetRecord[] => {
  const templateId = getTemplateId(template);
  if (!templateId) {
    return templates;
  }

  const index = templates.findIndex(entry => getTemplateId(entry) === templateId);
  if (index === -1) {
    return [...templates, template];
  }

  const next = [...templates];
  next[index] = template;
  return next;
};

const areTemplateListsEqual = (
  current: readonly TemplateApplyPresetRecord[],
  next: readonly TemplateApplyPresetRecord[],
): boolean =>
  current.length === next.length &&
  current.every((template, index) =>
    getTemplateApplyPresetSignature(template) === getTemplateApplyPresetSignature(next[index]));

const getTemplateApplyPresetSignature = (template: TemplateApplyPresetRecord | undefined): string =>
  JSON.stringify(template ?? null);

registerSingleton(ITemplateServiceId, BrowserTemplateService, InstantiationType.Delayed);
