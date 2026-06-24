/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import {
  ITemplateService,
  type ITemplateService as ITemplateServiceType,
  type TemplateSnapshot,
} from "src/cs/workbench/services/template/common/template";
import {
  IUserTemplateService,
  type IUserTemplateService as IUserTemplateServiceType,
  type UserTemplate,
  type UserTemplateChangeEvent,
  type UserTemplateSnapshot,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

export class UserTemplateService extends Disposable implements IUserTemplateServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeUserTemplatesEmitter =
    this._register(new Emitter<UserTemplateChangeEvent>());
  public readonly onDidChangeUserTemplates =
    this.onDidChangeUserTemplatesEmitter.event;

  public constructor(
    @ITemplateService private readonly templateService: ITemplateServiceType,
  ) {
    super();
    this._register(this.templateService.onDidChangeTemplates(() => {
      const snapshot = this.getSnapshot();
      this.onDidChangeUserTemplatesEmitter.fire({
        version: snapshot.version,
        effectiveFingerprint: snapshot.effectiveFingerprint,
      });
    }));
  }

  public getSnapshot(): UserTemplateSnapshot {
    return createUserTemplateSnapshotFromLegacyTemplates(
      this.templateService.getSnapshot(),
    );
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
}

export const createUserTemplateSnapshotFromLegacyTemplates = (
  templateSnapshot: TemplateSnapshot,
): UserTemplateSnapshot => {
  const templates = templateSnapshot.templates.map((template): UserTemplate => {
    const templateFingerprint = createTemplateFingerprint(template);
    const id = normalizeText(template.id) ||
      normalizeText(template.name) ||
      templateFingerprint;
    return {
      id,
      name: normalizeText(template.name) || id,
      version: normalizeTemplateVersion(template.version, templateSnapshot.version),
      scope: "global",
      source: "legacyPreset",
      template,
      templateFingerprint,
      createdAt: 0,
      updatedAt: 0,
    };
  });
  const globalFingerprint = createUserTemplateCatalogFingerprint(
    templateSnapshot.version,
    templates,
  );

  return {
    version: templateSnapshot.version,
    workspaceVersion: 0,
    globalVersion: templateSnapshot.version,
    workspaceFingerprint: createUserTemplateCatalogFingerprint(0, []),
    globalFingerprint,
    effectiveFingerprint: globalFingerprint,
    templates,
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

const normalizeTemplateVersion = (
  templateVersion: unknown,
  fallbackVersion: number,
): number => {
  const version = Math.floor(Number(templateVersion));
  return Number.isInteger(version) && version > 0
    ? version
    : Math.max(1, Math.floor(Number(fallbackVersion)) || 1);
};

const normalizeText = (
  value: unknown,
): string => String(value ?? "").trim();

registerSingleton(
  IUserTemplateService,
  UserTemplateService,
  InstantiationType.Delayed,
);
