import type { IpcRenderer } from "electron";

import { ipcChannels } from "./ipc-channels.js";

export function createDesktopImportBridge(ipcRenderer: IpcRenderer) {
  return {
    async convertExcelFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.excelConvertRust, payload);
    },

    async prepareImportFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.importPrepareRust, payload);
    },

    async readConvertedCsvFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.excelReadConvertedCsv, payload);
    },

    async getAnalysisDemoFiles() {
      return ipcRenderer.invoke(ipcChannels.analysisDemoFilesGet);
    },

    async getDeviceAnalysisDemoFiles() {
      return ipcRenderer.invoke(ipcChannels.analysisDemoFilesGet);
    },

    async openAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEngineOpen, payload);
    },

    async openDeviceAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEngineOpen, payload);
    },

    async getAnalysisPreviewMetaWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEnginePreviewMeta, payload);
    },

    async getDeviceAnalysisPreviewMetaWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEnginePreviewMeta, payload);
    },

    async getAnalysisPreviewRowsWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEnginePreviewRows, payload);
    },

    async getDeviceAnalysisPreviewRowsWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEnginePreviewRows, payload);
    },

    async readAnalysisCellWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEngineReadCell, payload);
    },

    async readDeviceAnalysisCellWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEngineReadCell, payload);
    },

    async readAnalysisCellsWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEngineReadCells, payload);
    },

    async readDeviceAnalysisCellsWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEngineReadCells, payload);
    },

    async inferAnalysisAutoExtractionWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEngineInferAutoExtraction, payload);
    },

    async inferDeviceAnalysisAutoExtractionWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEngineInferAutoExtraction, payload);
    },

    async processAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEngineProcessFile, payload);
    },

    async processDeviceAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEngineProcessFile, payload);
    },

    async analyzeAnalysisRcWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEngineAnalyzeRc, payload);
    },

    async analyzeDeviceAnalysisRcWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEngineAnalyzeRc, payload);
    },

    async exportAnalysisOriginCsvWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEngineExportOriginCsv, payload);
    },

    async exportDeviceAnalysisOriginCsvWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEngineExportOriginCsv, payload);
    },

    async saveAnalysisOriginZip(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisOriginZipSave, payload);
    },

    async saveDeviceAnalysisOriginZip(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisOriginZipSave, payload);
    },

    async disposeAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEngineDispose, payload);
    },

    async disposeDeviceAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(ipcChannels.analysisRustEngineDispose, payload);
    },
  };
}
