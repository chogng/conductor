/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { IpcRenderer } from "electron";

import { workbenchIpcChannels } from "../../../../workbench/common/ipcChannels.js";

function readAutoUpdateStatus(ipcRenderer: IpcRenderer): unknown {
  try {
    return ipcRenderer.sendSync(workbenchIpcChannels.desktopAutoUpdateStatusGet);
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
      return ipcRenderer.invoke(workbenchIpcChannels.desktopAutoUpdateCheck);
    },

    async checkForUpdatesAndInstall() {
      return ipcRenderer.invoke(workbenchIpcChannels.desktopAutoUpdateCheckAndInstall);
    },

    async installDownloadedUpdate() {
      return ipcRenderer.invoke(workbenchIpcChannels.desktopAutoUpdateInstallDownloaded);
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
