import { contextBridge, ipcRenderer } from "electron";

const ipcChannels = {
  templatesGet: "device-analysis-store:templates:get",
  templatesCreate: "device-analysis-store:templates:create",
  templatesDelete: "device-analysis-store:templates:delete",
  settingsGet: "device-analysis-store:settings:get",
  settingsPatch: "device-analysis-store:settings:patch",
  persistencePathGet: "device-analysis-store:persistence-path:get",
  persistencePathSet: "device-analysis-store:persistence-path:set",
  persistencePathChoose: "device-analysis-store:persistence-path:choose",
  originExeGet: "device-analysis-origin:exe:get",
  originExeSet: "device-analysis-origin:exe:set",
  originExePick: "device-analysis-origin:exe:pick",
  originHealthCheck: "device-analysis-origin:health-check",
  originRunBatch: "device-analysis-origin:run-batch",
  originRunZip: "device-analysis-origin:run-zip",
  originRunCsv: "device-analysis-origin:run-csv",
  originRuntimeCleanupRun: "device-analysis-origin:runtime-cleanup:run",
};

contextBridge.exposeInMainWorld("desktopMeta", {
  isDesktop: true,
  platform: process.platform,
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
  async runOriginBatch(payload) {
    return ipcRenderer.invoke(ipcChannels.originRunBatch, payload);
  },
  async runOriginZip(payload) {
    return ipcRenderer.invoke(ipcChannels.originRunZip, payload);
  },
  async runOriginCsv(payload) {
    return ipcRenderer.invoke(ipcChannels.originRunCsv, payload);
  },
  async runOriginRuntimeCleanup(payload) {
    return ipcRenderer.invoke(ipcChannels.originRuntimeCleanupRun, payload);
  },
});
