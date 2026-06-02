const normalizeFileIds = (fileIds: unknown[]): string[] =>
  (Array.isArray(fileIds) ? fileIds : [])
    .map((item) => String(item ?? "").trim())
    .filter((item, index, arr) => Boolean(item) && arr.indexOf(item) === index);

type FileSelectionPoolOptions = {
  availableFileIds: unknown[];
  initialSelectedFileIds?: unknown[];
};

export class FileSelectionPool {
  private availableIds: string[];
  private didApplyInitialSelection = false;
  private selectedIds: string[];

  constructor({
    availableFileIds,
    initialSelectedFileIds = [],
  }: FileSelectionPoolOptions) {
    this.availableIds = normalizeFileIds(availableFileIds);
    const availableSet = new Set(this.availableIds);
    this.selectedIds = normalizeFileIds(initialSelectedFileIds)
      .filter((item) => availableSet.has(item));
    this.didApplyInitialSelection = this.selectedIds.length > 0;
  }

  get selectedFileIds(): string[] {
    return [...this.selectedIds];
  }

  get selectedFileIdSet(): Set<string> {
    return new Set(this.selectedIds);
  }

  updateAvailableFiles(fileIds: unknown[], initialSelectedFileIds: unknown[] = []): void {
    this.availableIds = normalizeFileIds(fileIds);
    if (!this.availableIds.length) {
      this.selectedIds = [];
      return;
    }

    const availableSet = new Set(this.availableIds);
    const filtered = normalizeFileIds(this.selectedIds).filter((item) => availableSet.has(item));
    const initial = normalizeFileIds(initialSelectedFileIds).filter((item) => availableSet.has(item));
    this.selectedIds = filtered.length || this.didApplyInitialSelection ? filtered : initial;
    if (initial.length) {
      this.didApplyInitialSelection = true;
    }
  }

  toggleFileSelection = (fileIdRaw: unknown): void => {
    const fileId = String(fileIdRaw ?? "").trim();
    if (!fileId) return;

    this.didApplyInitialSelection = true;
    const current = normalizeFileIds(this.selectedIds);
    this.selectedIds = current.includes(fileId)
      ? current.filter((item) => item !== fileId)
      : [...current, fileId];
  };

  replaceFileSelection = (fileIds: unknown[]): void => {
    this.didApplyInitialSelection = true;
    this.selectedIds = normalizeFileIds(fileIds);
  };

  selectAllFiles = (): void => {
    this.didApplyInitialSelection = true;
    this.selectedIds = [...this.availableIds];
  };

  clearFileSelection = (): void => {
    this.didApplyInitialSelection = true;
    this.selectedIds = [];
  };
}

export const createFileSelectionPool = (options: FileSelectionPoolOptions) => {
  const model = new FileSelectionPool(options);
  return {
    clearFileSelection: model.clearFileSelection,
    replaceFileSelection: model.replaceFileSelection,
    selectAllFiles: model.selectAllFiles,
    get selectedFileIds() {
      return model.selectedFileIds;
    },
    get selectedFileIdSet() {
      return model.selectedFileIdSet;
    },
    toggleFileSelection: model.toggleFileSelection,
  };
};

export const useFileSelectionPool = createFileSelectionPool;
