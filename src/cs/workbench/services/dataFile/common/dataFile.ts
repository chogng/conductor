import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { FileAssessment } from "../../../common/fileAssessment.ts";

export const IDataFileService = createDecorator<IDataFileService>("dataFileService");
export const DataFileLifecycleContributionId = "workbench.contrib.dataFileLifecycle";

export type DataFileAssessment = {
  curveType: string | null;
  curveTypeConfidence: FileAssessment["confidence"];
  curveTypeNeedsTemplate: boolean;
  curveTypeReasons: string[];
  xAxisRole: FileAssessment["xAxisRole"];
  xAxisRoleSource: FileAssessment["xAxisRoleSource"];
};

export const toDataFileAssessment = (
  assessment: FileAssessment,
): DataFileAssessment => ({
  curveType: assessment.curveTypeLabel ?? null,
  curveTypeConfidence: assessment.confidence,
  curveTypeNeedsTemplate: assessment.needsTemplate,
  curveTypeReasons: assessment.reasons,
  xAxisRole: assessment.xAxisRole,
  xAxisRoleSource: assessment.xAxisRoleSource,
});

export type DataFilePreparedFile = {
  assessment: DataFileAssessment;
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

export type DataFileConvertedCsv = {
  csvText?: string;
  ok?: boolean;
  sizeBytes?: number;
};

export type DataFileDemoFiles = {
  demoDir?: string;
  files?: Array<{
    fileName?: string;
    lastModified?: number;
    path?: string;
    size?: number;
    text?: string;
  }>;
};

export type DataFileRcAnalysisResult = {
  message?: string;
  ok?: boolean;
  result?: unknown;
  [key: string]: unknown;
};

export type DataFileResultPayload = {
  message?: string;
  ok?: boolean;
  result?: unknown;
  [key: string]: unknown;
};

export interface IDataFileService {
  readonly _serviceBrand: undefined;

  analyzeRc(payload: unknown): Promise<DataFileRcAnalysisResult>;
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
  getDemoFiles(): Promise<DataFileDemoFiles>;
  getPreviewMeta(payload: unknown): Promise<DataFileResultPayload>;
  getPreviewRows(payload: unknown): Promise<DataFileResultPayload>;
  inferAutoExtraction(payload: unknown): Promise<unknown>;
  openFile(payload: unknown): Promise<DataFileResultPayload>;
  prepareFile(payload: { fileName: string; path: string }): Promise<DataFilePreparedFile>;
  processFile(payload: unknown): Promise<DataFileResultPayload>;
  readCell(payload: unknown): Promise<unknown>;
  readCells(payload: unknown): Promise<DataFileResultPayload>;
  readConvertedCsv(payload: { path: string }): Promise<DataFileConvertedCsv>;
}
