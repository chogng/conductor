import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IDataFileService,
  type IDataFileService as IDataFileServiceType,
  type DataFileConvertedCsv,
  type DataFileDemoFiles,
  type DataFilePreparedFile,
  type DataFileRcAnalysisResult,
  type DataFileResultPayload,
} from "src/cs/workbench/services/dataFile/common/dataFile";

const DATA_FILE_SERVICE_UNAVAILABLE = "Data file desktop bridge unavailable.";

function unavailable(): Promise<never> {
  return Promise.reject(new Error(DATA_FILE_SERVICE_UNAVAILABLE));
}

export class BrowserDataFileService extends Disposable implements IDataFileServiceType {
  public declare readonly _serviceBrand: undefined;

  public analyzeRc(_payload: unknown): Promise<DataFileRcAnalysisResult> {
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

  public getDemoFiles(): Promise<DataFileDemoFiles> {
    return Promise.resolve({ files: [] });
  }

  public getPreviewMeta(_payload: unknown): Promise<DataFileResultPayload> {
    return unavailable();
  }

  public getPreviewRows(_payload: unknown): Promise<DataFileResultPayload> {
    return unavailable();
  }

  public inferAutoExtraction(_payload: unknown): Promise<unknown> {
    return unavailable();
  }

  public openFile(_payload: unknown): Promise<DataFileResultPayload> {
    return unavailable();
  }

  public prepareFile(_payload: { fileName: string; path: string }): Promise<DataFilePreparedFile> {
    return unavailable();
  }

  public processFile(_payload: unknown): Promise<DataFileResultPayload> {
    return unavailable();
  }

  public readCell(_payload: unknown): Promise<unknown> {
    return unavailable();
  }

  public readCells(_payload: unknown): Promise<DataFileResultPayload> {
    return unavailable();
  }

  public readConvertedCsv(_payload: { path: string }): Promise<DataFileConvertedCsv> {
    return Promise.resolve({ ok: false });
  }
}

export const dataFileService = new BrowserDataFileService();

registerSingleton(IDataFileService, BrowserDataFileService, InstantiationType.Delayed);
