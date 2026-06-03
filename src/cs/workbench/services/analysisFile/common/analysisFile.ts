import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { FileAssessment } from "../../../common/fileAssessment.ts";

export const IAnalysisFileService = createDecorator<IAnalysisFileService>("analysisFileService");
export const AnalysisFileLifecycleContributionId = "workbench.contrib.analysisFileLifecycle";

export type AnalysisFileAssessment = {
  curveType: string | null;
  curveTypeConfidence: FileAssessment["confidence"];
  curveTypeNeedsTemplate: boolean;
  curveTypeReasons: string[];
  xAxisRole: FileAssessment["xAxisRole"];
  xAxisRoleSource: FileAssessment["xAxisRoleSource"];
};

export const toAnalysisFileAssessment = (
  assessment: FileAssessment,
): AnalysisFileAssessment => ({
  curveType: assessment.curveTypeLabel ?? null,
  curveTypeConfidence: assessment.confidence,
  curveTypeNeedsTemplate: assessment.needsTemplate,
  curveTypeReasons: assessment.reasons,
  xAxisRole: assessment.xAxisRole,
  xAxisRoleSource: assessment.xAxisRoleSource,
});

export type AnalysisFilePreparedFile = {
  assessment: AnalysisFileAssessment;
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

export type AnalysisFileConvertedCsv = {
  csvText?: string;
  ok?: boolean;
  sizeBytes?: number;
};

export type AnalysisFileDemoFiles = {
  demoDir?: string;
  files?: Array<{
    fileName?: string;
    lastModified?: number;
    path?: string;
    size?: number;
    text?: string;
  }>;
};

export type AnalysisFileRcAnalysisResult = {
  message?: string;
  ok?: boolean;
  result?: unknown;
  [key: string]: unknown;
};

export type AnalysisFileResultPayload = {
  message?: string;
  ok?: boolean;
  result?: unknown;
  [key: string]: unknown;
};

export interface IAnalysisFileService {
  readonly _serviceBrand: undefined;

  analyzeRc(payload: unknown): Promise<AnalysisFileRcAnalysisResult>;
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
  getDemoFiles(): Promise<AnalysisFileDemoFiles>;
  getPreviewMeta(payload: unknown): Promise<AnalysisFileResultPayload>;
  getPreviewRows(payload: unknown): Promise<AnalysisFileResultPayload>;
  inferAutoExtraction(payload: unknown): Promise<unknown>;
  openFile(payload: unknown): Promise<AnalysisFileResultPayload>;
  prepareFile(payload: { fileName: string; path: string }): Promise<AnalysisFilePreparedFile>;
  processFile(payload: unknown): Promise<AnalysisFileResultPayload>;
  readCell(payload: unknown): Promise<unknown>;
  readCells(payload: unknown): Promise<AnalysisFileResultPayload>;
  readConvertedCsv(payload: { path: string }): Promise<AnalysisFileConvertedCsv>;
}
