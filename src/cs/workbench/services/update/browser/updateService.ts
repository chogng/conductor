/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Event } from "src/cs/base/common/event";
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
});

export class BrowserUpdateService extends Disposable implements IWorkbenchUpdateServiceType {
  public declare readonly _serviceBrand: undefined;

  public readonly onDidChangeStatus = Event.None as Event<DesktopUpdateStatus>;

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
    return BROWSER_UPDATE_STATUS;
  }

  public installDownloadedUpdate(): Promise<unknown> {
    return Promise.resolve(undefined);
  }
}

registerSingleton(
  IWorkbenchUpdateService,
  BrowserUpdateService,
  InstantiationType.Delayed,
);
