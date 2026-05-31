import type { ContextBridge, IpcRenderer } from "electron";

import { ipcChannels } from "./ipc-channels.js";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

export function readDesktopBootstrap(ipcRenderer: IpcRenderer): JsonRecord | null {
  try {
    return asRecord(ipcRenderer.sendSync(ipcChannels.desktopBootSettingsGet));
  } catch (error) {
    console.warn("[boot][preload] Failed to get initial desktop settings:", error);
    return null;
  }
}

export function readDesktopMeta(ipcRenderer: IpcRenderer): JsonRecord | null {
  try {
    return asRecord(ipcRenderer.sendSync(ipcChannels.desktopMetaGet));
  } catch (error) {
    console.warn("[boot][preload] Failed to get desktop metadata:", error);
    return null;
  }
}

export function readDesktopAutoUpdateStatus(ipcRenderer: IpcRenderer): unknown {
  try {
    return ipcRenderer.sendSync(ipcChannels.desktopAutoUpdateStatusGet);
  } catch (error) {
    console.warn("[boot][preload] Failed to get auto-update status:", error);
    return null;
  }
}

export function exposeDesktopBootGlobals(
  contextBridge: ContextBridge,
  ipcRenderer: IpcRenderer,
  desktopBootstrap: JsonRecord | null,
  desktopMeta: JsonRecord | null,
): void {
  contextBridge.exposeInMainWorld("desktopBootstrap", {
    initialAnalysisSettings: desktopBootstrap,
    initialDeviceAnalysisSettings: desktopBootstrap,
  });

  contextBridge.exposeInMainWorld("desktopMeta", {
    isDesktop: true,
    platform: process.platform,
    isPackaged: desktopMeta?.isPackaged === true,
    appVersion: typeof desktopMeta?.appVersion === "string" ? desktopMeta.appVersion : null,
  });

  contextBridge.exposeInMainWorld("desktopBoot", {
    async markUiReady(source: unknown) {
      return ipcRenderer.invoke(ipcChannels.desktopBootUiReady, {
        source: typeof source === "string" ? source : "unknown",
      });
    },
  });
}
