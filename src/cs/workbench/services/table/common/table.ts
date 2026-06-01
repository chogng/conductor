import type { MutableRef } from "src/cs/base/common/ref";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
  PreviewFile,
  PreviewRowsRequest,
  RawDataEntry,
} from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import type { PreviewStatus } from "src/cs/workbench/contrib/session/analysis-session-context";
import type { RustPreviewCellRequest } from "src/cs/workbench/services/table/browser/preview/rustPreviewCells";

type SetStateAction<T> = T | ((previous: T) => T);
type Dispatch<T> = (value: T) => void;

export type TableOptions = {
  rawData?: RawDataEntry[];
  selectedPreviewFileId?: string | null;
  setSelectedPreviewFileId?: Dispatch<SetStateAction<string | null>>;
  previewFile?: PreviewFile | null;
  previewStatus?: PreviewStatus;
  setPreviewFile?: Dispatch<SetStateAction<PreviewFile | null>>;
  setPreviewStatus?: Dispatch<SetStateAction<PreviewStatus>>;
  previewWorkerRef?: MutableRef<Worker | null>;
  previewRequestIdRef?: MutableRef<number>;
  previewRowsRequestIdRef?: MutableRef<number>;
  previewRowsRequestsRef?: MutableRef<Map<number, PreviewRowsRequest>>;
  previewRowsCacheByFileIdRef?: MutableRef<Map<string, Map<number, unknown[]>>>;
  previewLoadedChunksByFileIdRef?: MutableRef<Map<string, Set<number>>>;
  previewRowsCacheRef?: MutableRef<Map<number, unknown[]>>;
  previewLoadedChunksRef?: MutableRef<Set<number>>;
  previewCacheFileIdRef?: MutableRef<string | null>;
  previewCacheFileLruRef?: MutableRef<Set<string>>;
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
  handlePreviewFileSelected: (fileId: unknown) => void;
  invalidatePreviewRequests: () => void;
  rawDataById: Map<string, RawDataEntry>;
  rawDataByIdRef: MutableRef<Map<string, RawDataEntry>>;
  resetPreviewWorker: () => void;
  subscribePreviewRowsVersion: (callback: () => void) => () => void;
};

export const ITableService = createDecorator<ITableService>("tableService");

export interface ITableService {
  readonly _serviceBrand: undefined;
  update(options: TableOptions): TableBindings;
}
