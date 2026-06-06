import type { IpcRenderer } from "electron";

import { workbenchIpcChannels } from "../src/cs/workbench/common/ipcChannels.js";

export function createDesktopImportBridge(ipcRenderer: IpcRenderer) {
  return {
    async convertExcelFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.excelConvertRust, payload);
    },

    async prepareImportFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.importPrepareRust, payload);
    },

    async readConvertedCsvFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.excelReadConvertedCsv, payload);
    },

    async getAnalysisFileDemoFiles() {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisDemoFilesGet);
    },

    async openAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineOpen, payload);
    },

    async getAnalysisFilePreviewMetaWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEnginePreviewMeta, payload);
    },

    async getAnalysisFilePreviewRowsWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEnginePreviewRows, payload);
    },

    async readAnalysisFileCellWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineReadCell, payload);
    },

    async readAnalysisFileCellsWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineReadCells, payload);
    },

    async inferAnalysisFileAutoExtractionWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineInferAutoExtraction, payload);
    },

    async processAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineProcessFile, payload);
    },

    async analyzeAnalysisFileRcWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineAnalyzeRc, payload);
    },

    async exportAnalysisOriginCsvWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineExportOriginCsv, payload);
    },

    async saveAnalysisOriginZip(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisOriginZipSave, payload);
    },

    async disposeAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineDispose, payload);
    },
  };
}
