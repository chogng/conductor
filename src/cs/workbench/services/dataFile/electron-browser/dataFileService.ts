import { Disposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import { fileService } from "src/cs/workbench/services/files/electron-browser/fileService";
import {
  IDataFileService,
  type IDataFileService as IDataFileServiceType,
  type DataFileConvertedCsv,
  type DataFileDemoFiles,
  type DataFilePreparedFile,
  type DataFileRcAnalysisResult,
  type DataFileResultPayload,
} from "src/cs/workbench/services/dataFile/common/dataFile";

type DesktopIpcRenderer = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};

type DataFileBridge = {
  analyzeDeviceAnalysisRcWithRust?: (payload: unknown) => Promise<DataFileRcAnalysisResult>;
  disposeDeviceAnalysisFileWithRust?: (payload: unknown) => Promise<unknown>;
  getDeviceAnalysisDemoFiles?: () => Promise<DataFileDemoFiles>;
  getDeviceAnalysisPreviewMetaWithRust?: (payload: unknown) => Promise<DataFileResultPayload>;
  getDeviceAnalysisPreviewRowsWithRust?: (payload: unknown) => Promise<DataFileResultPayload>;
  inferDeviceAnalysisAutoExtractionWithRust?: (payload: unknown) => Promise<unknown>;
  openDeviceAnalysisFileWithRust?: (payload: unknown) => Promise<DataFileResultPayload>;
  prepareImportFileWithRust?: (payload: { fileName: string; path: string }) => Promise<DataFilePreparedFile>;
  processDeviceAnalysisFileWithRust?: (payload: unknown) => Promise<DataFileResultPayload>;
  readConvertedCsvFileWithRust?: (payload: { path: string }) => Promise<DataFileConvertedCsv>;
  readDeviceAnalysisCellWithRust?: (payload: unknown) => Promise<unknown>;
  readDeviceAnalysisCellsWithRust?: (payload: unknown) => Promise<DataFileResultPayload>;
};

declare global {
  interface Window {
    desktopImport?: DataFileBridge;
  }
}

const DATA_FILE_SERVICE_UNAVAILABLE = "Data file desktop bridge unavailable.";

function getBridge(): DataFileBridge | null {
  const bridge = globalThis.window?.desktopImport;
  return bridge && typeof bridge === "object" ? bridge : null;
}

function hasBridgeMethod<K extends keyof DataFileBridge>(key: K): boolean {
  return typeof getBridge()?.[key] === "function";
}

function getBridgeMethod<K extends keyof DataFileBridge>(
  bridge: DataFileBridge,
  key: K,
): NonNullable<DataFileBridge[K]> {
  const method = bridge[key];
  if (typeof method !== "function") {
    throw new Error(`${DATA_FILE_SERVICE_UNAVAILABLE} (${String(key)})`);
  }

  return method as NonNullable<DataFileBridge[K]>;
}

function getIpcRenderer(): DesktopIpcRenderer {
  const ipcRenderer = (
    globalThis.window as Window & {
      conductor?: { ipcRenderer?: DesktopIpcRenderer };
    } | undefined
  )?.conductor?.ipcRenderer;
  if (!ipcRenderer || typeof ipcRenderer.invoke !== "function") {
    throw new Error(DATA_FILE_SERVICE_UNAVAILABLE);
  }

  return ipcRenderer;
}

function hasIpcRenderer(): boolean {
  const ipcRenderer = (
    globalThis.window as Window & {
      conductor?: { ipcRenderer?: DesktopIpcRenderer };
    } | undefined
  )?.conductor?.ipcRenderer;
  return typeof ipcRenderer?.invoke === "function";
}

function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  return getIpcRenderer().invoke(channel, payload) as Promise<T>;
}

export class ElectronBrowserDataFileService extends Disposable implements IDataFileServiceType {
  public declare readonly _serviceBrand: undefined;

  public analyzeRc(payload: unknown): Promise<DataFileRcAnalysisResult> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("analyzeDeviceAnalysisRcWithRust")) {
      return getBridgeMethod(bridge, "analyzeDeviceAnalysisRcWithRust")(payload);
    }

    return invoke<DataFileRcAnalysisResult>(workbenchIpcChannels.analysisRustEngineAnalyzeRc, payload);
  }

  public canAnalyzeRc(): boolean {
    return hasBridgeMethod("analyzeDeviceAnalysisRcWithRust") || hasIpcRenderer();
  }

  public canDisposeFile(): boolean {
    return hasBridgeMethod("disposeDeviceAnalysisFileWithRust") || hasIpcRenderer();
  }

  public canGetDemoFiles(): boolean {
    return hasBridgeMethod("getDeviceAnalysisDemoFiles") || hasIpcRenderer();
  }

  public canGetPreviewRows(): boolean {
    return hasBridgeMethod("getDeviceAnalysisPreviewRowsWithRust") || hasIpcRenderer();
  }

  public canOpenFile(): boolean {
    return hasBridgeMethod("openDeviceAnalysisFileWithRust") || hasIpcRenderer();
  }

  public canPrepareFile(): boolean {
    return hasBridgeMethod("prepareImportFileWithRust") || hasIpcRenderer();
  }

  public canProcessFile(): boolean {
    return hasBridgeMethod("processDeviceAnalysisFileWithRust") || hasIpcRenderer();
  }

  public canReadConvertedCsv(): boolean {
    return hasBridgeMethod("readConvertedCsvFileWithRust") || hasIpcRenderer();
  }

  public canReadCells(): boolean {
    return hasBridgeMethod("readDeviceAnalysisCellsWithRust") || hasIpcRenderer();
  }

  public disposeFile(payload: unknown): Promise<unknown> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("disposeDeviceAnalysisFileWithRust")) {
      return getBridgeMethod(bridge, "disposeDeviceAnalysisFileWithRust")(payload);
    }

    return invoke(workbenchIpcChannels.analysisRustEngineDispose, payload);
  }

  public getDemoFiles(): Promise<DataFileDemoFiles> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("getDeviceAnalysisDemoFiles")) {
      return getBridgeMethod(bridge, "getDeviceAnalysisDemoFiles")();
    }

    return invoke<DataFileDemoFiles>(workbenchIpcChannels.analysisDemoFilesGet);
  }

  public getPreviewMeta(payload: unknown): Promise<DataFileResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("getDeviceAnalysisPreviewMetaWithRust")) {
      return getBridgeMethod(bridge, "getDeviceAnalysisPreviewMetaWithRust")(payload);
    }

    return invoke<DataFileResultPayload>(workbenchIpcChannels.analysisRustEnginePreviewMeta, payload);
  }

  public getPreviewRows(payload: unknown): Promise<DataFileResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("getDeviceAnalysisPreviewRowsWithRust")) {
      return getBridgeMethod(bridge, "getDeviceAnalysisPreviewRowsWithRust")(payload);
    }

    return invoke<DataFileResultPayload>(workbenchIpcChannels.analysisRustEnginePreviewRows, payload);
  }

  public inferAutoExtraction(payload: unknown): Promise<unknown> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("inferDeviceAnalysisAutoExtractionWithRust")) {
      return getBridgeMethod(bridge, "inferDeviceAnalysisAutoExtractionWithRust")(payload);
    }

    return invoke(workbenchIpcChannels.analysisRustEngineInferAutoExtraction, payload);
  }

  public openFile(payload: unknown): Promise<DataFileResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("openDeviceAnalysisFileWithRust")) {
      return getBridgeMethod(bridge, "openDeviceAnalysisFileWithRust")(payload);
    }

    return invoke<DataFileResultPayload>(workbenchIpcChannels.analysisRustEngineOpen, payload);
  }

  public prepareFile(payload: { fileName: string; path: string }): Promise<DataFilePreparedFile> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("prepareImportFileWithRust")) {
      return getBridgeMethod(bridge, "prepareImportFileWithRust")(payload);
    }

    return invoke<DataFilePreparedFile>(workbenchIpcChannels.importPrepareRust, payload);
  }

  public processFile(payload: unknown): Promise<DataFileResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("processDeviceAnalysisFileWithRust")) {
      return getBridgeMethod(bridge, "processDeviceAnalysisFileWithRust")(payload);
    }

    return invoke<DataFileResultPayload>(workbenchIpcChannels.analysisRustEngineProcessFile, payload);
  }

  public readCell(payload: unknown): Promise<unknown> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("readDeviceAnalysisCellWithRust")) {
      return getBridgeMethod(bridge, "readDeviceAnalysisCellWithRust")(payload);
    }

    return invoke(workbenchIpcChannels.analysisRustEngineReadCell, payload);
  }

  public readCells(payload: unknown): Promise<DataFileResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("readDeviceAnalysisCellsWithRust")) {
      return getBridgeMethod(bridge, "readDeviceAnalysisCellsWithRust")(payload);
    }

    return invoke<DataFileResultPayload>(workbenchIpcChannels.analysisRustEngineReadCells, payload);
  }

  public readConvertedCsv(payload: { path: string }): Promise<DataFileConvertedCsv> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("readConvertedCsvFileWithRust")) {
      return getBridgeMethod(bridge, "readConvertedCsvFileWithRust")(payload);
    }

    return this.readConvertedCsvFromFile(payload);
  }

  private async readConvertedCsvFromFile(
    payload: { path: string },
  ): Promise<DataFileConvertedCsv> {
    const filePath = typeof payload?.path === "string" ? payload.path.trim() : "";
    if (!filePath) {
      return {
        ok: false,
      };
    }

    const resource = URI.file(filePath);
    if (!await fileService.exists(resource)) {
      return {
        ok: false,
      };
    }

    const content = await fileService.readFile(resource, { encoding: "utf8" });
    const sizeBytes = new TextEncoder().encode(content.value).byteLength;

    return {
      csvText: content.value,
      ok: true,
      sizeBytes,
    };
  }
}

export const dataFileService = new ElectronBrowserDataFileService();

registerSingleton(IDataFileService, ElectronBrowserDataFileService, InstantiationType.Delayed);
