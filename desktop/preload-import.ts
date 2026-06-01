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

    async getAnalysisDemoFiles() {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisDemoFilesGet);
    },

    async getDeviceAnalysisDemoFiles() {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisDemoFilesGet);
    },

    async openAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineOpen, payload);
    },

    async openDeviceAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineOpen, payload);
    },

    async getAnalysisPreviewMetaWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEnginePreviewMeta, payload);
    },

    async getDeviceAnalysisPreviewMetaWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEnginePreviewMeta, payload);
    },

    async getAnalysisPreviewRowsWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEnginePreviewRows, payload);
    },

    async getDeviceAnalysisPreviewRowsWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEnginePreviewRows, payload);
    },

    async readAnalysisCellWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineReadCell, payload);
    },

    async readDeviceAnalysisCellWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineReadCell, payload);
    },

    async readAnalysisCellsWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineReadCells, payload);
    },

    async readDeviceAnalysisCellsWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineReadCells, payload);
    },

    async inferAnalysisAutoExtractionWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineInferAutoExtraction, payload);
    },

    async inferDeviceAnalysisAutoExtractionWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineInferAutoExtraction, payload);
    },

    async processAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineProcessFile, payload);
    },

    async processDeviceAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineProcessFile, payload);
    },

    async analyzeAnalysisRcWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineAnalyzeRc, payload);
    },

    async analyzeDeviceAnalysisRcWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineAnalyzeRc, payload);
    },

    async exportAnalysisOriginCsvWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineExportOriginCsv, payload);
    },

    async exportDeviceAnalysisOriginCsvWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineExportOriginCsv, payload);
    },

    async saveAnalysisOriginZip(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisOriginZipSave, payload);
    },

    async saveDeviceAnalysisOriginZip(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisOriginZipSave, payload);
    },

    async disposeAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineDispose, payload);
    },

    async disposeDeviceAnalysisFileWithRust(payload: unknown) {
      return ipcRenderer.invoke(workbenchIpcChannels.analysisRustEngineDispose, payload);
    },
  };
}
