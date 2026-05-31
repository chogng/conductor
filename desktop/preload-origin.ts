import type { IpcRenderer } from "electron";

import { desktopIpcChannels } from "../src/cs/workbench/services/desktop/common/desktopIpcChannels.js";

export function createDesktopOriginBridge(ipcRenderer: IpcRenderer) {
  return {
    async getOriginExePath() {
      return ipcRenderer.invoke(desktopIpcChannels.originExeGet);
    },

    async setOriginExePath(path: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.originExeSet, { path });
    },

    async pickOriginExePath() {
      return ipcRenderer.invoke(desktopIpcChannels.originExePick);
    },

    async checkOriginHealth(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.originHealthCheck, payload);
    },

    async runOriginCsv(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.originRunCsv, payload);
    },

    async runOriginRuntimeCleanup(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.originRuntimeCleanupRun, payload);
    },
  };
}
