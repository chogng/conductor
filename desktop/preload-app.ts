import type { IpcRenderer } from "electron";

import { desktopIpcChannels } from "../src/cs/workbench/services/desktop/common/desktopIpcChannels.js";

function readAutoUpdateStatus(ipcRenderer: IpcRenderer): unknown {
  try {
    return ipcRenderer.sendSync(desktopIpcChannels.desktopAutoUpdateStatusGet);
  } catch (error) {
    console.warn("[boot][preload] Failed to refresh auto-update status:", error);
    return null;
  }
}

export function createDesktopAppBridge(ipcRenderer: IpcRenderer) {
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
      return ipcRenderer.invoke(desktopIpcChannels.desktopAutoUpdateCheck);
    },

    async checkForUpdatesAndInstall() {
      return ipcRenderer.invoke(desktopIpcChannels.desktopAutoUpdateCheckAndInstall);
    },

    async installDownloadedUpdate() {
      return ipcRenderer.invoke(desktopIpcChannels.desktopAutoUpdateInstallDownloaded);
    },

    onAutoUpdateStatusChange(listener: unknown) {
      if (typeof listener !== "function") {
        return () => undefined;
      }

      const handleStatusChanged = (_event: Electron.IpcRendererEvent, status: unknown) => {
        listener(status);
      };

      ipcRenderer.on(desktopIpcChannels.desktopAutoUpdateStatusChanged, handleStatusChanged);
      return () => ipcRenderer.removeListener(desktopIpcChannels.desktopAutoUpdateStatusChanged, handleStatusChanged);
    },
  };
}
