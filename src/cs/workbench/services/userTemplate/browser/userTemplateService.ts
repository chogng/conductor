/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  ITemplateService,
  type ITemplateService as ITemplateServiceType,
  type Template,
  type TemplateSnapshot,
} from "src/cs/workbench/services/template/common/template";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import {
  IUserTemplateService,
  IUserTemplateStoreService,
  type IUserTemplateService as IUserTemplateServiceType,
  type IUserTemplateStoreService as IUserTemplateStoreServiceType,
  type NativeUserTemplateSource,
  type UserTemplate,
  type UserTemplateChangeEvent,
  type UserTemplateCreateInput,
  type UserTemplateExportPayload,
  type UserTemplateImportInput,
  type UserTemplateImportResult,
  type UserTemplateImportSkipped,
  type UserTemplateScope,
  type UserTemplateSnapshot,
  type UserTemplateStoreSnapshot,
  type UserTemplateUpdate,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

type CreateNativeUserTemplateOptions = {
  readonly allowExistingId?: boolean;
  readonly existingIds?: ReadonlySet<string>;
  readonly now?: number;
};

export class UserTemplateService extends Disposable implements IUserTemplateServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeUserTemplatesEmitter =
    this._register(new Emitter<UserTemplateChangeEvent>());
  public readonly onDidChangeUserTemplates =
    this.onDidChangeUserTemplatesEmitter.event;

  public constructor(
    @IUserTemplateStoreService
    private readonly userTemplateStoreService: IUserTemplateStoreServiceType,
    @ITemplateService private readonly templateService: ITemplateServiceType,
  ) {
    super();
    this._register(this.userTemplateStoreService.onDidChangeUserTemplates(() => {
      this.fireChange();
    }));
    this._register(this.templateService.onDidChangeTemplates(() => {
      this.fireChange();
    }));
  }

  public getSnapshot(): UserTemplateSnapshot {
    return createUserTemplateSnapshot({
      legacySnapshot: this.templateService.getSnapshot(),
      nativeSnapshot: this.userTemplateStoreService.getSnapshot(),
    });
  }

  public getTemplate(id: string): UserTemplate | undefined {
    const templateId = normalizeText(id);
    return templateId
      ? this.getSnapshot().templates.find(template => template.id === templateId)
      : undefined;
  }

  public async refreshTemplates(): Promise<readonly UserTemplate[]> {
    await this.templateService.refreshTemplates();
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

    const nextVersion = existing.version + 1;
    const name = normalizeText(update.name) || existing.name;
    const nextTemplate = normalizeTemplateForCatalog({
      id: existing.id,
      name,
      template: update.template ?? existing.template,
      version: nextVersion,
    });
    const updated: UserTemplate = {
      ...existing,
      name,
      version: nextVersion,
      scope: update.scope ?? existing.scope,
      source: update.source ?? getNativeSource(existing.source),
      template: nextTemplate,
      templateFingerprint: createTemplateFingerprint(nextTemplate),
      ...(update.tags === null
        ? { tags: undefined }
        : { tags: update.tags ?? existing.tags }),
      ...(update.description === null
        ? { description: undefined }
        : { description: normalizeOptionalText(update.description) ?? existing.description }),
      updatedAt: Date.now(),
    };

    return this.userTemplateStoreService.upsertTemplate(compactUserTemplate(updated));
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
      return;
    }

    const userTemplate = this.getTemplate(templateId);
    if (userTemplate?.source === "legacyPreset") {
      await this.templateService.deleteTemplate(templateId);
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

export const createUserTemplateSnapshotFromLegacyTemplates = (
  templateSnapshot: TemplateSnapshot,
): UserTemplateSnapshot => createUserTemplateSnapshot({
  legacySnapshot: templateSnapshot,
  nativeSnapshot: {
    version: 0,
    workspaceVersion: 0,
    globalVersion: 0,
    templates: [],
  },
});

export const createUserTemplateSnapshot = ({
  legacySnapshot,
  nativeSnapshot,
}: {
  readonly legacySnapshot: TemplateSnapshot;
  readonly nativeSnapshot: UserTemplateStoreSnapshot;
}): UserTemplateSnapshot => {
  const nativeTemplates = nativeSnapshot.templates.map(compactUserTemplate);
  const nativeIds = new Set(nativeTemplates.map(template => template.id));
  const legacyTemplates = createLegacyUserTemplates(legacySnapshot)
    .filter(template => !nativeIds.has(template.id));
  const templates = [
    ...nativeTemplates,
    ...legacyTemplates,
  ].sort(compareUserTemplates);
  const workspaceTemplates = templates.filter(template => template.scope === "workspace");
  const globalTemplates = templates.filter(template => template.scope === "global");
  const workspaceVersion = nativeSnapshot.workspaceVersion;
  const globalVersion = nativeSnapshot.globalVersion + legacySnapshot.version;
  const workspaceFingerprint = createUserTemplateCatalogFingerprint(
    workspaceVersion,
    workspaceTemplates,
  );
  const globalFingerprint = createUserTemplateCatalogFingerprint(
    globalVersion,
    globalTemplates,
  );

  return {
    version: nativeSnapshot.version + legacySnapshot.version,
    workspaceVersion,
    globalVersion,
    workspaceFingerprint,
    globalFingerprint,
    effectiveFingerprint: JSON.stringify({
      workspaceFingerprint,
      globalFingerprint,
    }),
    templates,
  };
};

const createLegacyUserTemplates = (
  templateSnapshot: TemplateSnapshot,
): readonly UserTemplate[] =>
  templateSnapshot.templates.map((template): UserTemplate => {
    const templateFingerprint = createTemplateFingerprint(template);
    const id = normalizeText(template.id) ||
      normalizeText(template.name) ||
      templateFingerprint;
    const name = normalizeText(template.name) || id;
    const version = normalizeTemplateVersion(template.version, templateSnapshot.version);
    const normalizedTemplate = normalizeTemplateForCatalog({
      id,
      name,
      template,
      version,
    });
    return {
      id,
      name,
      version,
      scope: "global",
      source: "legacyPreset",
      template: normalizedTemplate,
      templateFingerprint: createTemplateFingerprint(normalizedTemplate),
      createdAt: 0,
      updatedAt: 0,
    };
  });

const createNativeUserTemplate = (
  input: UserTemplateCreateInput,
  options: CreateNativeUserTemplateOptions = {},
): UserTemplate => {
  const now = options.now ?? Date.now();
  const baseName = normalizeText(input.name) || normalizeText(input.template.name) || "Untitled Template";
  const existingIds = options.existingIds ?? new Set<string>();
  const requestedId = normalizeText(input.id) || normalizeText(input.template.id) || createUserTemplateId(baseName);
  const id = options.allowExistingId
    ? requestedId
    : createUniqueUserTemplateId(requestedId, existingIds);
  const name = baseName || id;
  const template = normalizeTemplateForCatalog({
    id,
    name,
    template: input.template,
    version: 1,
  });
  const tags = normalizeTags(input.tags);
  const description = normalizeOptionalText(input.description);

  return {
    id,
    name,
    version: 1,
    scope: input.scope ?? "global",
    source: input.source ?? "userCreated",
    template,
    templateFingerprint: createTemplateFingerprint(template),
    ...(tags.length ? { tags } : {}),
    ...(description ? { description } : {}),
    createdAt: now,
    updatedAt: now,
  };
};

const normalizeTemplateForCatalog = ({
  id,
  name,
  template,
  version,
}: {
  readonly id: string;
  readonly name: string;
  readonly template: Template;
  readonly version: number;
}): Template => ({
  ...template,
  schemaVersion: 1,
  id,
  name,
  version,
  blocks: Array.isArray(template.blocks) ? template.blocks : [],
  stopOnError: Boolean(template.stopOnError),
});

const toUserTemplateCreateInput = (
  value: UserTemplateImportInput["templates"][number],
  input: UserTemplateImportInput,
): UserTemplateCreateInput | null => {
  if (isUserTemplate(value)) {
    return {
      id: value.id,
      name: value.name,
      scope: input.scope ?? value.scope,
      source: input.source ?? getNativeSource(value.source),
      template: value.template,
      tags: value.tags,
      description: value.description,
    };
  }

  if (isUserTemplateCreateInput(value)) {
    return {
      ...value,
      scope: input.scope ?? value.scope,
      source: input.source ?? value.source ?? "imported",
    };
  }

  if (isTemplate(value)) {
    return {
      scope: input.scope ?? "global",
      source: input.source ?? "imported",
      template: value,
      ...(normalizeText(value.id) ? { id: normalizeText(value.id) } : {}),
      name: normalizeText(value.name) || undefined,
    };
  }

  return null;
};

const isUserTemplate = (
  value: unknown,
): value is UserTemplate =>
  isObjectRecord(value) &&
  isTemplate(value.template) &&
  Boolean(normalizeText(value.id));

const isUserTemplateCreateInput = (
  value: unknown,
): value is UserTemplateCreateInput =>
  isObjectRecord(value) &&
  isTemplate(value.template);

const isTemplate = (
  value: unknown,
): value is Template =>
  isObjectRecord(value) &&
  value.schemaVersion === 1 &&
  typeof value.name === "string" &&
  typeof value.version === "number" &&
  Array.isArray(value.blocks) &&
  typeof value.stopOnError === "boolean";

const getNativeSource = (
  source: unknown,
): NativeUserTemplateSource => {
  switch (source) {
    case "confirmedFromReview":
    case "imported":
    case "userCreated":
      return source;
    default:
      return "imported";
  }
};

const compactUserTemplate = (
  template: UserTemplate,
): UserTemplate => {
  const tags = normalizeTags(template.tags);
  const description = normalizeOptionalText(template.description);
  return {
    id: template.id,
    name: template.name,
    version: template.version,
    scope: template.scope,
    source: template.source,
    template: template.template,
    templateFingerprint: template.templateFingerprint,
    ...(tags.length ? { tags } : {}),
    ...(description ? { description } : {}),
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
};

const createUserTemplateCatalogFingerprint = (
  version: number,
  templates: readonly UserTemplate[],
): string => JSON.stringify({
  kind: "userTemplateSnapshot",
  version,
  templates: templates.map(template => ({
    id: template.id,
    version: template.version,
    templateFingerprint: template.templateFingerprint,
    source: template.source,
    scope: template.scope,
  })),
});

const createUniqueUserTemplateId = (
  requestedId: string,
  existingIds: ReadonlySet<string>,
): string => {
  const base = normalizeText(requestedId) || "user-template";
  if (!existingIds.has(base)) {
    return base;
  }

  for (let suffix = 1; suffix < Number.MAX_SAFE_INTEGER; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!existingIds.has(candidate)) {
      return candidate;
    }
  }

  return `${base}-${Date.now()}`;
};

const createUserTemplateId = (
  value: unknown,
): string => {
  const text = normalizeText(value).toLowerCase();
  const id = text
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return id || "user-template";
};

const normalizeTemplateVersion = (
  templateVersion: unknown,
  fallbackVersion: number,
): number => {
  const version = Math.floor(Number(templateVersion));
  return Number.isInteger(version) && version > 0
    ? version
    : Math.max(1, Math.floor(Number(fallbackVersion)) || 1);
};

const normalizeTags = (
  value: unknown,
): readonly string[] =>
  Array.isArray(value)
    ? [...new Set(value.map(normalizeText).filter(Boolean))].sort()
    : [];

const normalizeOptionalText = (
  value: unknown,
): string | undefined => {
  const text = normalizeText(value);
  return text || undefined;
};

const normalizeText = (
  value: unknown,
): string => String(value ?? "").trim();

const compareUserTemplates = (
  a: UserTemplate,
  b: UserTemplate,
): number =>
  a.scope.localeCompare(b.scope) ||
  a.id.localeCompare(b.id);

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

registerSingleton(
  IUserTemplateService,
  UserTemplateService,
  InstantiationType.Delayed,
);
