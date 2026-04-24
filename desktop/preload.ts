import { contextBridge, ipcRenderer, webUtils } from "electron";
import { ipcChannels } from "./ipc-channels.js";
const preloadStartMs =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

function logPreloadBoot(stage, extra = "") {
  const nowMs =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const elapsedMs = Math.round(nowMs - preloadStartMs);
  const suffix = extra ? ` ${extra}` : "";
  console.info(`[boot][preload] +${elapsedMs}ms ${stage}${suffix}`);
}

logPreloadBoot("bootstrap:ready");

const desktopBootstrap = (() => {
  try {
    return ipcRenderer.sendSync(ipcChannels.desktopBootSettingsGet);
  } catch (error) {
    console.warn("[boot][preload] Failed to get initial desktop settings:", error);
    return null;
  }
})();

contextBridge.exposeInMainWorld("desktopBootstrap", {
  initialDeviceAnalysisSettings:
    desktopBootstrap && typeof desktopBootstrap === "object" && !Array.isArray(desktopBootstrap)
      ? desktopBootstrap
      : null,
});

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

contextBridge.exposeInMainWorld("desktopBoot", {
  async markUiReady(source) {
    return ipcRenderer.invoke(ipcChannels.desktopBootUiReady, {
      source: typeof source === "string" ? source : "unknown",
    });
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

contextBridge.exposeInMainWorld("desktopImport", {
  getFilePath(file) {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return "";
    }
  },
  async convertExcelFileWithRust(payload) {
    return ipcRenderer.invoke(ipcChannels.excelConvertRust, payload);
  },
  async openDeviceAnalysisFileWithRust(payload) {
    return ipcRenderer.invoke(ipcChannels.deviceAnalysisRustEngineOpen, payload);
  },
  async getDeviceAnalysisPreviewMetaWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.deviceAnalysisRustEnginePreviewMeta,
      payload,
    );
  },
  async getDeviceAnalysisPreviewRowsWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.deviceAnalysisRustEnginePreviewRows,
      payload,
    );
  },
  async readDeviceAnalysisCellWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.deviceAnalysisRustEngineReadCell,
      payload,
    );
  },
  async readDeviceAnalysisCellsWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.deviceAnalysisRustEngineReadCells,
      payload,
    );
  },
  async inferDeviceAnalysisAutoExtractionWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.deviceAnalysisRustEngineInferAutoExtraction,
      payload,
    );
  },
  async processDeviceAnalysisFileWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.deviceAnalysisRustEngineProcessFile,
      payload,
    );
  },
  async analyzeDeviceAnalysisSeriesBatchWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.deviceAnalysisRustEngineAnalyzeSeriesBatch,
      payload,
    );
  },
  async disposeDeviceAnalysisFileWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.deviceAnalysisRustEngineDispose,
      payload,
    );
  },
});
