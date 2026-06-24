/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { Template } from "src/cs/workbench/services/template/common/templateSpec";

export const IUserTemplateService =
  createDecorator<IUserTemplateService>("userTemplateService");

export type UserTemplateScope =
  | "workspace"
  | "global";

export type UserTemplateSource =
  | "userCreated"
  | "imported"
  | "confirmedFromReview"
  | "legacyPreset";

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

export interface IUserTemplateService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeUserTemplates: Event<UserTemplateChangeEvent>;

  getSnapshot(): UserTemplateSnapshot;
  getTemplate(id: string): UserTemplate | undefined;
  refreshTemplates(): Promise<readonly UserTemplate[]>;
}
