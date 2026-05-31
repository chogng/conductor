import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IImportService,
  type IImportService as IImportServiceType,
  type ImportConvertedCsv,
  type ImportDemoFiles,
  type ImportOriginCsvExportResult,
  type ImportOriginZipSaveResult,
  type ImportPreparedFile,
  type ImportRcAnalysisResult,
  type ImportResultPayload,
} from "src/cs/workbench/services/import/common/import";

type ImportBridge = {
  analyzeDeviceAnalysisRcWithRust?: (payload: unknown) => Promise<ImportRcAnalysisResult>;
  disposeDeviceAnalysisFileWithRust?: (payload: unknown) => Promise<unknown>;
  exportDeviceAnalysisOriginCsvWithRust?: (payload: unknown) => Promise<ImportOriginCsvExportResult>;
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
  saveDeviceAnalysisOriginZip?: (payload: unknown) => Promise<ImportOriginZipSaveResult>;
};

type WebUtilsBridge = {
  getPathForFile?: (file: File) => string;
};

declare global {
  interface Window {
    desktopImport?: ImportBridge;
  }
}

const IMPORT_SERVICE_UNAVAILABLE = "Import desktop bridge unavailable.";

function getBridge(): ImportBridge {
  const bridge = globalThis.window?.desktopImport;
  if (!bridge || typeof bridge !== "object") {
    throw new Error(IMPORT_SERVICE_UNAVAILABLE);
  }

  return bridge;
}

function hasBridgeMethod<K extends keyof ImportBridge>(key: K): boolean {
  return typeof globalThis.window?.desktopImport?.[key] === "function";
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

export class ImportService extends Disposable implements IImportServiceType {
  public declare readonly _serviceBrand: undefined;

  public analyzeRc(payload: unknown): Promise<ImportRcAnalysisResult> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "analyzeDeviceAnalysisRcWithRust")(payload);
  }

  public canAnalyzeRc(): boolean {
    return hasBridgeMethod("analyzeDeviceAnalysisRcWithRust");
  }

  public canDisposeFile(): boolean {
    return hasBridgeMethod("disposeDeviceAnalysisFileWithRust");
  }

  public canExportOriginCsv(): boolean {
    return hasBridgeMethod("exportDeviceAnalysisOriginCsvWithRust");
  }

  public canGetDemoFiles(): boolean {
    return hasBridgeMethod("getDeviceAnalysisDemoFiles");
  }

  public canGetPreviewRows(): boolean {
    return hasBridgeMethod("getDeviceAnalysisPreviewRowsWithRust");
  }

  public canOpenFile(): boolean {
    return hasBridgeMethod("openDeviceAnalysisFileWithRust");
  }

  public canPrepareFile(): boolean {
    return hasBridgeMethod("prepareImportFileWithRust");
  }

  public canProcessFile(): boolean {
    return hasBridgeMethod("processDeviceAnalysisFileWithRust");
  }

  public canReadConvertedCsv(): boolean {
    return hasBridgeMethod("readConvertedCsvFileWithRust");
  }

  public canReadCells(): boolean {
    return hasBridgeMethod("readDeviceAnalysisCellsWithRust");
  }

  public canSaveOriginZip(): boolean {
    return hasBridgeMethod("saveDeviceAnalysisOriginZip");
  }

  public disposeFile(payload: unknown): Promise<unknown> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "disposeDeviceAnalysisFileWithRust")(payload);
  }

  public exportOriginCsv(payload: unknown): Promise<ImportOriginCsvExportResult> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "exportDeviceAnalysisOriginCsvWithRust")(payload);
  }

  public getDemoFiles(): Promise<ImportDemoFiles> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "getDeviceAnalysisDemoFiles")();
  }

  public getFilePath(file: File): string {
    const webUtils = globalThis.window?.conductor?.webUtils as WebUtilsBridge | undefined;
    return webUtils?.getPathForFile?.(file) ?? "";
  }

  public getPreviewMeta(payload: unknown): Promise<ImportResultPayload> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "getDeviceAnalysisPreviewMetaWithRust")(payload);
  }

  public getPreviewRows(payload: unknown): Promise<ImportResultPayload> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "getDeviceAnalysisPreviewRowsWithRust")(payload);
  }

  public inferAutoExtraction(payload: unknown): Promise<unknown> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "inferDeviceAnalysisAutoExtractionWithRust")(payload);
  }

  public openFile(payload: unknown): Promise<ImportResultPayload> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "openDeviceAnalysisFileWithRust")(payload);
  }

  public prepareFile(payload: { fileName: string; path: string }): Promise<ImportPreparedFile> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "prepareImportFileWithRust")(payload);
  }

  public processFile(payload: unknown): Promise<ImportResultPayload> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "processDeviceAnalysisFileWithRust")(payload);
  }

  public readCell(payload: unknown): Promise<unknown> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "readDeviceAnalysisCellWithRust")(payload);
  }

  public readCells(payload: unknown): Promise<ImportResultPayload> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "readDeviceAnalysisCellsWithRust")(payload);
  }

  public readConvertedCsv(payload: { path: string }): Promise<ImportConvertedCsv> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "readConvertedCsvFileWithRust")(payload);
  }

  public saveOriginZip(payload: unknown): Promise<ImportOriginZipSaveResult> {
    const bridge = getBridge();
    return getBridgeMethod(bridge, "saveDeviceAnalysisOriginZip")(payload);
  }
}

export const importService = new ImportService();

registerSingleton(IImportService, ImportService, InstantiationType.Delayed);
