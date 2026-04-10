export type RawDataEntry = {
  file?: unknown;
  fileId?: string;
  fileName?: string;
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
  xAxisRole?: "vg" | "vd" | null;
  xAxisRoleSource?: "filename" | "title" | "label" | null;
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
  rowCount: number;
  columnCount: number;
  maxCellLengths: number[];
};

export type PreviewFileLike = Partial<PreviewFile> & Record<string, unknown>;

export type PreviewRowsRequest = {
  fileId: string;
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

export type Feedback = {
  message: string;
  type: "idle" | "success" | "error";
};

export type ToastType = "success" | "error" | "warning" | "info";

export type ToastState = {
  isVisible: boolean;
  message: string;
  type: ToastType;
};
