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
const desktopMeta = (() => {
  try {
    return ipcRenderer.sendSync(ipcChannels.desktopMetaGet);
  } catch (error) {
    console.warn("[boot][preload] Failed to get desktop metadata:", error);
    return null;
  }
})();
const desktopAutoUpdateStatus = (() => {
  try {
    return ipcRenderer.sendSync(ipcChannels.desktopAutoUpdateStatusGet);
  } catch (error) {
    console.warn("[boot][preload] Failed to get auto-update status:", error);
    return null;
  }
})();

contextBridge.exposeInMainWorld("desktopBootstrap", {
  initialAnalysisSettings:
    desktopBootstrap && typeof desktopBootstrap === "object" && !Array.isArray(desktopBootstrap)
      ? desktopBootstrap
      : null,
  initialDeviceAnalysisSettings:
    desktopBootstrap && typeof desktopBootstrap === "object" && !Array.isArray(desktopBootstrap)
      ? desktopBootstrap
      : null,
});

contextBridge.exposeInMainWorld("desktopMeta", {
  isDesktop: true,
  platform: process.platform,
  isPackaged:
    desktopMeta && typeof desktopMeta === "object" && "isPackaged" in desktopMeta
      ? desktopMeta.isPackaged === true
      : false,
  appVersion:
    desktopMeta && typeof desktopMeta === "object" && typeof desktopMeta.appVersion === "string"
      ? desktopMeta.appVersion
      : null,
});

contextBridge.exposeInMainWorld("desktopApp", {
  sendCommand(command, payload) {
    if (typeof command !== "string" || command.trim().length === 0) return;
    ipcRenderer.send("desktop-command", { command, payload });
  },
  getAutoUpdateStatus() {
    return desktopAutoUpdateStatus;
  },
  onAutoUpdateStatusChange(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    const handleStatusChanged = (_event, status) => {
      listener(status);
    };

    ipcRenderer.on(ipcChannels.desktopAutoUpdateStatusChanged, handleStatusChanged);
    return () => {
      ipcRenderer.removeListener(
        ipcChannels.desktopAutoUpdateStatusChanged,
        handleStatusChanged,
      );
    };
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
  async getAnalysisTemplates() {
    return ipcRenderer.invoke(ipcChannels.templatesGet);
  },
  async getDeviceAnalysisTemplates() {
    return ipcRenderer.invoke(ipcChannels.templatesGet);
  },
  async createAnalysisTemplate(template) {
    return ipcRenderer.invoke(ipcChannels.templatesCreate, template);
  },
  async createDeviceAnalysisTemplate(template) {
    return ipcRenderer.invoke(ipcChannels.templatesCreate, template);
  },
  async deleteAnalysisTemplate(id) {
    return ipcRenderer.invoke(ipcChannels.templatesDelete, id);
  },
  async deleteDeviceAnalysisTemplate(id) {
    return ipcRenderer.invoke(ipcChannels.templatesDelete, id);
  },
  async getAnalysisSettings() {
    return ipcRenderer.invoke(ipcChannels.settingsGet);
  },
  async getDeviceAnalysisSettings() {
    return ipcRenderer.invoke(ipcChannels.settingsGet);
  },
  async updateAnalysisSettings(updates) {
    return ipcRenderer.invoke(ipcChannels.settingsPatch, updates);
  },
  async updateDeviceAnalysisSettings(updates) {
    return ipcRenderer.invoke(ipcChannels.settingsPatch, updates);
  },
  async getAnalysisPersistencePath() {
    return ipcRenderer.invoke(ipcChannels.persistencePathGet);
  },
  async getDeviceAnalysisPersistencePath() {
    return ipcRenderer.invoke(ipcChannels.persistencePathGet);
  },
  async updateAnalysisPersistencePath(path) {
    return ipcRenderer.invoke(ipcChannels.persistencePathSet, { path });
  },
  async updateDeviceAnalysisPersistencePath(path) {
    return ipcRenderer.invoke(ipcChannels.persistencePathSet, { path });
  },
  async chooseAnalysisPersistencePath() {
    return ipcRenderer.invoke(ipcChannels.persistencePathChoose);
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
  async readConvertedCsvFileWithRust(payload) {
    return ipcRenderer.invoke(ipcChannels.excelReadConvertedCsv, payload);
  },
  async getAnalysisDemoFiles() {
    return ipcRenderer.invoke(ipcChannels.analysisDemoFilesGet);
  },
  async getDeviceAnalysisDemoFiles() {
    return ipcRenderer.invoke(ipcChannels.analysisDemoFilesGet);
  },
  async openAnalysisFileWithRust(payload) {
    return ipcRenderer.invoke(ipcChannels.analysisRustEngineOpen, payload);
  },
  async openDeviceAnalysisFileWithRust(payload) {
    return ipcRenderer.invoke(ipcChannels.analysisRustEngineOpen, payload);
  },
  async getAnalysisPreviewMetaWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.analysisRustEnginePreviewMeta,
      payload,
    );
  },
  async getDeviceAnalysisPreviewMetaWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.analysisRustEnginePreviewMeta,
      payload,
    );
  },
  async getAnalysisPreviewRowsWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.analysisRustEnginePreviewRows,
      payload,
    );
  },
  async getDeviceAnalysisPreviewRowsWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.analysisRustEnginePreviewRows,
      payload,
    );
  },
  async readAnalysisCellWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.analysisRustEngineReadCell,
      payload,
    );
  },
  async readDeviceAnalysisCellWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.analysisRustEngineReadCell,
      payload,
    );
  },
  async readAnalysisCellsWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.analysisRustEngineReadCells,
      payload,
    );
  },
  async readDeviceAnalysisCellsWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.analysisRustEngineReadCells,
      payload,
    );
  },
  async inferAnalysisAutoExtractionWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.analysisRustEngineInferAutoExtraction,
      payload,
    );
  },
  async inferDeviceAnalysisAutoExtractionWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.analysisRustEngineInferAutoExtraction,
      payload,
    );
  },
  async processAnalysisFileWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.analysisRustEngineProcessFile,
      payload,
    );
  },
  async processDeviceAnalysisFileWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.analysisRustEngineProcessFile,
      payload,
    );
  },
  async analyzeAnalysisRcWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.analysisRustEngineAnalyzeRc,
      payload,
    );
  },
  async analyzeDeviceAnalysisRcWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.analysisRustEngineAnalyzeRc,
      payload,
    );
  },
  async exportAnalysisOriginCsvWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.analysisRustEngineExportOriginCsv,
      payload,
    );
  },
  async exportDeviceAnalysisOriginCsvWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.analysisRustEngineExportOriginCsv,
      payload,
    );
  },
  async saveAnalysisOriginZip(payload) {
    return ipcRenderer.invoke(ipcChannels.analysisOriginZipSave, payload);
  },
  async saveDeviceAnalysisOriginZip(payload) {
    return ipcRenderer.invoke(ipcChannels.analysisOriginZipSave, payload);
  },
  async disposeAnalysisFileWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.analysisRustEngineDispose,
      payload,
    );
  },
  async disposeDeviceAnalysisFileWithRust(payload) {
    return ipcRenderer.invoke(
      ipcChannels.analysisRustEngineDispose,
      payload,
    );
  },
});
