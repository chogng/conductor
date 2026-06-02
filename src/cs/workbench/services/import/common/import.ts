import type { ImportedCurveAssessment } from "src/cs/workbench/contrib/import/common/importFileUtils";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const IImportService = createDecorator<IImportService>("importService");
export const ImportLifecycleContributionId = "workbench.contrib.importLifecycle";

export type ImportPreparedFile = {
  assessment: ImportedCurveAssessment;
  csvText?: string;
  durationMs?: number;
  manifest?: unknown;
  normalizedCsvPath?: string | null;
  normalizedSizeBytes?: number;
  ok?: boolean;
  source?: string;
  sourceName?: string;
  sourcePath?: string;
  sourceSizeBytes?: number;
  code?: string;
  message?: string;
};

export type ImportConvertedCsv = {
  csvText?: string;
  ok?: boolean;
  sizeBytes?: number;
};

export type ImportDemoFiles = {
  demoDir?: string;
  files?: Array<{
    fileName?: string;
    lastModified?: number;
    path?: string;
    size?: number;
    text?: string;
  }>;
};

export type ImportRcAnalysisResult = {
  message?: string;
  ok?: boolean;
  result?: unknown;
  [key: string]: unknown;
};

export type ImportResultPayload = {
  message?: string;
  ok?: boolean;
  result?: unknown;
  [key: string]: unknown;
};

export interface IImportService {
  readonly _serviceBrand: undefined;

  analyzeRc(payload: unknown): Promise<ImportRcAnalysisResult>;
  canAnalyzeRc(): boolean;
  canDisposeFile(): boolean;
  canGetDemoFiles(): boolean;
  canGetPreviewRows(): boolean;
  canOpenFile(): boolean;
  canPrepareFile(): boolean;
  canProcessFile(): boolean;
  canReadConvertedCsv(): boolean;
  canReadCells(): boolean;
  disposeFile(payload: unknown): Promise<unknown>;
  getDemoFiles(): Promise<ImportDemoFiles>;
  getPreviewMeta(payload: unknown): Promise<ImportResultPayload>;
  getPreviewRows(payload: unknown): Promise<ImportResultPayload>;
  inferAutoExtraction(payload: unknown): Promise<unknown>;
  openFile(payload: unknown): Promise<ImportResultPayload>;
  prepareFile(payload: { fileName: string; path: string }): Promise<ImportPreparedFile>;
  processFile(payload: unknown): Promise<ImportResultPayload>;
  readCell(payload: unknown): Promise<unknown>;
  readCells(payload: unknown): Promise<ImportResultPayload>;
  readConvertedCsv(payload: { path: string }): Promise<ImportConvertedCsv>;
}
