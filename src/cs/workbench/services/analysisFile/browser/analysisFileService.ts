import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  IAnalysisFileService,
  type IAnalysisFileService as IAnalysisFileServiceType,
  type AnalysisFileConvertedCsv,
  type AnalysisFileDemoFiles,
  type AnalysisFilePreparedFile,
  type AnalysisFileRcAnalysisResult,
  type AnalysisFileResultPayload,
} from "src/cs/workbench/services/analysisFile/common/analysisFile";

const ANALYSIS_FILE_SERVICE_UNAVAILABLE = "Analysis file desktop bridge unavailable.";

function unavailable(): Promise<never> {
  return Promise.reject(new Error(ANALYSIS_FILE_SERVICE_UNAVAILABLE));
}

export class BrowserAnalysisFileService extends Disposable implements IAnalysisFileServiceType {
  public declare readonly _serviceBrand: undefined;

  public analyzeRc(_payload: unknown): Promise<AnalysisFileRcAnalysisResult> {
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

  public getDemoFiles(): Promise<AnalysisFileDemoFiles> {
    return Promise.resolve({ files: [] });
  }

  public getPreviewMeta(_payload: unknown): Promise<AnalysisFileResultPayload> {
    return unavailable();
  }

  public getPreviewRows(_payload: unknown): Promise<AnalysisFileResultPayload> {
    return unavailable();
  }

  public inferAutoExtraction(_payload: unknown): Promise<unknown> {
    return unavailable();
  }

  public openFile(_payload: unknown): Promise<AnalysisFileResultPayload> {
    return unavailable();
  }

  public prepareFile(_payload: { fileName: string; path: string }): Promise<AnalysisFilePreparedFile> {
    return unavailable();
  }

  public processFile(_payload: unknown): Promise<AnalysisFileResultPayload> {
    return unavailable();
  }

  public readCell(_payload: unknown): Promise<unknown> {
    return unavailable();
  }

  public readCells(_payload: unknown): Promise<AnalysisFileResultPayload> {
    return unavailable();
  }

  public readConvertedCsv(_payload: { path: string }): Promise<AnalysisFileConvertedCsv> {
    return Promise.resolve({ ok: false });
  }
}

registerSingleton(IAnalysisFileService, BrowserAnalysisFileService, InstantiationType.Delayed);
