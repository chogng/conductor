import type { IpcRenderer } from "electron";

import { ipcChannels } from "./ipc-channels.js";

export function createDesktopAppBridge(
  ipcRenderer: IpcRenderer,
  initialAutoUpdateStatus: unknown,
) {
  return {
    sendCommand(command: unknown, payload: unknown) {
      if (typeof command !== "string" || command.trim().length === 0) {
        return;
      }

      ipcRenderer.send("desktop-command", { command, payload });
    },

    getAutoUpdateStatus() {
      try {
        return ipcRenderer.sendSync(ipcChannels.desktopAutoUpdateStatusGet);
      } catch (error) {
        console.warn("[boot][preload] Failed to refresh auto-update status:", error);
        return initialAutoUpdateStatus;
      }
    },

    async checkForUpdates() {
      return ipcRenderer.invoke(ipcChannels.desktopAutoUpdateCheck);
    },

    async checkForUpdatesAndInstall() {
      return ipcRenderer.invoke(ipcChannels.desktopAutoUpdateCheckAndInstall);
    },

    async installDownloadedUpdate() {
      return ipcRenderer.invoke(ipcChannels.desktopAutoUpdateInstallDownloaded);
    },

    onAutoUpdateStatusChange(listener: unknown) {
      if (typeof listener !== "function") {
        return () => undefined;
      }

      const handleStatusChanged = (_event: Electron.IpcRendererEvent, status: unknown) => {
        listener(status);
      };

      ipcRenderer.on(ipcChannels.desktopAutoUpdateStatusChanged, handleStatusChanged);
      return () => ipcRenderer.removeListener(ipcChannels.desktopAutoUpdateStatusChanged, handleStatusChanged);
    },
  };
}
