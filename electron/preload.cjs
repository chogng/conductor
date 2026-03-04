const { contextBridge, ipcRenderer } = require("electron");

const ipcChannels = {
  templatesGet: "device-analysis-store:templates:get",
  templatesCreate: "device-analysis-store:templates:create",
  templatesDelete: "device-analysis-store:templates:delete",
  settingsGet: "device-analysis-store:settings:get",
  settingsPatch: "device-analysis-store:settings:patch",
  persistencePathGet: "device-analysis-store:persistence-path:get",
  persistencePathSet: "device-analysis-store:persistence-path:set",
  persistencePathChoose: "device-analysis-store:persistence-path:choose",
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
