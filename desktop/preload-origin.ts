import type { IpcRenderer } from "electron";

import { workbenchIpcChannels } from "../src/cs/workbench/common/ipcChannels.js";

export function createDesktopOriginBridge(ipcRenderer: IpcRenderer) {
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
