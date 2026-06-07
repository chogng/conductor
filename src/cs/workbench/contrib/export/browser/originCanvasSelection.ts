const normalizeOriginCanvasIds = (fileIds: unknown[]): string[] =>
  (Array.isArray(fileIds) ? fileIds : [])
    .map((item) => String(item ?? "").trim())
    .filter((item, index, arr) => Boolean(item) && arr.indexOf(item) === index);

type OriginCanvasSelectionOptions = {
  availableFileIds: unknown[];
  initialSelectedFileIds?: unknown[];
};

class OriginCanvasSelection {
  private availableIds: string[];
  private didApplyInitialSelection = false;
  private selectedIds: string[];

  constructor({
    availableFileIds,
    initialSelectedFileIds = [],
  }: OriginCanvasSelectionOptions) {
    this.availableIds = normalizeOriginCanvasIds(availableFileIds);
    const availableSet = new Set(this.availableIds);
    this.selectedIds = normalizeOriginCanvasIds(initialSelectedFileIds)
      .filter((item) => availableSet.has(item));
    this.didApplyInitialSelection = this.selectedIds.length > 0;
  }

  get selectedFileIds(): string[] {
    return [...this.selectedIds];
  }

  get selectedFileIdSet(): Set<string> {
    return new Set(this.selectedIds);
  }

  replaceFileSelection = (fileIds: unknown[]): void => {
    this.didApplyInitialSelection = true;
    this.selectedIds = normalizeOriginCanvasIds(fileIds);
  };

  selectAllFiles = (): void => {
    this.didApplyInitialSelection = true;
    this.selectedIds = [...this.availableIds];
  };

  clearFileSelection = (): void => {
    this.didApplyInitialSelection = true;
    this.selectedIds = [];
  };

  toggleFileSelection = (fileIdRaw: unknown): void => {
    const fileId = String(fileIdRaw ?? "").trim();
    if (!fileId) {
      return;
    }

    this.didApplyInitialSelection = true;
    const current = normalizeOriginCanvasIds(this.selectedIds);
    this.selectedIds = current.includes(fileId)
      ? current.filter((item) => item !== fileId)
      : [...current, fileId];
  };
}

export const createOriginCanvasSelection = (options: OriginCanvasSelectionOptions) => {
  const model = new OriginCanvasSelection(options);
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
