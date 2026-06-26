/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { contextBridge, ipcRenderer, webUtils, type IpcRenderer } from "electron";

import { workbenchIpcChannels } from "../../../../workbench/common/ipcChannels.js";
import { createSandboxConfiguration } from "./sandboxConfiguration.js";
import {
  type ISandboxConfiguration,
} from "../common/sandboxTypes.js";

type IpcListener = (event: Electron.IpcRendererEvent, ...args: unknown[]) => void;

//#region Types

interface PreloadIpcRenderer {
  send(channel: string, ...args: unknown[]): void;
  sendSync(channel: string, ...args: unknown[]): unknown;
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: IpcListener): PreloadIpcRenderer;
  once(channel: string, listener: IpcListener): PreloadIpcRenderer;
  removeListener(channel: string, listener: IpcListener): PreloadIpcRenderer;
}

//#endregion

//#region Boot profiling

const preloadStartMs =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

function isTruthyFlag(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

function isPreloadBootProfileEnabled(): boolean {
  const host = globalThis as {
    location?: { search?: unknown };
    localStorage?: { getItem?: (key: string) => string | null };
  };

  try {
    const params = new URLSearchParams(String(host.location?.search ?? ""));
    if (isTruthyFlag(params.get("bootProfile"))) {
      return true;
    }
  } catch {
    // Boot profiling is optional; query failures should not block preload.
  }

  try {
    return isTruthyFlag(host.localStorage?.getItem?.("conductor.bootProfile"));
  } catch {
    return false;
  }
}

function logPreloadBoot(stage: string, extra = ""): void {
  if (!isPreloadBootProfileEnabled()) return;

  const nowMs =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const elapsedMs = Math.round(nowMs - preloadStartMs);
  const suffix = extra ? ` ${extra}` : "";
  console.info(`[boot][preload] +${elapsedMs}ms ${stage}${suffix}`);
}

//#endregion

//#region Utilities

function validateIpcChannel(channel: string): true {
  if (!channel?.startsWith("conductor:")) {
    throw new Error(`Unsupported IPC channel '${channel}'.`);
  }

  return true;
}

function readAutoUpdateStatus(ipcRenderer: IpcRenderer): unknown {
  try {
    return ipcRenderer.sendSync(workbenchIpcChannels.desktopAutoUpdateStatusGet);
  } catch (error) {
    console.warn("[boot][preload] Failed to refresh auto-update status:", error);
    return null;
  }
}

//#endregion

//#region Desktop app bridge

function createDesktopAppBridge(ipcRenderer: IpcRenderer) {
  return {
    sendCommand(command: unknown, payload: unknown) {
      if (typeof command !== "string" || command.trim().length === 0) {
        return;
      }

      ipcRenderer.send("desktop-command", { command, payload });
    },

    getAutoUpdateStatus() {
      return readAutoUpdateStatus(ipcRenderer);
    },

    async checkForUpdates() {
      return ipcRenderer.invoke(workbenchIpcChannels.desktopAutoUpdateCheck);
    },

    async checkForUpdatesAndInstall() {
      return ipcRenderer.invoke(workbenchIpcChannels.desktopAutoUpdateCheckAndInstall);
    },

    async installDownloadedUpdate() {
      return ipcRenderer.invoke(workbenchIpcChannels.desktopAutoUpdateInstallDownloaded);
    },

    async applySpecificUpdate(packagePath: unknown) {
      if (typeof packagePath !== "string" || packagePath.trim().length === 0) {
        return undefined;
      }

      return ipcRenderer.invoke(workbenchIpcChannels.desktopAutoUpdateApplySpecific, packagePath);
    },

    onAutoUpdateStatusChange(listener: unknown) {
      if (typeof listener !== "function") {
        return () => undefined;
      }

      const handleStatusChanged = (_event: Electron.IpcRendererEvent, status: unknown) => {
        listener(status);
      };

      ipcRenderer.on(workbenchIpcChannels.desktopAutoUpdateStatusChanged, handleStatusChanged);
      return () => ipcRenderer.removeListener(workbenchIpcChannels.desktopAutoUpdateStatusChanged, handleStatusChanged);
    },
  };
}

//#endregion

//#region Desktop import bridge

function createDesktopImportBridge(ipcRenderer: IpcRenderer) {
  return {
    async getFileDemoFiles() {
      return ipcRenderer.invoke(workbenchIpcChannels.demoFilesGet);
    },

    async calculateFileRcWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.rustHostCalculateRc, payload);
    },

    async exportOriginCsvWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.rustHostExportOriginCsv, payload);
    },

    async saveOriginZip(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.originZipSave, payload);
    },

  };
}

//#endregion

//#region Desktop Origin bridge

function createDesktopOriginBridge(ipcRenderer: IpcRenderer) {
  return {
    async getOriginExePath() {
      return ipcRenderer.invoke(workbenchIpcChannels.originExeGet);
    },

    async setOriginExePath(path: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.originExeSet, { path });
    },

    async pickOriginExePath() {
      return ipcRenderer.invoke(workbenchIpcChannels.originExePick);
    },

    async checkOriginHealth(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.originHealthCheck, payload);
    },

    async runOriginCsv(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.originRunCsv, payload);
    },

    async runOriginRuntimeCleanup(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.originRuntimeCleanupRun, payload);
    },
  };
}

//#endregion

//#region Conductor globals

function exposeConductorGlobals(configuration: ISandboxConfiguration): void {
  const conductorIpcRenderer: PreloadIpcRenderer = {
    send(channel: string, ...args: unknown[]): void {
      validateIpcChannel(channel);
      ipcRenderer.send(channel, ...args);
    },

    sendSync(channel: string, ...args: unknown[]): unknown {
      validateIpcChannel(channel);
      return ipcRenderer.sendSync(channel, ...args);
    },

    invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      validateIpcChannel(channel);
      return ipcRenderer.invoke(channel, ...args);
    },

    on(channel: string, listener: IpcListener): PreloadIpcRenderer {
      validateIpcChannel(channel);
      ipcRenderer.on(channel, listener);
      return conductorIpcRenderer;
    },

    once(channel: string, listener: IpcListener): PreloadIpcRenderer {
      validateIpcChannel(channel);
      ipcRenderer.once(channel, listener);
      return conductorIpcRenderer;
    },

    removeListener(channel: string, listener: IpcListener): PreloadIpcRenderer {
      validateIpcChannel(channel);
      ipcRenderer.removeListener(channel, listener);
      return conductorIpcRenderer;
    },
  };

  contextBridge.exposeInMainWorld("conductor", {
    ipcRenderer: conductorIpcRenderer,
    process: {
      platform: process.platform,
      arch: process.arch,
      env: {},
      versions: {
        node: process.versions.node,
        electron: process.versions.electron,
        chrome: process.versions.chrome,
      },
      type: "renderer",
      cwd: () => "",
    },
    webUtils: {
      getPathForFile(file: File) {
        try {
          return webUtils.getPathForFile(file);
        } catch {
          return "";
        }
      },
    },
    context: {
      configuration(): ISandboxConfiguration {
        return configuration;
      },

      async resolveConfiguration(): Promise<ISandboxConfiguration> {
        return configuration;
      },
    },
  });

  contextBridge.exposeInMainWorld("conductorIpcRenderer", conductorIpcRenderer);
}

//#endregion

//#region Globals exposure

logPreloadBoot("bootstrap:ready");

const sandboxConfiguration = createSandboxConfiguration(ipcRenderer);

contextBridge.exposeInMainWorld("desktopApp", createDesktopAppBridge(ipcRenderer));
contextBridge.exposeInMainWorld("desktopOrigin", createDesktopOriginBridge(ipcRenderer));
contextBridge.exposeInMainWorld("desktopImport", createDesktopImportBridge(ipcRenderer));
exposeConductorGlobals(sandboxConfiguration);

//#endregion
