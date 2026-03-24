import { contextBridge, ipcRenderer } from "electron";
import { ipcChannels } from "./ipc-channels.js";

contextBridge.exposeInMainWorld("desktopMeta", {
  isDesktop: true,
  platform: process.platform,
  isPackaged: !process.defaultApp,
});

contextBridge.exposeInMainWorld("desktopApp", {
  sendCommand(command, payload) {
    if (typeof command !== "string" || command.trim().length === 0) return;
    ipcRenderer.send("desktop-command", { command, payload });
  },
});

contextBridge.exposeInMainWorld("desktopStore", {
  async getDeviceAnalysisTemplates() {
    return ipcRenderer.invoke(ipcChannels.templatesGet);
  },
  async createDeviceAnalysisTemplate(template) {
    return ipcRenderer.invoke(ipcChannels.templatesCreate, template);
  },
  async deleteDeviceAnalysisTemplate(id) {
    return ipcRenderer.invoke(ipcChannels.templatesDelete, id);
  },
  async getDeviceAnalysisSettings() {
    return ipcRenderer.invoke(ipcChannels.settingsGet);
  },
  async updateDeviceAnalysisSettings(updates) {
    return ipcRenderer.invoke(ipcChannels.settingsPatch, updates);
  },
  async getDeviceAnalysisPersistencePath() {
    return ipcRenderer.invoke(ipcChannels.persistencePathGet);
  },
  async updateDeviceAnalysisPersistencePath(path) {
    return ipcRenderer.invoke(ipcChannels.persistencePathSet, { path });
  },
  async chooseDeviceAnalysisPersistencePath() {
    return ipcRenderer.invoke(ipcChannels.persistencePathChoose);
  },
});

contextBridge.exposeInMainWorld("desktopOrigin", {
  async getOriginExePath() {
    return ipcRenderer.invoke(ipcChannels.originExeGet);
  },
  async setOriginExePath(path) {
    return ipcRenderer.invoke(ipcChannels.originExeSet, { path });
  },
  async pickOriginExePath() {
    return ipcRenderer.invoke(ipcChannels.originExePick);
  },
  async checkOriginHealth(payload) {
    return ipcRenderer.invoke(ipcChannels.originHealthCheck, payload);
  },
  async runOriginCsv(payload) {
    return ipcRenderer.invoke(ipcChannels.originRunCsv, payload);
  },
  async runOriginRuntimeCleanup(payload) {
    return ipcRenderer.invoke(ipcChannels.originRuntimeCleanupRun, payload);
  },
});
