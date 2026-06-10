export type RustProcessConfig = {
  xSegmentationMode?: unknown;
  yCols?: unknown;
};

export type RustAnalysisResultSource = "rust" | "rust-pool";

export type RustAnalysisResponse =
  | {
      ok: true;
      durationMs?: number;
      result?: unknown;
      source: RustAnalysisResultSource;
      csvPath?: string;
    }
  | {
      ok: false;
      code: string;
      durationMs?: number;
      message: string;
    };

export type OpenFileRequest = {
  fileId: string;
  fileName: string;
  inputPath: string;
  seedRows: number;
};

export type PreviewRowsRequest = {
  endRow: number;
  fileId: string;
  startRow: number;
};

export type PreviewMetaRequest = {
  fileId: string;
};

export type ReadCellRequest = {
  colIndex: number;
  fileId: string;
  rowIndex: number;
};

export type ReadCellsRequest = {
  cells: Array<{
    colIndex: number;
    rowIndex: number;
  }>;
  fileId: string;
};

export type ProcessFileRequest = {
  auto: boolean;
  config: RustProcessConfig | null;
  curveFilterField: string | null;
  curveFilterKey: string | null;
  fileId: string;
  fileName: string;
  inputPath: string;
  maxPoints: number;
};

export type AnalyzeRcRequest = {
  devices: unknown[];
  options: Record<string, unknown>;
};

export type ExportOriginCsvRequest = {
  columns: unknown[];
  config: RustProcessConfig | null;
  csvName: string;
  fileId: string;
  fileName: string;
  inputPath: string;
  maxPoints?: unknown;
  metricKind: string;
  metricSeries: unknown[];
  sourceFile?: Record<string, unknown>;
  sources?: Array<Record<string, unknown>>;
  xScaleFactor?: unknown;
  yScaleFactor?: unknown;
  yTransform?: unknown;
};

export type DisposeFileRequest = {
  clear: boolean;
  fileId: string;
};

export interface IRustAnalysisService {
  analyzeRc(request: AnalyzeRcRequest): Promise<RustAnalysisResponse>;
  disposeFile(request: DisposeFileRequest): Promise<RustAnalysisResponse>;
  exportOriginCsv(request: ExportOriginCsvRequest): Promise<RustAnalysisResponse>;
  openFile(request: OpenFileRequest): Promise<RustAnalysisResponse>;
  previewMeta(request: PreviewMetaRequest): Promise<RustAnalysisResponse>;
  previewRows(request: PreviewRowsRequest): Promise<RustAnalysisResponse>;
  processFile(request: ProcessFileRequest): Promise<RustAnalysisResponse>;
  readCell(request: ReadCellRequest): Promise<RustAnalysisResponse>;
  readCells(request: ReadCellsRequest): Promise<RustAnalysisResponse>;
}
