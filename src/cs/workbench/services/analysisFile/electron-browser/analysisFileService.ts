import { Disposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import { fileService } from "src/cs/workbench/services/files/electron-browser/fileService";
import {
  IAnalysisFileService,
  type IAnalysisFileService as IAnalysisFileServiceType,
  type AnalysisFileConvertedCsv,
  type AnalysisFileDemoFiles,
  type AnalysisFilePreparedFile,
  type AnalysisFileRcAnalysisResult,
  type AnalysisFileResultPayload,
} from "src/cs/workbench/services/analysisFile/common/analysisFile";

type DesktopIpcRenderer = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
};

type AnalysisFileBridge = {
  analyzeAnalysisFileRcWithRust?: (payload: unknown) => Promise<AnalysisFileRcAnalysisResult>;
  disposeAnalysisFileWithRust?: (payload: unknown) => Promise<unknown>;
  getAnalysisFileDemoFiles?: () => Promise<AnalysisFileDemoFiles>;
  getAnalysisFilePreviewMetaWithRust?: (payload: unknown) => Promise<AnalysisFileResultPayload>;
  getAnalysisFilePreviewRowsWithRust?: (payload: unknown) => Promise<AnalysisFileResultPayload>;
  inferAnalysisFileAutoExtractionWithRust?: (payload: unknown) => Promise<unknown>;
  openAnalysisFileWithRust?: (payload: unknown) => Promise<AnalysisFileResultPayload>;
  prepareImportFileWithRust?: (payload: { fileName: string; path: string }) => Promise<AnalysisFilePreparedFile>;
  processAnalysisFileWithRust?: (payload: unknown) => Promise<AnalysisFileResultPayload>;
  readConvertedCsvFileWithRust?: (payload: { path: string }) => Promise<AnalysisFileConvertedCsv>;
  readAnalysisFileCellWithRust?: (payload: unknown) => Promise<unknown>;
  readAnalysisFileCellsWithRust?: (payload: unknown) => Promise<AnalysisFileResultPayload>;
};

declare global {
  interface Window {
    desktopImport?: AnalysisFileBridge;
  }
}

const SERVICE_UNAVAILABLE = "Analysis file desktop bridge unavailable.";

function getBridge(): AnalysisFileBridge | null {
  const bridge = globalThis.window?.desktopImport;
  return bridge && typeof bridge === "object" ? bridge : null;
}

function hasBridgeMethod<K extends keyof AnalysisFileBridge>(key: K): boolean {
  return typeof getBridge()?.[key] === "function";
}

function getBridgeMethod<K extends keyof AnalysisFileBridge>(
  bridge: AnalysisFileBridge,
  key: K,
): NonNullable<AnalysisFileBridge[K]> {
  const method = bridge[key];
  if (typeof method !== "function") {
    throw new Error(`${SERVICE_UNAVAILABLE} (${String(key)})`);
  }

  return method as NonNullable<AnalysisFileBridge[K]>;
}

function getIpcRenderer(): DesktopIpcRenderer {
  const ipcRenderer = (
    globalThis.window as Window & {
      conductor?: { ipcRenderer?: DesktopIpcRenderer };
    } | undefined
  )?.conductor?.ipcRenderer;
  if (!ipcRenderer || typeof ipcRenderer.invoke !== "function") {
    throw new Error(SERVICE_UNAVAILABLE);
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

export class ElectronBrowserAnalysisFileService extends Disposable implements IAnalysisFileServiceType {
  public declare readonly _serviceBrand: undefined;

  public analyzeRc(payload: unknown): Promise<AnalysisFileRcAnalysisResult> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("analyzeAnalysisFileRcWithRust")) {
      return getBridgeMethod(bridge, "analyzeAnalysisFileRcWithRust")(payload);
    }

    return invoke<AnalysisFileRcAnalysisResult>(workbenchIpcChannels.analysisRustEngineAnalyzeRc, payload);
  }

  public canAnalyzeRc(): boolean {
    return hasBridgeMethod("analyzeAnalysisFileRcWithRust") || hasIpcRenderer();
  }

  public canDisposeFile(): boolean {
    return hasBridgeMethod("disposeAnalysisFileWithRust") || hasIpcRenderer();
  }

  public canGetDemoFiles(): boolean {
    return hasBridgeMethod("getAnalysisFileDemoFiles") || hasIpcRenderer();
  }

  public canGetPreviewRows(): boolean {
    return hasBridgeMethod("getAnalysisFilePreviewRowsWithRust") || hasIpcRenderer();
  }

  public canOpenFile(): boolean {
    return hasBridgeMethod("openAnalysisFileWithRust") || hasIpcRenderer();
  }

  public canPrepareFile(): boolean {
    return hasBridgeMethod("prepareImportFileWithRust") || hasIpcRenderer();
  }

  public canProcessFile(): boolean {
    return hasBridgeMethod("processAnalysisFileWithRust") || hasIpcRenderer();
  }

  public canReadConvertedCsv(): boolean {
    return hasBridgeMethod("readConvertedCsvFileWithRust") || hasIpcRenderer();
  }

  public canReadCells(): boolean {
    return hasBridgeMethod("readAnalysisFileCellsWithRust") || hasIpcRenderer();
  }

  public disposeFile(payload: unknown): Promise<unknown> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("disposeAnalysisFileWithRust")) {
      return getBridgeMethod(bridge, "disposeAnalysisFileWithRust")(payload);
    }

    return invoke(workbenchIpcChannels.analysisRustEngineDispose, payload);
  }

  public getDemoFiles(): Promise<AnalysisFileDemoFiles> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("getAnalysisFileDemoFiles")) {
      return getBridgeMethod(bridge, "getAnalysisFileDemoFiles")();
    }

    return invoke<AnalysisFileDemoFiles>(workbenchIpcChannels.analysisDemoFilesGet);
  }

  public getPreviewMeta(payload: unknown): Promise<AnalysisFileResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("getAnalysisFilePreviewMetaWithRust")) {
      return getBridgeMethod(bridge, "getAnalysisFilePreviewMetaWithRust")(payload);
    }

    return invoke<AnalysisFileResultPayload>(workbenchIpcChannels.analysisRustEnginePreviewMeta, payload);
  }

  public getPreviewRows(payload: unknown): Promise<AnalysisFileResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("getAnalysisFilePreviewRowsWithRust")) {
      return getBridgeMethod(bridge, "getAnalysisFilePreviewRowsWithRust")(payload);
    }

    return invoke<AnalysisFileResultPayload>(workbenchIpcChannels.analysisRustEnginePreviewRows, payload);
  }

  public inferAutoExtraction(payload: unknown): Promise<unknown> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("inferAnalysisFileAutoExtractionWithRust")) {
      return getBridgeMethod(bridge, "inferAnalysisFileAutoExtractionWithRust")(payload);
    }

    return invoke(workbenchIpcChannels.analysisRustEngineInferAutoExtraction, payload);
  }

  public openFile(payload: unknown): Promise<AnalysisFileResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("openAnalysisFileWithRust")) {
      return getBridgeMethod(bridge, "openAnalysisFileWithRust")(payload);
    }

    return invoke<AnalysisFileResultPayload>(workbenchIpcChannels.analysisRustEngineOpen, payload);
  }

  public prepareFile(payload: { fileName: string; path: string }): Promise<AnalysisFilePreparedFile> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("prepareImportFileWithRust")) {
      return getBridgeMethod(bridge, "prepareImportFileWithRust")(payload);
    }

    return invoke<AnalysisFilePreparedFile>(workbenchIpcChannels.importPrepareRust, payload);
  }

  public processFile(payload: unknown): Promise<AnalysisFileResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("processAnalysisFileWithRust")) {
      return getBridgeMethod(bridge, "processAnalysisFileWithRust")(payload);
    }

    return invoke<AnalysisFileResultPayload>(workbenchIpcChannels.analysisRustEngineProcessFile, payload);
  }

  public readCell(payload: unknown): Promise<unknown> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("readAnalysisFileCellWithRust")) {
      return getBridgeMethod(bridge, "readAnalysisFileCellWithRust")(payload);
    }

    return invoke(workbenchIpcChannels.analysisRustEngineReadCell, payload);
  }

  public readCells(payload: unknown): Promise<AnalysisFileResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("readAnalysisFileCellsWithRust")) {
      return getBridgeMethod(bridge, "readAnalysisFileCellsWithRust")(payload);
    }

    return invoke<AnalysisFileResultPayload>(workbenchIpcChannels.analysisRustEngineReadCells, payload);
  }

  public readConvertedCsv(payload: { path: string }): Promise<AnalysisFileConvertedCsv> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("readConvertedCsvFileWithRust")) {
      return getBridgeMethod(bridge, "readConvertedCsvFileWithRust")(payload);
    }

    return this.readConvertedCsvFromFile(payload);
  }

  private async readConvertedCsvFromFile(
    payload: { path: string },
  ): Promise<AnalysisFileConvertedCsv> {
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

registerSingleton(IAnalysisFileService, ElectronBrowserAnalysisFileService, InstantiationType.Delayed);
