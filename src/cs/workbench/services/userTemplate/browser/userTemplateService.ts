/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  createNativeUserTemplate,
  createUpdatedUserTemplate,
  createUserTemplateSnapshot,
  toUserTemplateCreateInput,
} from "src/cs/workbench/services/userTemplate/common/userTemplateCatalog";
import {
  IUserTemplateService,
  IUserTemplateStoreService,
  type UserTemplate,
  type UserTemplateChangeEvent,
  type UserTemplateCreateInput,
  type UserTemplateExportPayload,
  type UserTemplateImportInput,
  type UserTemplateImportResult,
  type UserTemplateImportSkipped,
  type UserTemplateSnapshot,
  type UserTemplateUpdate,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

export class UserTemplateService extends Disposable implements IUserTemplateService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeUserTemplatesEmitter =
    this._register(new Emitter<UserTemplateChangeEvent>());
  public readonly onDidChangeUserTemplates =
    this.onDidChangeUserTemplatesEmitter.event;

  public constructor(
    @IUserTemplateStoreService
    private readonly userTemplateStoreService: IUserTemplateStoreService,
  ) {
    super();
    this._register(this.userTemplateStoreService.onDidChangeUserTemplates(() => {
      this.fireChange();
    }));
  }

  public getSnapshot(): UserTemplateSnapshot {
    return createUserTemplateSnapshot(this.userTemplateStoreService.getSnapshot());
  }

  public getTemplate(id: string): UserTemplate | undefined {
    const templateId = normalizeText(id);
    return templateId
      ? this.getSnapshot().templates.find(template => template.id === templateId)
      : undefined;
  }

  public async refreshTemplates(): Promise<readonly UserTemplate[]> {
    return this.getSnapshot().templates;
  }

  public async createTemplate(input: UserTemplateCreateInput): Promise<UserTemplate> {
    const template = createNativeUserTemplate(input, {
      existingIds: new Set(this.getSnapshot().templates.map(userTemplate => userTemplate.id)),
    });
    const saved = this.userTemplateStoreService.upsertTemplate(template);
    return saved;
  }

  public async updateTemplate(id: string, update: UserTemplateUpdate): Promise<UserTemplate> {
    const templateId = normalizeText(id);
    const existing = this.getTemplate(templateId);
    if (!existing) {
      throw new Error(`UserTemplate "${templateId}" was not found.`);
    }

    return this.userTemplateStoreService.upsertTemplate(createUpdatedUserTemplate(existing, update));
  }

  public async deleteTemplate(id: string): Promise<void> {
    const templateId = normalizeText(id);
    if (!templateId) {
      return;
    }

    const nativeTemplate = this.userTemplateStoreService.getSnapshot().templates
      .find(template => template.id === templateId);
    if (nativeTemplate) {
      this.userTemplateStoreService.removeTemplate(templateId);
    }
  }

  public async duplicateTemplate(
    id: string,
    overrides: Partial<UserTemplateCreateInput> = {},
  ): Promise<UserTemplate> {
    const existing = this.getTemplate(id);
    if (!existing) {
      throw new Error(`UserTemplate "${normalizeText(id)}" was not found.`);
    }

    const { id: _templateId, ...templateWithoutId } = existing.template;

    return this.createTemplate({
      scope: overrides.scope ?? existing.scope,
      source: overrides.source ?? "userCreated",
      template: overrides.template ?? {
        ...templateWithoutId,
        name: normalizeText(overrides.name) || `${existing.name} Copy`,
        version: 1,
      },
      tags: overrides.tags ?? existing.tags,
      description: overrides.description ?? existing.description,
      ...(overrides.id ? { id: overrides.id } : {}),
      name: normalizeText(overrides.name) || `${existing.name} Copy`,
    });
  }

  public async importTemplates(input: UserTemplateImportInput): Promise<UserTemplateImportResult> {
    const imported: UserTemplate[] = [];
    const skipped: UserTemplateImportSkipped[] = [];
    const existingIds = new Set(this.getSnapshot().templates.map(template => template.id));

    for (const value of input.templates) {
      const createInput = toUserTemplateCreateInput(value, input);
      if (!createInput) {
        skipped.push({ reason: "invalidTemplate" });
        continue;
      }

      const requestedId = normalizeText(createInput.id) || normalizeText(createInput.template.id);
      if (requestedId && existingIds.has(requestedId) && !input.overwrite) {
        skipped.push({
          id: requestedId,
          name: normalizeText(createInput.name) || normalizeText(createInput.template.name),
          reason: "duplicateId",
        });
        continue;
      }

      const userTemplate = createNativeUserTemplate(createInput, {
        allowExistingId: Boolean(input.overwrite),
        existingIds,
      });
      const saved = this.userTemplateStoreService.upsertTemplate(userTemplate);
      imported.push(saved);
      existingIds.add(saved.id);
    }

    return {
      imported,
      skipped,
    };
  }

  public exportTemplates(ids?: readonly string[]): UserTemplateExportPayload {
    const idSet = ids?.length
      ? new Set(ids.map(normalizeText).filter(Boolean))
      : null;
    const templates = this.userTemplateStoreService.getSnapshot().templates
      .filter(template => !idSet || idSet.has(template.id));
    return {
      version: 1,
      source: "conductor.userTemplate",
      templates,
    };
  }

  private fireChange(): void {
    const snapshot = this.getSnapshot();
    this.onDidChangeUserTemplatesEmitter.fire({
      version: snapshot.version,
      effectiveFingerprint: snapshot.effectiveFingerprint,
    });
  }
}

const normalizeText = (
  value: unknown,
): string => String(value ?? "").trim();

registerSingleton(
  IUserTemplateService,
  UserTemplateService,
  InstantiationType.Delayed,
);
