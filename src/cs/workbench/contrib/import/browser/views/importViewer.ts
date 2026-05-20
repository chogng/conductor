import { lxClose, lxFileText } from "cogicon";
import Toast from "src/cs/base/browser/ui/toast/toast";
import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import { ListView, type ListViewOptions } from "src/cs/base/browser/ui/list/listView";
import { normalizeCogIconSvgMarkup } from "src/cs/base/browser/ui/CogIcon/cogicon";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import { cx } from "src/utils/cx";
import { DATA_IMPORT_ACCEPT } from "src/cs/workbench/contrib/import/common/constants";
import type { ImporterFileEntry } from "src/cs/workbench/contrib/import/common/types";
import { toDomIdToken } from "src/cs/workbench/contrib/import/common/utils";
import { createImportEmptyView } from "src/cs/workbench/contrib/import/browser/views/emptyView";

export type ImportViewerProps = {
  readonly effectiveSelectedFileId?: string | null;
  readonly error?: string | null;
  readonly files: ImporterFileEntry[];
  readonly isDragging: boolean;
  readonly onClearError: () => void;
  readonly onDraggingChange: (isDragging: boolean) => void;
  readonly onDropFiles: (dataTransfer: DataTransfer | null) => void | Promise<void>;
  readonly onListScroll: (event: Event) => void;
  readonly onRemoveFile: (fileId: string | null) => void;
  readonly onSelectFile: (fileId: string | null) => void;
  readonly onSelectFiles: (files: File[]) => void;
  readonly t: TranslateFn;
};

const getImportViewerFileName = (fileEntry: ImporterFileEntry): string =>
  fileEntry?.file &&
  typeof fileEntry.file === "object" &&
  "name" in fileEntry.file
    ? String(fileEntry.file.name ?? "")
    : String(fileEntry?.fileName ?? "");

const appendIcon = (
  container: HTMLElement,
  icon: () => string,
  size = 16,
) => {
  const iconSpan = document.createElement("span");
  iconSpan.className = "ui-cogicon";
  iconSpan.style.width = `${size}px`;
  iconSpan.style.height = `${size}px`;
  iconSpan.innerHTML = normalizeCogIconSvgMarkup(icon);
  container.appendChild(iconSpan);
};

const renderImportViewerFileItem = (
  fileEntry: ImporterFileEntry,
  isSelected: boolean,
  onRemove: (fileId: string | null) => void,
  container: HTMLElement,
) => {
  const fileName = getImportViewerFileName(fileEntry);
  const needsReview =
    fileEntry?.curveTypeNeedsTemplate === true ||
    fileEntry?.curveTypeConfidence === "low";
  const autoSummary = fileEntry?.curveType
    ? `Auto: ${String(fileEntry.curveType).trim()}${
        fileEntry?.curveTypeConfidence
          ? ` (${String(fileEntry.curveTypeConfidence).trim()})`
          : ""
      }`
    : "";

  container.replaceChildren();
  container.className = cx("import-viewer-file-item", "group", isSelected && "selected");
  container.setAttribute("aria-label", "csv-file-item");
  container.title = fileName;
  container.dataset.selected = isSelected ? "true" : undefined;

  if (fileEntry?.itemKey) {
    container.id = `csv-file-item-${toDomIdToken(fileEntry.itemKey)}`;
    container.dataset.itemKey = fileEntry.itemKey;
  } else {
    container.removeAttribute("id");
    delete container.dataset.itemKey;
  }

  const content = document.createElement("div");
  content.className = "import-viewer-file-content";

  const icon = document.createElement("div");
  icon.className = "import-viewer-file-icon";
  appendIcon(icon, lxFileText);

  const text = document.createElement("div");
  text.className = "import-viewer-file-text";

  const name = document.createElement("span");
  name.className = "import-viewer-file-name";
  name.textContent = fileName;
  text.appendChild(name);

  if (autoSummary) {
    const meta = document.createElement("span");
    meta.className = cx("import-viewer-file-meta", needsReview && "warning");
    meta.textContent = autoSummary;
    text.appendChild(meta);
  }

  content.append(icon, text);

  const actions = document.createElement("div");
  actions.className = "import-viewer-file-actions";

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "import-viewer-file-remove";
  removeButton.setAttribute("aria-label", "Remove CSV file");

  if (fileEntry?.itemKey) {
    removeButton.id = `csv-file-remove-${toDomIdToken(fileEntry.itemKey)}`;
    removeButton.dataset.itemKey = fileEntry.itemKey;
  }

  removeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    onRemove(fileEntry.fileId ?? null);
  });
  appendIcon(removeButton, lxClose);

  actions.appendChild(removeButton);
  container.append(content, actions);
};

export class ImportViewerView implements IDisposable {
  private readonly host: HTMLElement;
  private readonly root: HTMLDivElement;
  private readonly fileInput: HTMLInputElement;
  private readonly viewport: HTMLDivElement;
  private readonly emptyRoot: HTMLDivElement;
  private readonly filledRoot: HTMLDivElement;
  private readonly listHost: HTMLDivElement;
  private readonly listView: ListView<ImporterFileEntry>;
  private readonly toast: Toast;
  private readonly listeners: Array<() => void> = [];
  private props: ImportViewerProps;
  private disposed = false;

  constructor(host: HTMLElement, props: ImportViewerProps) {
    this.host = host;
    this.props = props;

    this.root = document.createElement("div");
    this.root.id = "analysis-csv-dropzone";
    this.root.className = "import-viewer-dropzone idle";
    this.root.setAttribute("data-state", "empty");

    this.fileInput = document.createElement("input");
    this.fileInput.id = "analysis-csv-file-input";
    this.fileInput.type = "file";
    this.fileInput.multiple = true;
    this.fileInput.accept = DATA_IMPORT_ACCEPT;
    this.fileInput.className = "hidden";

    this.viewport = document.createElement("div");
    this.viewport.className = "import-viewer-dropzone-viewport";

    this.emptyRoot = document.createElement("div");
    this.emptyRoot.className = "import-viewer-empty-root";
    this.filledRoot = document.createElement("div");
    this.filledRoot.id = "analysis-import-scroll";
    this.filledRoot.dataset.slot = "filled";
    this.filledRoot.className = "import-viewer-filled";

    this.listHost = document.createElement("div");
    this.listHost.className = "import-viewer-list-host";
    this.filledRoot.appendChild(this.listHost);

    this.listView = new ListView<ImporterFileEntry>(
      this.listHost,
      this.createListOptions(),
    );
    this.toast = new Toast();

    this.viewport.append(this.emptyRoot, this.filledRoot);
    this.root.append(this.fileInput, this.viewport);
    this.host.appendChild(this.root);

    this.registerEvents();
    this.render();
  }

  getListHandle(): ListHandle {
    return this.listView;
  }

  openFileDialog(): void {
    this.fileInput.click();
  }

  setProps(nextProps: ImportViewerProps): void {
    this.props = nextProps;
    this.render();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.toast.dispose();
    this.listView.dispose();
    for (const dispose of this.listeners) {
      dispose();
    }
    this.listeners.length = 0;
    this.root.remove();
  }

  private createListOptions(): ListViewOptions<ImporterFileEntry> {
    return {
      className: "import-viewer-file-list",
      getKey: (fileEntry, index) =>
        fileEntry.fileId ?? fileEntry.itemKey ?? String(index),
      gap: 12,
      items: this.props.files,
      minVirtualCount: 200,
      onScroll: (event) => this.props.onListScroll(event),
      onSelect: (fileEntry) => this.props.onSelectFile(fileEntry.fileId ?? null),
      renderItem: (fileEntry, _index, _state, container) => {
        renderImportViewerFileItem(
          fileEntry,
          this.props.effectiveSelectedFileId === fileEntry.fileId,
          this.props.onRemoveFile,
          container,
        );
      },
      disposeItem: (_fileEntry, _index, container) => {
        container.replaceChildren();
      },
      rowHeight: 64,
      selectedKey: this.props.effectiveSelectedFileId ?? null,
      viewportClassName: "import-viewer-file-list-viewport",
    };
  }

  private registerEvents(): void {
    this.fileInput.addEventListener("change", this.handleFileInputChange);
    this.root.addEventListener("click", this.handleRootClick);
    this.viewport.addEventListener("dragover", this.handleDragOver);
    this.viewport.addEventListener("dragleave", this.handleDragLeave);
    this.viewport.addEventListener("drop", this.handleDrop);

    this.listeners.push(() =>
      this.fileInput.removeEventListener("change", this.handleFileInputChange),
    );
    this.listeners.push(() =>
      this.root.removeEventListener("click", this.handleRootClick),
    );
    this.listeners.push(() =>
      this.viewport.removeEventListener("dragover", this.handleDragOver),
    );
    this.listeners.push(() =>
      this.viewport.removeEventListener("dragleave", this.handleDragLeave),
    );
    this.listeners.push(() =>
      this.viewport.removeEventListener("drop", this.handleDrop),
    );
  }

  private readonly handleFileInputChange = (): void => {
    const files = Array.from(this.fileInput.files ?? []);
    this.props.onSelectFiles(files);
    this.fileInput.value = "";
  };

  private readonly handleRootClick = (event: MouseEvent): void => {
    if (this.props.files.length > 0) {
      return;
    }

    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest("button, input, a, [role='button']")
    ) {
      return;
    }

    this.openFileDialog();
  };

  private readonly handleDragOver = (event: DragEvent): void => {
    event.preventDefault();
    this.props.onDraggingChange(true);
  };

  private readonly handleDragLeave = (event: DragEvent): void => {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && this.viewport.contains(relatedTarget)) {
      return;
    }

    this.props.onDraggingChange(false);
  };

  private readonly handleDrop = (event: DragEvent): void => {
    event.preventDefault();
    this.props.onDraggingChange(false);
    void this.props.onDropFiles(event.dataTransfer);
  };

  private render(): void {
    if (this.disposed) {
      return;
    }

    const { error, files, isDragging, t } = this.props;
    const hasFiles = files.length > 0;

    this.root.setAttribute("aria-label", t("da_import_section"));
    this.root.dataset.state = hasFiles ? "filled" : "empty";
    this.root.classList.toggle("dragging", isDragging);
    this.root.classList.toggle("idle", !isDragging);
    this.fileInput.setAttribute("aria-label", t("da_import_csv"));

    this.emptyRoot.replaceChildren(createImportEmptyView(t));
    this.emptyRoot.hidden = hasFiles;
    this.filledRoot.hidden = !hasFiles;

    this.listView.setProps(this.createListOptions());

    if (!error) {
      this.toast.hide();
      return;
    }

    this.toast.show({
      dataUi: "analysis-import-error-toast",
      message: error,
      onClose: this.props.onClearError,
      position: "fixed",
      type: "error",
    });
  }
}
