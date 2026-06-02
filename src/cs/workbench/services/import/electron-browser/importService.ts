import { Disposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { fileService } from "src/cs/platform/files/electron-browser/fileService";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import {
  IImportService,
  type IImportService as IImportServiceType,
  type ImportConvertedCsv,
  type ImportDemoFiles,
  type ImportPreparedFile,
  type ImportRcAnalysisResult,
  type ImportResultPayload,
} from "src/cs/workbench/services/import/common/import";

type DesktopIpcRenderer = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};

type ImportBridge = {
  analyzeDeviceAnalysisRcWithRust?: (payload: unknown) => Promise<ImportRcAnalysisResult>;
  disposeDeviceAnalysisFileWithRust?: (payload: unknown) => Promise<unknown>;
  getDeviceAnalysisDemoFiles?: () => Promise<ImportDemoFiles>;
  getDeviceAnalysisPreviewMetaWithRust?: (payload: unknown) => Promise<ImportResultPayload>;
  getDeviceAnalysisPreviewRowsWithRust?: (payload: unknown) => Promise<ImportResultPayload>;
  inferDeviceAnalysisAutoExtractionWithRust?: (payload: unknown) => Promise<unknown>;
  openDeviceAnalysisFileWithRust?: (payload: unknown) => Promise<ImportResultPayload>;
  prepareImportFileWithRust?: (payload: { fileName: string; path: string }) => Promise<ImportPreparedFile>;
  processDeviceAnalysisFileWithRust?: (payload: unknown) => Promise<ImportResultPayload>;
  readConvertedCsvFileWithRust?: (payload: { path: string }) => Promise<ImportConvertedCsv>;
  readDeviceAnalysisCellWithRust?: (payload: unknown) => Promise<unknown>;
  readDeviceAnalysisCellsWithRust?: (payload: unknown) => Promise<ImportResultPayload>;
};

declare global {
  interface Window {
    desktopImport?: ImportBridge;
  }
}

const IMPORT_SERVICE_UNAVAILABLE = "Import desktop bridge unavailable.";

function getBridge(): ImportBridge | null {
  const bridge = globalThis.window?.desktopImport;
  return bridge && typeof bridge === "object" ? bridge : null;
}

function hasBridgeMethod<K extends keyof ImportBridge>(key: K): boolean {
  return typeof getBridge()?.[key] === "function";
}

function getBridgeMethod<K extends keyof ImportBridge>(
  bridge: ImportBridge,
  key: K,
): NonNullable<ImportBridge[K]> {
  const method = bridge[key];
  if (typeof method !== "function") {
    throw new Error(`${IMPORT_SERVICE_UNAVAILABLE} (${String(key)})`);
  }

  return method as NonNullable<ImportBridge[K]>;
}

function getIpcRenderer(): DesktopIpcRenderer {
  const ipcRenderer = (
    globalThis.window as Window & {
      conductor?: { ipcRenderer?: DesktopIpcRenderer };
    } | undefined
  )?.conductor?.ipcRenderer;
  if (!ipcRenderer || typeof ipcRenderer.invoke !== "function") {
    throw new Error(IMPORT_SERVICE_UNAVAILABLE);
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

export class ElectronBrowserImportService extends Disposable implements IImportServiceType {
  public declare readonly _serviceBrand: undefined;

  public analyzeRc(payload: unknown): Promise<ImportRcAnalysisResult> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("analyzeDeviceAnalysisRcWithRust")) {
      return getBridgeMethod(bridge, "analyzeDeviceAnalysisRcWithRust")(payload);
    }

    return invoke<ImportRcAnalysisResult>(workbenchIpcChannels.analysisRustEngineAnalyzeRc, payload);
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

  public getDemoFiles(): Promise<ImportDemoFiles> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("getDeviceAnalysisDemoFiles")) {
      return getBridgeMethod(bridge, "getDeviceAnalysisDemoFiles")();
    }

    return invoke<ImportDemoFiles>(workbenchIpcChannels.analysisDemoFilesGet);
  }

  public getPreviewMeta(payload: unknown): Promise<ImportResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("getDeviceAnalysisPreviewMetaWithRust")) {
      return getBridgeMethod(bridge, "getDeviceAnalysisPreviewMetaWithRust")(payload);
    }

    return invoke<ImportResultPayload>(workbenchIpcChannels.analysisRustEnginePreviewMeta, payload);
  }

  public getPreviewRows(payload: unknown): Promise<ImportResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("getDeviceAnalysisPreviewRowsWithRust")) {
      return getBridgeMethod(bridge, "getDeviceAnalysisPreviewRowsWithRust")(payload);
    }

    return invoke<ImportResultPayload>(workbenchIpcChannels.analysisRustEnginePreviewRows, payload);
  }

  public inferAutoExtraction(payload: unknown): Promise<unknown> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("inferDeviceAnalysisAutoExtractionWithRust")) {
      return getBridgeMethod(bridge, "inferDeviceAnalysisAutoExtractionWithRust")(payload);
    }

    return invoke(workbenchIpcChannels.analysisRustEngineInferAutoExtraction, payload);
  }

  public openFile(payload: unknown): Promise<ImportResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("openDeviceAnalysisFileWithRust")) {
      return getBridgeMethod(bridge, "openDeviceAnalysisFileWithRust")(payload);
    }

    return invoke<ImportResultPayload>(workbenchIpcChannels.analysisRustEngineOpen, payload);
  }

  public prepareFile(payload: { fileName: string; path: string }): Promise<ImportPreparedFile> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("prepareImportFileWithRust")) {
      return getBridgeMethod(bridge, "prepareImportFileWithRust")(payload);
    }

    return invoke<ImportPreparedFile>(workbenchIpcChannels.importPrepareRust, payload);
  }

  public processFile(payload: unknown): Promise<ImportResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("processDeviceAnalysisFileWithRust")) {
      return getBridgeMethod(bridge, "processDeviceAnalysisFileWithRust")(payload);
    }

    return invoke<ImportResultPayload>(workbenchIpcChannels.analysisRustEngineProcessFile, payload);
  }

  public readCell(payload: unknown): Promise<unknown> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("readDeviceAnalysisCellWithRust")) {
      return getBridgeMethod(bridge, "readDeviceAnalysisCellWithRust")(payload);
    }

    return invoke(workbenchIpcChannels.analysisRustEngineReadCell, payload);
  }

  public readCells(payload: unknown): Promise<ImportResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("readDeviceAnalysisCellsWithRust")) {
      return getBridgeMethod(bridge, "readDeviceAnalysisCellsWithRust")(payload);
    }

    return invoke<ImportResultPayload>(workbenchIpcChannels.analysisRustEngineReadCells, payload);
  }

  public readConvertedCsv(payload: { path: string }): Promise<ImportConvertedCsv> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("readConvertedCsvFileWithRust")) {
      return getBridgeMethod(bridge, "readConvertedCsvFileWithRust")(payload);
    }

    return this.readConvertedCsvFromFile(payload);
  }

  private async readConvertedCsvFromFile(
    payload: { path: string },
  ): Promise<ImportConvertedCsv> {
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

export const importService = new ElectronBrowserImportService();

registerSingleton(IImportService, ElectronBrowserImportService, InstantiationType.Delayed);
