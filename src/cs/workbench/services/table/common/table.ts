import type { TranslateFn } from "src/cs/platform/language/common/language";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
  PreviewFile,
  PreviewRowsRequest,
  RawDataEntry,
} from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import type { MutableState, PreviewStatus } from "src/cs/workbench/contrib/session/analysis-session-context";
import type { RustPreviewCellRequest } from "src/cs/workbench/services/table/browser/preview/rustPreviewCells";

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

export type TableOptions = {
  rawData?: RawDataEntry[];
  selectedPreviewFileId?: string | null;
  setSelectedPreviewFileId?: Dispatch<SetStateAction<string | null>>;
  previewFile?: PreviewFile | null;
  previewStatus?: PreviewStatus;
  setPreviewFile?: Dispatch<SetStateAction<PreviewFile | null>>;
  setPreviewStatus?: Dispatch<SetStateAction<PreviewStatus>>;
  previewWorkerRef?: MutableState<Worker | null>;
  previewRequestIdRef?: MutableState<number>;
  previewRowsRequestIdRef?: MutableState<number>;
  previewRowsRequestsRef?: MutableState<Map<number, PreviewRowsRequest>>;
  previewRowsCacheByFileIdRef?: MutableState<Map<string, Map<number, unknown[]>>>;
  previewLoadedChunksByFileIdRef?: MutableState<Map<string, Set<number>>>;
  previewRowsCacheRef?: MutableState<Map<number, unknown[]>>;
  previewLoadedChunksRef?: MutableState<Set<number>>;
  previewCacheFileIdRef?: MutableState<string | null>;
  previewCacheFileLruRef?: MutableState<Set<string>>;
  t: TranslateFn;
};

export type TableBindings = {
  cancelPendingPreviewRowRequests: () => void;
  clearPreviewState: (options?: { clearSelection?: boolean }) => void;
  disposePreviewFileCache: (fileId: string) => void;
  ensurePreviewCells: (
    fileId: string,
    cells: RustPreviewCellRequest[],
  ) => Promise<void>;
  ensurePreviewRows: (
    fileId: string,
    startRow: number,
    endRow: number,
  ) => Promise<void>;
  getPreviewRow: (rowIndex: number) => unknown[] | null;
  getPreviewRowsVersion: () => number;
  getRevealCell: () => TableCell | null;
  getSelection: () => TableSelection;
  invalidatePreviewRequests: () => void;
  onDidChangeSelection: (callback: (selection: TableSelection) => void) => () => void;
  rawDataById: Map<string, RawDataEntry>;
  rawDataByIdRef: MutableState<Map<string, RawDataEntry>>;
  revealCell: (cell: TableCell | null) => void;
  resetPreviewWorker: () => void;
  clearHighlight: () => void;
  getHighlight: () => TableHighlight;
  highlightColumns: (columnIndexes: readonly number[]) => void;
  setSelection: (selection: TableSelection | null) => void;
  subscribePreviewRowsVersion: (callback: () => void) => () => void;
};

export const ITableService = createDecorator<ITableService>("tableService");

export interface ITableService {
  readonly _serviceBrand: undefined;
  update(options: TableOptions): TableBindings;
}
