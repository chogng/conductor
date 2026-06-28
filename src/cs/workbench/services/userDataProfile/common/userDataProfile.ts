/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const IUserDataProfileResourceService =
  createDecorator<IUserDataProfileResourceService>("userDataProfileResourceService");

export const UserDataProfileResourceId = {
  UserTemplates: "userTemplates",
} as const;

export type UserDataProfileResourceId =
  typeof UserDataProfileResourceId[keyof typeof UserDataProfileResourceId];

export type UserDataProfileResourceChangeEvent = {
  readonly resource: UserDataProfileResourceId;
};

export type UserDataProfileResourcePayload = {
  readonly id: UserDataProfileResourceId;
  readonly content: string;
};

export type UserDataProfileExportPayload = {
  readonly version: 1;
  readonly source: "conductor.userDataProfile";
  readonly resources: readonly UserDataProfileResourcePayload[];
};

export type UserDataProfileImportResult = {
  readonly imported: readonly UserDataProfileResourceId[];
  readonly skipped: readonly UserDataProfileResourceId[];
};

export interface IUserDataProfileResourceHandler {
  getContent(): string | Promise<string>;
  applyContent(content: string): boolean | Promise<boolean>;
}

export interface IUserDataProfileResourceService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeResource: Event<UserDataProfileResourceChangeEvent>;

  registerResourceHandler(
    resource: UserDataProfileResourceId,
    handler: IUserDataProfileResourceHandler,
  ): IDisposable;
  exportProfile(resources?: readonly UserDataProfileResourceId[]): Promise<UserDataProfileExportPayload>;
  importProfileFromPayload(payload: unknown): Promise<UserDataProfileImportResult | null>;
  readResource<T extends object>(resource: UserDataProfileResourceId): T | undefined;
  writeResource(resource: UserDataProfileResourceId, value: object): void;
}
