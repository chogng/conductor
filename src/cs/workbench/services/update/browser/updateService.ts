/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IUpdateService,
  UNSUPPORTED_DESKTOP_UPDATE_STATUS,
  type DesktopUpdateStatus,
  type IUpdateService as IUpdateServiceType,
} from "src/cs/platform/update/common/update";

export class BrowserUpdateService extends Disposable implements IUpdateServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeStatusEmitter =
    this._register(new Emitter<DesktopUpdateStatus>());
  public readonly onDidChangeStatus = this.onDidChangeStatusEmitter.event;

  private status = UNSUPPORTED_DESKTOP_UPDATE_STATUS;

  public canCheckForUpdates(): boolean {
    return false;
  }

  public checkForUpdates(): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  public checkForUpdatesAndInstall(): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  public getStatus(): DesktopUpdateStatus {
    return { ...this.status };
  }

  public installDownloadedUpdate(): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  public applySpecificUpdate(_packagePath: string): Promise<unknown> {
    return Promise.resolve(undefined);
  }
}

registerSingleton(
  IUpdateService,
  BrowserUpdateService,
  InstantiationType.Delayed,
);
