/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable, DisposableStore, toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IStorageService,
  StorageScope,
  StorageTarget,
} from "src/cs/platform/storage/common/storage";
import {
  IUserDataProfileResourceService,
  UserDataProfileResourceId,
  type IUserDataProfileResourceHandler,
  type UserDataProfileExportPayload,
  type UserDataProfileResourceChangeEvent,
  type UserDataProfileResourcePayload,
  type UserDataProfileImportResult,
} from "src/cs/workbench/services/userDataProfile/common/userDataProfile";

export class UserDataProfileResourceService extends Disposable implements IUserDataProfileResourceService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeResourceEmitter =
    this._register(new Emitter<UserDataProfileResourceChangeEvent>());
  public readonly onDidChangeResource = this.onDidChangeResourceEmitter.event;
  private readonly resourceHandlers = new Map<UserDataProfileResourceId, IUserDataProfileResourceHandler>();

  public constructor(
    @IStorageService private readonly storageService: IStorageService,
  ) {
    super();
    this.registerStorageListeners();
  }

  public registerResourceHandler(
    resource: UserDataProfileResourceId,
    handler: IUserDataProfileResourceHandler,
  ): IDisposable {
    if (this.resourceHandlers.has(resource)) {
      throw new Error(`UserDataProfile resource handler already registered: ${resource}`);
    }

    this.resourceHandlers.set(resource, handler);
    return toDisposable(() => {
      if (this.resourceHandlers.get(resource) === handler) {
        this.resourceHandlers.delete(resource);
      }
    });
  }

  public async exportProfile(
    resources: readonly UserDataProfileResourceId[] = Object.values(UserDataProfileResourceId),
  ): Promise<UserDataProfileExportPayload> {
    const payloadResources: UserDataProfileResourcePayload[] = [];
    for (const resource of resources) {
      const handler = this.resourceHandlers.get(resource);
      if (!handler) {
        continue;
      }

      payloadResources.push({
        id: resource,
        content: await handler.getContent(),
      });
    }

    return {
      version: 1,
      source: "conductor.userDataProfile",
      resources: payloadResources,
    };
  }

  public async importProfileFromPayload(payload: unknown): Promise<UserDataProfileImportResult | null> {
    const resources = toUserDataProfileResourcePayloads(payload);
    if (!resources) {
      return null;
    }

    const imported: UserDataProfileResourceId[] = [];
    const skipped: UserDataProfileResourceId[] = [];
    for (const resource of resources) {
      const handler = this.resourceHandlers.get(resource.id);
      if (!handler) {
        skipped.push(resource.id);
        continue;
      }

      const didImport = await handler.applyContent(resource.content);
      if (didImport) {
        imported.push(resource.id);
      } else {
        skipped.push(resource.id);
      }
    }

    return {
      imported,
      skipped,
    };
  }

  public readResource<T extends object>(resource: UserDataProfileResourceId): T | undefined {
    return this.storageService.getObject<T>(
      getStorageKeyForProfileResource(resource),
      StorageScope.PROFILE,
    );
  }

  public writeResource(resource: UserDataProfileResourceId, value: object): void {
    this.storageService.store(
      getStorageKeyForProfileResource(resource),
      value,
      StorageScope.PROFILE,
      StorageTarget.USER,
    );
  }

  private registerStorageListeners(): void {
    for (const resource of Object.values(UserDataProfileResourceId)) {
      const disposables = this._register(new DisposableStore());
      this.storageService.onDidChangeValue(
        StorageScope.PROFILE,
        getStorageKeyForProfileResource(resource),
        disposables,
      )(() => {
        this.onDidChangeResourceEmitter.fire({ resource });
      });
    }
  }
}

const getStorageKeyForProfileResource = (
  resource: UserDataProfileResourceId,
): string => `userDataProfile.resource.${resource}`;

const toUserDataProfileResourcePayloads = (
  payload: unknown,
): readonly { readonly id: UserDataProfileResourceId; readonly content: string }[] | null => {
  const entry = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
  if (
    !entry ||
    entry.source !== "conductor.userDataProfile" ||
    entry.version !== 1 ||
    !Array.isArray(entry.resources)
  ) {
    return null;
  }

  const resources = [];
  for (const resource of entry.resources) {
    const candidate = resource && typeof resource === "object" && !Array.isArray(resource)
      ? resource as Record<string, unknown>
      : null;
    if (!candidate || !isUserDataProfileResourceId(candidate.id) || typeof candidate.content !== "string") {
      continue;
    }

    resources.push({
      id: candidate.id,
      content: candidate.content,
    });
  }

  return resources;
};

const isUserDataProfileResourceId = (
  value: unknown,
): value is UserDataProfileResourceId =>
  Object.values(UserDataProfileResourceId).includes(value as UserDataProfileResourceId);

registerSingleton(
  IUserDataProfileResourceService,
  UserDataProfileResourceService,
  InstantiationType.Delayed,
);
