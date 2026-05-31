import type { IpcRenderer } from "electron";

import { desktopIpcChannels } from "../src/cs/workbench/services/desktop/common/desktopIpcChannels.js";

export function createDesktopImportBridge(ipcRenderer: IpcRenderer) {
  return {
    async convertExcelFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.excelConvertRust, payload);
    },

    async prepareImportFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.importPrepareRust, payload);
    },

    async readConvertedCsvFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.excelReadConvertedCsv, payload);
    },

    async getAnalysisDemoFiles() {
      return ipcRenderer.invoke(desktopIpcChannels.analysisDemoFilesGet);
    },

    async getDeviceAnalysisDemoFiles() {
      return ipcRenderer.invoke(desktopIpcChannels.analysisDemoFilesGet);
    },

    async openAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEngineOpen, payload);
    },

    async openDeviceAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEngineOpen, payload);
    },

    async getAnalysisPreviewMetaWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEnginePreviewMeta, payload);
    },

    async getDeviceAnalysisPreviewMetaWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEnginePreviewMeta, payload);
    },

    async getAnalysisPreviewRowsWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEnginePreviewRows, payload);
    },

    async getDeviceAnalysisPreviewRowsWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEnginePreviewRows, payload);
    },

    async readAnalysisCellWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEngineReadCell, payload);
    },

    async readDeviceAnalysisCellWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEngineReadCell, payload);
    },

    async readAnalysisCellsWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEngineReadCells, payload);
    },

    async readDeviceAnalysisCellsWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEngineReadCells, payload);
    },

    async inferAnalysisAutoExtractionWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEngineInferAutoExtraction, payload);
    },

    async inferDeviceAnalysisAutoExtractionWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEngineInferAutoExtraction, payload);
    },

    async processAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEngineProcessFile, payload);
    },

    async processDeviceAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEngineProcessFile, payload);
    },

    async analyzeAnalysisRcWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEngineAnalyzeRc, payload);
    },

    async analyzeDeviceAnalysisRcWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEngineAnalyzeRc, payload);
    },

    async exportAnalysisOriginCsvWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEngineExportOriginCsv, payload);
    },

    async exportDeviceAnalysisOriginCsvWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEngineExportOriginCsv, payload);
    },

    async saveAnalysisOriginZip(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisOriginZipSave, payload);
    },

    async saveDeviceAnalysisOriginZip(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisOriginZipSave, payload);
    },

    async disposeAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEngineDispose, payload);
    },

    async disposeDeviceAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(desktopIpcChannels.analysisRustEngineDispose, payload);
    },
  };
}
