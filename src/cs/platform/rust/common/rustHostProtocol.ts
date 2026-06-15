export type RustProcessConfig = {
  xSegmentationMode?: unknown;
  yCols?: unknown;
};

export type RustHostResultSource = "rust" | "rust-pool";

export type RustHostResponse =
  | {
      ok: true;
      durationMs?: number;
      result?: unknown;
      source: RustHostResultSource;
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

export type CalculateRcRequest = {
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

export interface IRustHostService {
  calculateRc(request: CalculateRcRequest): Promise<RustHostResponse>;
  disposeFile(request: DisposeFileRequest): Promise<RustHostResponse>;
  exportOriginCsv(request: ExportOriginCsvRequest): Promise<RustHostResponse>;
  openFile(request: OpenFileRequest): Promise<RustHostResponse>;
  previewMeta(request: PreviewMetaRequest): Promise<RustHostResponse>;
  previewRows(request: PreviewRowsRequest): Promise<RustHostResponse>;
  processFile(request: ProcessFileRequest): Promise<RustHostResponse>;
  readCell(request: ReadCellRequest): Promise<RustHostResponse>;
  readCells(request: ReadCellsRequest): Promise<RustHostResponse>;
}
