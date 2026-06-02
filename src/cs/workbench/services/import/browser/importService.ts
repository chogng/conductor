import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IImportService,
  type IImportService as IImportServiceType,
  type ImportConvertedCsv,
  type ImportDemoFiles,
  type ImportPreparedFile,
  type ImportRcAnalysisResult,
  type ImportResultPayload,
} from "src/cs/workbench/services/import/common/import";

const IMPORT_SERVICE_UNAVAILABLE = "Import desktop bridge unavailable.";

function unavailable(): Promise<never> {
  return Promise.reject(new Error(IMPORT_SERVICE_UNAVAILABLE));
}

export class BrowserImportService extends Disposable implements IImportServiceType {
  public declare readonly _serviceBrand: undefined;

  public analyzeRc(_payload: unknown): Promise<ImportRcAnalysisResult> {
    return unavailable();
  }

  public canAnalyzeRc(): boolean {
    return false;
  }

  public canDisposeFile(): boolean {
    return false;
  }

  public canGetDemoFiles(): boolean {
    return false;
  }

  public canGetPreviewRows(): boolean {
    return false;
  }

  public canOpenFile(): boolean {
    return false;
  }

  public canPrepareFile(): boolean {
    return false;
  }

  public canProcessFile(): boolean {
    return false;
  }

  public canReadConvertedCsv(): boolean {
    return false;
  }

  public canReadCells(): boolean {
    return false;
  }

  public disposeFile(_payload: unknown): Promise<unknown> {
    return unavailable();
  }

  public getDemoFiles(): Promise<ImportDemoFiles> {
    return Promise.resolve({ files: [] });
  }

  public getPreviewMeta(_payload: unknown): Promise<ImportResultPayload> {
    return unavailable();
  }

  public getPreviewRows(_payload: unknown): Promise<ImportResultPayload> {
    return unavailable();
  }

  public inferAutoExtraction(_payload: unknown): Promise<unknown> {
    return unavailable();
  }

  public openFile(_payload: unknown): Promise<ImportResultPayload> {
    return unavailable();
  }

  public prepareFile(_payload: { fileName: string; path: string }): Promise<ImportPreparedFile> {
    return unavailable();
  }

  public processFile(_payload: unknown): Promise<ImportResultPayload> {
    return unavailable();
  }

  public readCell(_payload: unknown): Promise<unknown> {
    return unavailable();
  }

  public readCells(_payload: unknown): Promise<ImportResultPayload> {
    return unavailable();
  }

  public readConvertedCsv(_payload: { path: string }): Promise<ImportConvertedCsv> {
    return Promise.resolve({ ok: false });
  }
}

export const importService = new BrowserImportService();

registerSingleton(IImportService, BrowserImportService, InstantiationType.Delayed);
