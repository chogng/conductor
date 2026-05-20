import type {
  ChangeEvent,
  DragEvent,
  MouseEvent,
  MutableRefObject,
  RefObject,
} from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef } from "react";
import { lxClose, lxFileText } from "cogicon";
import ScrollArea from "src/cs/base/browser/ui/scrollArea/scrollArea";
import { normalizeCogIconSvgMarkup } from "src/cs/base/browser/ui/CogIcon/cogicon";
import Toast from "src/cs/base/browser/ui/toast/toast";
import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import { ListView, type ListViewOptions } from "src/cs/base/browser/ui/list/listView";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import { cx } from "src/utils/cx";
import { DATA_IMPORT_ACCEPT } from "src/cs/workbench/contrib/import/common/constants";
import type { ImporterFileEntry } from "src/cs/workbench/contrib/import/common/types";
import { toDomIdToken } from "src/cs/workbench/contrib/import/common/utils";
import ImportEmptyView from "src/cs/workbench/contrib/import/browser/views/emptyView";

export type ImportViewerProps = {
  readonly effectiveSelectedFileId?: string | null;
  readonly error?: string | null;
  readonly fileInputRef: RefObject<HTMLInputElement | null>;
  readonly files: ImporterFileEntry[];
  readonly isDragging: boolean;
  readonly listRef: RefObject<ListHandle | null>;
  readonly onClearError: () => void;
  readonly onDragLeave: () => void;
  readonly onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  readonly onDrop: (event: DragEvent<HTMLDivElement>) => void;
  readonly onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onListScroll: (event: Event) => void;
  readonly onRemoveFile: (fileId: string | null) => void;
  readonly onSelectFile: (fileId: string | null) => void;
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

const ImportViewer = ({
  effectiveSelectedFileId,
  error,
  fileInputRef,
  files,
  isDragging,
  listRef,
  onClearError,
  onDragLeave,
  onDragOver,
  onDrop,
  onFileChange,
  onListScroll,
  onRemoveFile,
  onSelectFile,
  t,
}: ImportViewerProps) => {
  const listHostRef = useRef<HTMLDivElement | null>(null);
  const listViewRef = useRef<ListView<ImporterFileEntry> | null>(null);
  const toastRef = useRef<Toast | null>(null);

  const listOptions = useMemo<ListViewOptions<ImporterFileEntry>>(
    () => ({
      className: "import-viewer-file-list",
      getKey: (fileEntry, index) =>
        fileEntry.fileId ?? fileEntry.itemKey ?? String(index),
      gap: 12,
      items: files,
      minVirtualCount: 200,
      onScroll: onListScroll,
      onSelect: (fileEntry) => onSelectFile(fileEntry.fileId ?? null),
      renderItem: (fileEntry, _index, _state, container) => {
        renderImportViewerFileItem(
          fileEntry,
          effectiveSelectedFileId === fileEntry.fileId,
          onRemoveFile,
          container,
        );
      },
      disposeItem: (_fileEntry, _index, container) => {
        container.replaceChildren();
      },
      rowHeight: 64,
      selectedKey: effectiveSelectedFileId ?? null,
      viewportClassName: "import-viewer-file-list-viewport",
    }),
    [
      effectiveSelectedFileId,
      files,
      onListScroll,
      onRemoveFile,
      onSelectFile,
    ],
  );

  useEffect(() => {
    const host = listHostRef.current;
    if (!host) return;

    const listView = new ListView<ImporterFileEntry>(host, listOptions);
    listViewRef.current = listView;
    (listRef as MutableRefObject<ListHandle | null>).current = listView;

    return () => {
      listView.dispose();
      listViewRef.current = null;
      if ((listRef as MutableRefObject<ListHandle | null>).current === listView) {
        (listRef as MutableRefObject<ListHandle | null>).current = null;
      }
    };
  }, []);

  useEffect(() => {
    listViewRef.current?.setProps(listOptions);
  }, [listOptions]);

  useEffect(() => {
    const toast = new Toast();
    toastRef.current = toast;

    return () => {
      toastRef.current = null;
      toast.dispose();
    };
  }, []);

  useEffect(() => {
    const toast = toastRef.current;
    if (!toast) return;

    if (!error) {
      toast.hide();
      return;
    }

    toast.show({
      dataUi: "analysis-import-error-toast",
      message: error,
      onClose: onClearError,
      position: "fixed",
      type: "error",
    });
  }, [error, onClearError]);

  return jsxs(Fragment, {
    children: [
      jsxs(ScrollArea, {
        axis: "y",
        id: "analysis-csv-dropzone",
        "aria-label": t("da_import_section"),
        "data-state": files.length === 0 ? "empty" : "filled",
        className: cx(
          "import-viewer-dropzone",
          isDragging ? "dragging" : "idle",
        ),
        viewportClassName: "import-viewer-dropzone-viewport",
        viewportProps: {
          onDragOver,
          onDragLeave,
          onDrop,
        },
        onClick:
          files.length === 0 ? () => fileInputRef.current?.click() : undefined,
        children: [
          jsx(
            "input",
            {
              id: "analysis-csv-file-input",
              type: "file",
              multiple: true,
              accept: DATA_IMPORT_ACCEPT,
              className: "hidden",
              "aria-label": t("da_import_csv"),
              ref: fileInputRef,
              onChange: onFileChange,
              onClick: (event: MouseEvent<HTMLInputElement>) =>
                event.stopPropagation(),
            },
            "input",
          ),
          files.length === 0
            ? jsx(ImportEmptyView, { t })
            : jsx(
                "div",
                {
                  id: "analysis-import-scroll",
                  "data-slot": "filled",
                  className: "w-full min-h-full flex flex-col",
                  children: jsx("div", {
                    ref: listHostRef,
                    className: "w-full min-h-full",
                  }),
                },
                "filled",
              ),
        ],
      }),
    ],
  });
};

export default ImportViewer;
