export type RawDataEntry = {
  file?: unknown;
  fileId?: string;
  fileName?: string;
  [key: string]: unknown;
};

export type ProcessedEntry = {
  fileId?: string;
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
