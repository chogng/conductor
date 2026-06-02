export type RawDataEntry = {
  file?: unknown;
  fileId?: string;
  fileName?: string;
  normalizedCsvPath?: string | null;
  relativePath?: string | null;
  sourcePath?: string | null;
  curveType?: string | null;
  curveTypeConfidence?: "high" | "medium" | "low";
  curveTypeNeedsTemplate?: boolean;
  curveTypeReasons?: string[];
  xAxisRole?: "vg" | "vd" | null;
  xAxisRoleSource?:
    | "filename"
    | "title"
    | "label"
    | "metadata"
    | "shape"
    | null;
  [key: string]: unknown;
};

export type ProcessedSeries = {
  id?: string;
  name?: string;
  groupIndex?: number;
  yCol?: number;
  y?: number[];
  [key: string]: unknown;
};

export type ProcessedDomain = {
  x?: [number, number];
  y?: [number, number];
};

export type ProcessedEntry = {
  fileId?: string;
  fileName?: string;
  curveFilterKey?: string | null;
  curveFilterField?: string | null;
  curveType?: string;
  curveTypeConfidence?: "high" | "medium" | "low";
  curveTypeNeedsTemplate?: boolean;
  curveTypeReasons?: string[];
  xAxisRole?: "vg" | "vd" | null;
  xAxisRoleSource?:
    | "filename"
    | "title"
    | "label"
    | "metadata"
    | "shape"
    | null;
  supportsSs?: boolean;
  xUnit?: string;
  x?: {
    sampledPoints?: number | null;
    [key: string]: unknown;
  };
  xGroups?: number[][];
  series?: ProcessedSeries[];
  domain?: ProcessedDomain;
  [key: string]: unknown;
};

export type PreviewFile = {
  fileId: string;
  fileName: string;
  sheetId?: string | null;
  sheetName?: string | null;
  sourceKey?: string;
  rowCount: number;
  columnCount: number;
  maxCellLengths: number[];
};

export type PreviewFileLike = Partial<PreviewFile> & Record<string, unknown>;

export type PreviewRowsRequest = {
  fileId: string;
  sheetId?: string | null;
  sourceKey?: string;
  startRow: number;
  endRow: number;
  reject: (error: unknown) => void;
  resolve: (rows: unknown[][]) => void;
};

export type ProcessingStatus = {
  state: "idle" | "processing" | "done" | "error";
  processed: number;
  total: number;
};
