/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable, DisposableStore } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IStorageService,
  StorageScope,
  StorageTarget,
} from "src/cs/platform/storage/common/storage";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type { Template } from "src/cs/workbench/services/template/common/templateSpec";
import {
  IUserDataProfileResourceService,
  UserDataProfileResourceId,
} from "src/cs/workbench/services/userDataProfile/common/userDataProfile";
import {
  IUserTemplateStoreService,
  type NativeUserTemplateSource,
  type UserTemplate,
  type UserTemplateScope,
  type UserTemplateStoreSnapshot,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

export const USER_TEMPLATE_WORKSPACE_STORAGE_KEY = "userTemplate.workspaceTemplates";

type StoredUserTemplateState = {
  readonly version?: unknown;
  readonly templates?: readonly unknown[];
};

type ScopeSnapshot = {
  readonly version: number;
  readonly templates: readonly UserTemplate[];
};

export class UserTemplateStoreService extends Disposable implements IUserTemplateStoreService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeUserTemplatesEmitter =
    this._register(new Emitter<UserTemplateStoreSnapshot>());
  public readonly onDidChangeUserTemplates =
    this.onDidChangeUserTemplatesEmitter.event;

  private profileSnapshot: ScopeSnapshot;
  private workspaceSnapshot: ScopeSnapshot;
  private snapshot: UserTemplateStoreSnapshot;

  public constructor(
    @IUserDataProfileResourceService
    private readonly userDataProfileResourceService: IUserDataProfileResourceService,
    @IStorageService private readonly storageService: IStorageService,
  ) {
    super();
    this.profileSnapshot = this.readScopeSnapshot("profile");
    this.workspaceSnapshot = this.readScopeSnapshot("workspace");
    this.snapshot = this.createSnapshot();
    this.registerStorageListeners();
  }

  public getSnapshot(): UserTemplateStoreSnapshot {
    return this.snapshot;
  }

  public upsertTemplate(template: UserTemplate): UserTemplate {
    const normalizedTemplate = normalizeUserTemplate(template);
    if (!normalizedTemplate) {
      return template;
    }

    const nextProfileTemplates = normalizedTemplate.scope === "profile"
      ? upsertTemplate(this.profileSnapshot.templates, normalizedTemplate)
      : removeTemplate(this.profileSnapshot.templates, normalizedTemplate.id);
    const nextWorkspaceTemplates = normalizedTemplate.scope === "workspace"
      ? upsertTemplate(this.workspaceSnapshot.templates, normalizedTemplate)
      : removeTemplate(this.workspaceSnapshot.templates, normalizedTemplate.id);

    this.storeScopes({
      profileTemplates: nextProfileTemplates,
      workspaceTemplates: nextWorkspaceTemplates,
    });
    return normalizedTemplate;
  }

  public removeTemplate(id: string): void {
    const templateId = normalizeText(id);
    if (!templateId) {
      return;
    }

    this.storeScopes({
      profileTemplates: removeTemplate(this.profileSnapshot.templates, templateId),
      workspaceTemplates: removeTemplate(this.workspaceSnapshot.templates, templateId),
    });
  }

  public clearTemplates(): void {
    this.storeScopes({
      profileTemplates: [],
      workspaceTemplates: [],
    });
  }

  private registerStorageListeners(): void {
    this._register(this.userDataProfileResourceService.onDidChangeResource(event => {
      if (event.resource !== UserDataProfileResourceId.UserTemplates) {
        return;
      }

      this.profileSnapshot = this.readScopeSnapshot("profile");
      this.setSnapshot(this.createSnapshot());
    }));

    const workspaceDisposables = this._register(new DisposableStore());
    this.storageService.onDidChangeValue(
      StorageScope.WORKSPACE,
      USER_TEMPLATE_WORKSPACE_STORAGE_KEY,
      workspaceDisposables,
    )(() => {
      this.workspaceSnapshot = this.readScopeSnapshot("workspace");
      this.setSnapshot(this.createSnapshot());
    });
  }

  private readScopeSnapshot(scope: UserTemplateScope): ScopeSnapshot {
    const stored = scope === "profile"
      ? this.userDataProfileResourceService.readResource<StoredUserTemplateState>(UserDataProfileResourceId.UserTemplates)
      : this.storageService.getObject<StoredUserTemplateState>(
        USER_TEMPLATE_WORKSPACE_STORAGE_KEY,
        StorageScope.WORKSPACE,
      );
    return {
      version: normalizeVersion(stored?.version),
      templates: normalizeUserTemplates(stored?.templates ?? [], scope),
    };
  }

  private storeScopes({
    profileTemplates,
    workspaceTemplates,
  }: {
    readonly profileTemplates: readonly UserTemplate[];
    readonly workspaceTemplates: readonly UserTemplate[];
  }): void {
    const profileChanged = !areTemplatesEqual(this.profileSnapshot.templates, profileTemplates);
    const workspaceChanged = !areTemplatesEqual(this.workspaceSnapshot.templates, workspaceTemplates);
    if (!profileChanged && !workspaceChanged) {
      return;
    }

    if (profileChanged) {
      this.profileSnapshot = {
        version: this.profileSnapshot.version + 1,
        templates: profileTemplates,
      };
    }
    if (workspaceChanged) {
      this.workspaceSnapshot = {
        version: this.workspaceSnapshot.version + 1,
        templates: workspaceTemplates,
      };
    }

    this.setSnapshot(this.createSnapshot());

    if (profileChanged) {
      this.writeScopeSnapshot("profile", this.profileSnapshot);
    }
    if (workspaceChanged) {
      this.writeScopeSnapshot("workspace", this.workspaceSnapshot);
    }
  }

  private writeScopeSnapshot(scope: UserTemplateScope, snapshot: ScopeSnapshot): void {
    if (scope === "profile") {
      this.userDataProfileResourceService.writeResource(
        UserDataProfileResourceId.UserTemplates,
        snapshot,
      );
      return;
    }

    this.storageService.store(
      USER_TEMPLATE_WORKSPACE_STORAGE_KEY,
      snapshot,
      StorageScope.WORKSPACE,
      StorageTarget.USER,
    );
  }

  private createSnapshot(): UserTemplateStoreSnapshot {
    return {
      version: this.workspaceSnapshot.version + this.profileSnapshot.version,
      workspaceVersion: this.workspaceSnapshot.version,
      profileVersion: this.profileSnapshot.version,
      templates: [
        ...this.workspaceSnapshot.templates,
        ...this.profileSnapshot.templates,
      ].sort(compareTemplates),
    };
  }

  private setSnapshot(snapshot: UserTemplateStoreSnapshot): void {
    if (
      this.snapshot.version === snapshot.version &&
      this.snapshot.workspaceVersion === snapshot.workspaceVersion &&
      this.snapshot.profileVersion === snapshot.profileVersion &&
      areTemplatesEqual(this.snapshot.templates, snapshot.templates)
    ) {
      return;
    }

    this.snapshot = snapshot;
    this.onDidChangeUserTemplatesEmitter.fire(snapshot);
  }
}

const upsertTemplate = (
  templates: readonly UserTemplate[],
  template: UserTemplate,
): readonly UserTemplate[] => {
  const result = removeTemplate(templates, template.id);
  return [...result, template].sort(compareTemplates);
};

const removeTemplate = (
  templates: readonly UserTemplate[],
  id: string,
): readonly UserTemplate[] =>
  templates.filter(template => template.id !== id);

const normalizeUserTemplates = (
  values: readonly unknown[],
  scope: UserTemplateScope,
): readonly UserTemplate[] => {
  const templates: UserTemplate[] = [];
  for (const value of values) {
    const template = normalizeUserTemplate(value, scope);
    if (!template) {
      continue;
    }
    const next = upsertTemplate(templates, template);
    templates.length = 0;
    templates.push(...next);
  }
  return templates;
};

const normalizeUserTemplate = (
  value: unknown,
  forcedScope?: UserTemplateScope,
): UserTemplate | null => {
  if (!isObjectRecord(value)) {
    return null;
  }

  const id = normalizeText(value.id);
  const name = normalizeText(value.name);
  const version = normalizePositiveInteger(value.version) ?? 1;
  const template = normalizeTemplate(value.template, { id, name, version });
  if (!template) {
    return null;
  }

  const templateId = id || normalizeText(template.id) || createTemplateFingerprint(template);
  const templateName = name || normalizeText(template.name) || templateId;
  const normalizedTemplate = normalizeTemplate(template, {
    id: templateId,
    name: templateName,
    version,
  });
  if (!normalizedTemplate) {
    return null;
  }

  const description = normalizeText(value.description);
  return {
    id: templateId,
    name: templateName,
    version,
    scope: forcedScope ?? normalizeScope(value.scope),
    source: normalizeSource(value.source),
    template: normalizedTemplate,
    templateFingerprint: createTemplateFingerprint(normalizedTemplate),
    ...(normalizeTags(value.tags).length ? { tags: normalizeTags(value.tags) } : {}),
    ...(description ? { description } : {}),
    createdAt: normalizeTimestamp(value.createdAt),
    updatedAt: normalizeTimestamp(value.updatedAt),
  };
};

const normalizeTemplate = (
  value: unknown,
  fallback: {
    readonly id: string;
    readonly name: string;
    readonly version: number;
  },
): Template | null => {
  if (!isObjectRecord(value)) {
    return null;
  }

  if (value.schemaVersion !== 1 || !Array.isArray(value.blocks)) {
    return null;
  }

  const id = normalizeText(fallback.id) || normalizeText(value.id);
  const name = normalizeText(fallback.name) || normalizeText(value.name) || id;
  const version = normalizePositiveInteger(fallback.version) ??
    normalizePositiveInteger(value.version) ??
    1;

  return {
    ...value,
    schemaVersion: 1,
    ...(id ? { id } : {}),
    name: name || "Untitled Template",
    version,
    blocks: value.blocks as Template["blocks"],
    stopOnError: typeof value.stopOnError === "boolean" ? value.stopOnError : false,
  } as Template;
};

const normalizeScope = (
  value: unknown,
): UserTemplateScope =>
  value === "workspace" ? "workspace" : "profile";

const normalizeSource = (
  value: unknown,
): NativeUserTemplateSource => {
  switch (value) {
    case "userCreated":
    case "confirmedFromReview":
    case "imported":
      return value;
    default:
      return "imported";
  }
};

const normalizeTags = (
  value: unknown,
): readonly string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map(normalizeText).filter(Boolean))].sort();
};

const normalizeTimestamp = (
  value: unknown,
): number => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

const normalizeVersion = (
  value: unknown,
): number => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

const normalizePositiveInteger = (
  value: unknown,
): number | undefined => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : undefined;
};

const normalizeText = (
  value: unknown,
): string =>
  String(value ?? "").trim();

const compareTemplates = (
  a: UserTemplate,
  b: UserTemplate,
): number =>
  a.scope.localeCompare(b.scope) ||
  a.id.localeCompare(b.id);

const areTemplatesEqual = (
  a: readonly UserTemplate[],
  b: readonly UserTemplate[],
): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

registerSingleton(IUserTemplateStoreService, UserTemplateStoreService, InstantiationType.Delayed);
