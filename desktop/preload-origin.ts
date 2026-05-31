import type { IpcRenderer } from "electron";

import { ipcChannels } from "./ipc-channels.js";

export function createDesktopOriginBridge(ipcRenderer: IpcRenderer) {
  return {
    async getOriginExePath() {
      return ipcRenderer.invoke(ipcChannels.originExeGet);
    },

    async setOriginExePath(path: unknown) {
      return ipcRenderer.invoke(ipcChannels.originExeSet, { path });
    },

    async pickOriginExePath() {
      return ipcRenderer.invoke(ipcChannels.originExePick);
    },

    async checkOriginHealth(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.originHealthCheck, payload);
    },

    async runOriginCsv(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.originRunCsv, payload);
    },

    async runOriginRuntimeCleanup(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.originRuntimeCleanupRun, payload);
    },
  };
}
