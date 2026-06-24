/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { Template } from "src/cs/workbench/services/template/common/templateSpec";

export const IUserTemplateService =
  createDecorator<IUserTemplateService>("userTemplateService");

export const IUserTemplateStoreService =
  createDecorator<IUserTemplateStoreService>("userTemplateStoreService");

export type UserTemplateScope =
  | "workspace"
  | "global";

export type UserTemplateSource =
  | "userCreated"
  | "imported"
  | "confirmedFromReview"
  | "legacyPreset";

export type NativeUserTemplateSource = Exclude<UserTemplateSource, "legacyPreset">;

export type UserTemplate = {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly scope: UserTemplateScope;
  readonly source: UserTemplateSource;
  readonly template: Template;
  readonly templateFingerprint: string;
  readonly tags?: readonly string[];
  readonly description?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
};

export type UserTemplateSnapshot = {
  readonly version: number;
  readonly workspaceVersion: number;
  readonly globalVersion: number;
  readonly workspaceFingerprint: string;
  readonly globalFingerprint: string;
  readonly effectiveFingerprint: string;
  readonly templates: readonly UserTemplate[];
};

export type UserTemplateChangeEvent = {
  readonly version: number;
  readonly effectiveFingerprint: string;
};

export type UserTemplateStoreSnapshot = {
  readonly version: number;
  readonly workspaceVersion: number;
  readonly globalVersion: number;
  readonly templates: readonly UserTemplate[];
};

export type UserTemplateCreateInput = {
  readonly id?: string;
  readonly name?: string;
  readonly scope?: UserTemplateScope;
  readonly source?: NativeUserTemplateSource;
  readonly template: Template;
  readonly tags?: readonly string[];
  readonly description?: string | null;
};

export type UserTemplateUpdate = {
  readonly name?: string;
  readonly scope?: UserTemplateScope;
  readonly source?: NativeUserTemplateSource;
  readonly template?: Template;
  readonly tags?: readonly string[] | null;
  readonly description?: string | null;
};

export type UserTemplateImportInput = {
  readonly templates: readonly (UserTemplate | UserTemplateCreateInput | Template)[];
  readonly overwrite?: boolean;
  readonly scope?: UserTemplateScope;
  readonly source?: NativeUserTemplateSource;
};

export type UserTemplateImportSkipped = {
  readonly id?: string;
  readonly name?: string;
  readonly reason: string;
};

export type UserTemplateImportResult = {
  readonly imported: readonly UserTemplate[];
  readonly skipped: readonly UserTemplateImportSkipped[];
};

export type UserTemplateExportPayload = {
  readonly version: 1;
  readonly source: "conductor.userTemplate";
  readonly templates: readonly UserTemplate[];
};

export interface IUserTemplateStoreService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeUserTemplates: Event<UserTemplateStoreSnapshot>;

  clearTemplates(): void;
  getSnapshot(): UserTemplateStoreSnapshot;
  removeTemplate(id: string): void;
  upsertTemplate(template: UserTemplate): UserTemplate;
}

export interface IUserTemplateService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeUserTemplates: Event<UserTemplateChangeEvent>;

  createTemplate(input: UserTemplateCreateInput): Promise<UserTemplate>;
  deleteTemplate(id: string): Promise<void>;
  duplicateTemplate(id: string, overrides?: Partial<UserTemplateCreateInput>): Promise<UserTemplate>;
  exportTemplates(ids?: readonly string[]): UserTemplateExportPayload;
  getSnapshot(): UserTemplateSnapshot;
  getTemplate(id: string): UserTemplate | undefined;
  importTemplates(input: UserTemplateImportInput): Promise<UserTemplateImportResult>;
  refreshTemplates(): Promise<readonly UserTemplate[]>;
  updateTemplate(id: string, update: UserTemplateUpdate): Promise<UserTemplate>;
}
