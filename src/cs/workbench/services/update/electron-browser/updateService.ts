/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable, toDisposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import {
  DEFAULT_DESKTOP_UPDATE_STATUS,
  IWorkbenchUpdateService,
  isDesktopUpdateStatusEqual,
  normalizeDesktopUpdateStatus,
  type DesktopUpdateStatus,
  type IWorkbenchUpdateService as IWorkbenchUpdateServiceType,
} from "src/cs/workbench/contrib/update/common/update";

type DesktopAppBridge = {
  readonly checkForUpdates?: () => Promise<unknown> | unknown;
  readonly checkForUpdatesAndInstall?: () => Promise<unknown> | unknown;
  readonly getAutoUpdateStatus?: () => unknown;
  readonly installDownloadedUpdate?: () => Promise<unknown> | unknown;
  readonly onAutoUpdateStatusChange?: (
    listener: (status: unknown) => void,
  ) => (() => void) | { dispose(): void } | undefined;
};

type DesktopIpcRenderer = {
  readonly invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>;
  readonly on?: (channel: string, listener: DesktopIpcListener) => unknown;
  readonly removeListener?: (channel: string, listener: DesktopIpcListener) => unknown;
  readonly sendSync?: (channel: string, ...args: unknown[]) => unknown;
};

type DesktopIpcListener = (event: unknown, payload: unknown) => void;

type DesktopUpdateWindow = Window & typeof globalThis & {
  readonly conductor?: {
    readonly ipcRenderer?: DesktopIpcRenderer;
  };
  readonly desktopApp?: DesktopAppBridge;
};

export class WorkbenchUpdateService extends Disposable implements IWorkbenchUpdateServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeStatusEmitter =
    this._register(new Emitter<DesktopUpdateStatus>());
  public readonly onDidChangeStatus = this.onDidChangeStatusEmitter.event;

  private status = DEFAULT_DESKTOP_UPDATE_STATUS;

  public constructor() {
    super();

    this.status = this.readCurrentStatus();
    this.installStatusListener();
  }

  public canCheckForUpdates(): boolean {
    const bridge = getDesktopAppBridge();
    if (typeof bridge?.checkForUpdates === "function") {
      return true;
    }

    return typeof getIpcRenderer()?.invoke === "function";
  }

  public checkForUpdates(): Promise<unknown> {
    const bridge = getDesktopAppBridge();
    if (typeof bridge?.checkForUpdates === "function") {
      return Promise.resolve(bridge.checkForUpdates());
    }

    return this.invokeDesktopUpdateChannel(workbenchIpcChannels.desktopAutoUpdateCheck);
  }

  public checkForUpdatesAndInstall(): Promise<unknown> {
    const bridge = getDesktopAppBridge();
    if (typeof bridge?.checkForUpdatesAndInstall === "function") {
      return Promise.resolve(bridge.checkForUpdatesAndInstall());
    }

    return this.invokeDesktopUpdateChannel(workbenchIpcChannels.desktopAutoUpdateCheckAndInstall);
  }

  public getStatus(): DesktopUpdateStatus {
    return { ...this.status };
  }

  public installDownloadedUpdate(): Promise<unknown> {
    const bridge = getDesktopAppBridge();
    if (typeof bridge?.installDownloadedUpdate === "function") {
      return Promise.resolve(bridge.installDownloadedUpdate());
    }

    return this.invokeDesktopUpdateChannel(workbenchIpcChannels.desktopAutoUpdateInstallDownloaded);
  }

  private readCurrentStatus(): DesktopUpdateStatus {
    const bridge = getDesktopAppBridge();
    if (typeof bridge?.getAutoUpdateStatus === "function") {
      try {
        return normalizeDesktopUpdateStatus(bridge.getAutoUpdateStatus());
      } catch {
        return DEFAULT_DESKTOP_UPDATE_STATUS;
      }
    }

    const ipcRenderer = getIpcRenderer();
    if (typeof ipcRenderer?.sendSync !== "function") {
      return DEFAULT_DESKTOP_UPDATE_STATUS;
    }

    try {
      return normalizeDesktopUpdateStatus(
        ipcRenderer.sendSync(workbenchIpcChannels.desktopAutoUpdateStatusGet),
      );
    } catch {
      return DEFAULT_DESKTOP_UPDATE_STATUS;
    }
  }

  private installStatusListener(): void {
    const bridge = getDesktopAppBridge();
    if (typeof bridge?.onAutoUpdateStatusChange === "function") {
      const disposable = bridge.onAutoUpdateStatusChange(status => {
        this.setStatus(status);
      });
      if (typeof disposable === "function") {
        this._register(toDisposable(disposable));
      } else if (disposable && typeof disposable.dispose === "function") {
        this._register(disposable);
      }
      return;
    }

    const ipcRenderer = getIpcRenderer();
    if (
      typeof ipcRenderer?.on !== "function" ||
      typeof ipcRenderer.removeListener !== "function"
    ) {
      return;
    }

    const listener: DesktopIpcListener = (_event, payload) => {
      this.setStatus(payload);
    };
    ipcRenderer.on(workbenchIpcChannels.desktopAutoUpdateStatusChanged, listener);
    this._register(toDisposable(() => {
      ipcRenderer.removeListener?.(
        workbenchIpcChannels.desktopAutoUpdateStatusChanged,
        listener,
      );
    }));
  }

  private setStatus(value: unknown): void {
    const nextStatus = normalizeDesktopUpdateStatus(value, this.status);
    if (isDesktopUpdateStatusEqual(this.status, nextStatus)) {
      return;
    }

    this.status = nextStatus;
    this.onDidChangeStatusEmitter.fire(this.getStatus());
  }

  private invokeDesktopUpdateChannel(channel: string): Promise<unknown> {
    const ipcRenderer = getIpcRenderer();
    if (typeof ipcRenderer?.invoke !== "function") {
      return Promise.resolve(undefined);
    }

    return ipcRenderer.invoke(channel);
  }
}

const getDesktopWindow = (): DesktopUpdateWindow | undefined =>
  typeof window === "undefined" ? undefined : window as DesktopUpdateWindow;

const getDesktopAppBridge = (): DesktopAppBridge | undefined => {
  const bridge = getDesktopWindow()?.desktopApp;
  return bridge && typeof bridge === "object" ? bridge : undefined;
};

const getIpcRenderer = (): DesktopIpcRenderer | undefined => {
  const ipcRenderer = getDesktopWindow()?.conductor?.ipcRenderer;
  return ipcRenderer && typeof ipcRenderer === "object" ? ipcRenderer : undefined;
};

registerSingleton(
  IWorkbenchUpdateService,
  WorkbenchUpdateService,
  InstantiationType.Delayed,
);
