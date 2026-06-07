import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { SessionFile } from "src/cs/workbench/contrib/session/common/sessionTypes";
import type { MutableState } from "src/cs/workbench/services/session/common/session";
import type { RustPreviewCellRequest } from "src/cs/workbench/contrib/table/browser/rows/rustCells";
import type { IAnalysisFileService } from "src/cs/workbench/services/analysisFile/common/analysisFile";

type SetStateAction<T> = T | ((previous: T) => T);
type Dispatch<T> = (value: T) => void;

export type TableCell = {
  readonly fileId?: string | null;
  readonly sheetId?: string | null;
  readonly rowIndex: number;
  readonly colIndex: number;
};

export type TableRange = {
  readonly fileId?: string | null;
  readonly sheetId?: string | null;
  readonly startRow: number;
  readonly endRow: number;
  readonly startCol: number;
  readonly endCol: number;
};

export type TableSelection = {
  readonly activeCell?: TableCell | null;
  readonly selectedColumns?: readonly number[];
  readonly ranges?: readonly TableRange[];
};

export type TableHighlight = {
  readonly columns?: readonly number[];
  readonly ranges?: readonly TableRange[];
};

export type TableSource = {
  readonly fileId: string;
  readonly sheetId?: string | null;
};

export type TableFile = {
  fileId: string;
  fileName: string;
  sheetId?: string | null;
  sheetName?: string | null;
  sourceKey?: string;
  rowCount: number;
  columnCount: number;
  maxCellLengths: number[];
};

export type TableLoadState = {
  state: "idle" | "loading" | "ready";
  message: string;
};

export type TableRowsRequest = {
  fileId: string;
  sheetId?: string | null;
  sourceKey?: string;
  startRow: number;
  endRow: number;
  reject: (error: unknown) => void;
  resolve: (rows: unknown[][]) => void;
};

export type TableState = {
  readonly selectedFileId: string | null;
  readonly selectedSheetId?: string | null;
  readonly source?: TableSource | null;
  readonly sourceKey?: string | null;
  readonly fileName: string;
  readonly file: TableFile | null;
  readonly loadState: TableLoadState;
  readonly dimensions?: string;
};

export type TableInput = {
  analysisFileService?: IAnalysisFileService;
  sourceFiles?: SessionFile[];
  selectedFileId?: string | null;
  selectedSheetId?: string | null;
  setSelectedFileId?: Dispatch<SetStateAction<string | null>>;
  setSelectedSheetId?: Dispatch<SetStateAction<string | null>>;
  file?: TableFile | null;
  loadState?: TableLoadState;
  setFile?: Dispatch<SetStateAction<TableFile | null>>;
  setLoadState?: Dispatch<SetStateAction<TableLoadState>>;
  workerRef?: MutableState<Worker | null>;
  requestIdRef?: MutableState<number>;
  rowsRequestIdRef?: MutableState<number>;
  rowsRequestsRef?: MutableState<Map<number, TableRowsRequest>>;
  rowsCacheByFileIdRef?: MutableState<Map<string, Map<number, unknown[]>>>;
  loadedChunksByFileIdRef?: MutableState<Map<string, Set<number>>>;
  rowsCacheRef?: MutableState<Map<number, unknown[]>>;
  loadedChunksRef?: MutableState<Set<number>>;
  cacheFileIdRef?: MutableState<string | null>;
  cacheFileLruRef?: MutableState<Set<string>>;
};

export type TableModel = {
  cancelPendingRowRequests: () => void;
  clearState: (options?: { clearSelection?: boolean }) => void;
  disposeFileCache: (fileId: string) => void;
  ensureCells: (
    fileId: string,
    cells: RustPreviewCellRequest[],
  ) => Promise<void>;
  ensureRows: (
    fileId: string,
    startRow: number,
    endRow: number,
  ) => Promise<void>;
  getRow: (rowIndex: number) => unknown[] | null;
  getRowsVersion: () => number;
  getState: () => TableState;
  getRevealCell: () => TableCell | null;
  getSelection: () => TableSelection;
  hasSourceFile: (fileId: string | null | undefined) => boolean;
  invalidateRequests: () => void;
  onDidChangeSelection: (callback: (selection: TableSelection) => void) => () => void;
  revealCell: (cell: TableCell | null) => void;
  resetWorker: () => void;
  clearHighlight: () => void;
  getHighlight: () => TableHighlight;
  highlightColumns: (columnIndexes: readonly number[]) => void;
  setSelection: (selection: TableSelection | null) => void;
  subscribeRowsVersion: (callback: () => void) => () => void;
};

export const ITableService = createDecorator<ITableService>("tableService");

export interface ITableService {
  readonly _serviceBrand: undefined;
  update(input: TableInput): TableModel;
}

export const toTableSourceKey = (source: TableSource): string => {
  const fileId = encodeURIComponent(source.fileId);
  const sheetId = typeof source.sheetId === "string" && source.sheetId
    ? encodeURIComponent(source.sheetId)
    : "";
  return sheetId ? `${fileId}::${sheetId}` : fileId;
};
