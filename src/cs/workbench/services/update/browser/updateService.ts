/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IWorkbenchUpdateService,
  type DesktopUpdateStatus,
  type IWorkbenchUpdateService as IWorkbenchUpdateServiceType,
} from "src/cs/workbench/contrib/update/common/update";

const BROWSER_UPDATE_STATUS: DesktopUpdateStatus = Object.freeze({
  status: "unsupported",
  version: null,
  channel: "unsupported",
  isStoreManaged: false,
  message: null,
  progressPercent: null,
});

export class BrowserUpdateService extends Disposable implements IWorkbenchUpdateServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeStatusEmitter =
    this._register(new Emitter<DesktopUpdateStatus>());
  public readonly onDidChangeStatus = this.onDidChangeStatusEmitter.event;

  private status = BROWSER_UPDATE_STATUS;

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
  IWorkbenchUpdateService,
  BrowserUpdateService,
  InstantiationType.Delayed,
);
