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
import { localize } from "src/cs/nls";

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

const getServiceUnavailableMessage = (): string =>
  localize("analysisFile.desktopBridgeUnavailable", "Analysis file desktop bridge unavailable.");

const getAnalysisFileErrorMessage = (code: unknown): string => {
  switch (code) {
    case "ANALYSIS_FILE_NOT_FOUND":
      return localize("analysisFile.error.fileNotFound", "Analysis file was not found.");
    case "INVALID_ANALYSIS_CELL":
      return localize("analysisFile.error.invalidCell", "Invalid analysis cell request.");
    case "INVALID_ANALYSIS_CELLS":
      return localize("analysisFile.error.invalidCells", "Invalid analysis cells request.");
    case "INVALID_ANALYSIS_FILE_ID":
      return localize("analysisFile.error.invalidFileId", "Missing analysis file id.");
    case "INVALID_ANALYSIS_PATH":
      return localize("analysisFile.error.invalidPath", "Invalid analysis file path.");
    case "RUST_ENGINE_EXPORT_FAILED":
      return localize("analysisFile.error.exportFailed", "Failed to export Origin CSV.");
    case "RUST_ENGINE_EXPORT_UNSUPPORTED_CONFIG":
      return localize("analysisFile.error.exportUnsupportedConfig", "This Origin export plan is not supported yet.");
    case "RUST_ENGINE_INFER_AUTO_EXTRACTION_FAILED":
      return localize("analysisFile.error.inferAutoExtractionFailed", "Failed to infer auto extraction.");
    case "RUST_ENGINE_OPEN_FAILED":
      return localize("analysisFile.error.openFailed", "Failed to open analysis file.");
    case "RUST_ENGINE_PREVIEW_META_FAILED":
      return localize("analysisFile.error.previewMetaFailed", "Failed to read preview metadata.");
    case "RUST_ENGINE_PREVIEW_ROWS_FAILED":
      return localize("analysisFile.error.previewRowsFailed", "Failed to read preview rows.");
    case "RUST_ENGINE_PROCESS_FAILED":
      return localize("analysisFile.error.processFailed", "Failed to process analysis file.");
    case "RUST_ENGINE_PROCESS_UNSUPPORTED_CONFIG":
      return localize("analysisFile.error.processUnsupportedConfig", "This extraction config is not supported yet.");
    case "RUST_ENGINE_RC_FAILED":
      return localize("analysisFile.error.rcFailed", "Rc analysis failed.");
    case "RUST_ENGINE_RC_MISSING_DEVICES":
      return localize("analysisFile.error.rcMissingDevices", "Rc analysis requires at least one device.");
    case "RUST_ENGINE_READ_CELL_FAILED":
      return localize("analysisFile.error.readCellFailed", "Failed to read analysis cell.");
    case "RUST_ENGINE_READ_CELLS_FAILED":
      return localize("analysisFile.error.readCellsFailed", "Failed to read analysis cells.");
    case "RUST_ENGINE_DISPOSE_FAILED":
      return localize("analysisFile.error.disposeFailed", "Failed to release analysis file.");
  }

  return localize("analysisFile.error.engineFailed", "Analysis engine failed.");
};

const localizeAnalysisFileResponse = <T>(response: T): T => {
  if (
    response &&
    typeof response === "object" &&
    !Array.isArray(response) &&
    (response as { ok?: unknown }).ok === false
  ) {
    const record = response as Record<string, unknown>;
    return {
      ...record,
      message: getAnalysisFileErrorMessage(record.code),
    } as T;
  }

  return response;
};

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
    throw new Error(`${getServiceUnavailableMessage()} (${String(key)})`);
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
    throw new Error(getServiceUnavailableMessage());
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
      return getBridgeMethod(bridge, "analyzeAnalysisFileRcWithRust")(payload)
        .then(localizeAnalysisFileResponse);
    }

    return invoke<AnalysisFileRcAnalysisResult>(workbenchIpcChannels.analysisRustEngineAnalyzeRc, payload)
      .then(localizeAnalysisFileResponse);
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
      return getBridgeMethod(bridge, "disposeAnalysisFileWithRust")(payload)
        .then(localizeAnalysisFileResponse);
    }

    return invoke(workbenchIpcChannels.analysisRustEngineDispose, payload)
      .then(localizeAnalysisFileResponse);
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
      return getBridgeMethod(bridge, "getAnalysisFilePreviewMetaWithRust")(payload)
        .then(localizeAnalysisFileResponse);
    }

    return invoke<AnalysisFileResultPayload>(workbenchIpcChannels.analysisRustEnginePreviewMeta, payload)
      .then(localizeAnalysisFileResponse);
  }

  public getPreviewRows(payload: unknown): Promise<AnalysisFileResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("getAnalysisFilePreviewRowsWithRust")) {
      return getBridgeMethod(bridge, "getAnalysisFilePreviewRowsWithRust")(payload)
        .then(localizeAnalysisFileResponse);
    }

    return invoke<AnalysisFileResultPayload>(workbenchIpcChannels.analysisRustEnginePreviewRows, payload)
      .then(localizeAnalysisFileResponse);
  }

  public inferAutoExtraction(payload: unknown): Promise<unknown> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("inferAnalysisFileAutoExtractionWithRust")) {
      return getBridgeMethod(bridge, "inferAnalysisFileAutoExtractionWithRust")(payload)
        .then(localizeAnalysisFileResponse);
    }

    return invoke(workbenchIpcChannels.analysisRustEngineInferAutoExtraction, payload)
      .then(localizeAnalysisFileResponse);
  }

  public openFile(payload: unknown): Promise<AnalysisFileResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("openAnalysisFileWithRust")) {
      return getBridgeMethod(bridge, "openAnalysisFileWithRust")(payload)
        .then(localizeAnalysisFileResponse);
    }

    return invoke<AnalysisFileResultPayload>(workbenchIpcChannels.analysisRustEngineOpen, payload)
      .then(localizeAnalysisFileResponse);
  }

  public prepareFile(payload: { fileName: string; path: string }): Promise<AnalysisFilePreparedFile> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("prepareImportFileWithRust")) {
      return getBridgeMethod(bridge, "prepareImportFileWithRust")(payload)
        .then(localizeAnalysisFileResponse);
    }

    return invoke<AnalysisFilePreparedFile>(workbenchIpcChannels.importPrepareRust, payload)
      .then(localizeAnalysisFileResponse);
  }

  public processFile(payload: unknown): Promise<AnalysisFileResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("processAnalysisFileWithRust")) {
      return getBridgeMethod(bridge, "processAnalysisFileWithRust")(payload)
        .then(localizeAnalysisFileResponse);
    }

    return invoke<AnalysisFileResultPayload>(workbenchIpcChannels.analysisRustEngineProcessFile, payload)
      .then(localizeAnalysisFileResponse);
  }

  public readCell(payload: unknown): Promise<unknown> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("readAnalysisFileCellWithRust")) {
      return getBridgeMethod(bridge, "readAnalysisFileCellWithRust")(payload)
        .then(localizeAnalysisFileResponse);
    }

    return invoke(workbenchIpcChannels.analysisRustEngineReadCell, payload)
      .then(localizeAnalysisFileResponse);
  }

  public readCells(payload: unknown): Promise<AnalysisFileResultPayload> {
    const bridge = getBridge();
    if (bridge && hasBridgeMethod("readAnalysisFileCellsWithRust")) {
      return getBridgeMethod(bridge, "readAnalysisFileCellsWithRust")(payload)
        .then(localizeAnalysisFileResponse);
    }

    return invoke<AnalysisFileResultPayload>(workbenchIpcChannels.analysisRustEngineReadCells, payload)
      .then(localizeAnalysisFileResponse);
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
