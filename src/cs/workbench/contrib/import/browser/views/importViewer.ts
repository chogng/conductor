import type {
  ChangeEvent,
  DragEvent,
  MouseEvent,
  RefObject,
} from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { lxClose, lxFileText } from "cogicon";
import ScrollArea from "src/cs/base/browser/ui/ScrollArea/ScrollArea";
import CogIcon from "src/cs/base/browser/ui/CogIcon/cogicon";
import { lxAlertCircle } from "src/cs/base/browser/ui/CogIcon/icons";
import List, { type ListHandle } from "src/cs/base/browser/ui/list/list";
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

const renderImportViewerFileItem = (
  fileEntry: ImporterFileEntry,
  isSelected: boolean,
  onRemove: (fileId: string | null) => void,
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

  return jsxs("div", {
    "aria-label": "csv-file-item",
    id: fileEntry?.itemKey
      ? `csv-file-item-${toDomIdToken(fileEntry.itemKey)}`
      : undefined,
    "data-item-key": fileEntry?.itemKey || undefined,
    "data-selected": isSelected ? "true" : undefined,
    title: fileName,
    className: cx("import-viewer-file-item", "group", isSelected && "selected"),
    children: [
      jsxs(
        "div",
        {
          className: "import-viewer-file-content",
          children: [
            jsx(
              "div",
              {
                className: "import-viewer-file-icon",
                children: jsx(CogIcon, { icon: lxFileText, size: 16 }),
              },
              "icon",
            ),
            jsxs(
              "div",
              {
                className: "import-viewer-file-text",
                children: [
                  jsx(
                    "span",
                    {
                      className: "import-viewer-file-name",
                      children: fileName,
                    },
                    "name",
                  ),
                  autoSummary
                    ? jsx(
                        "span",
                        {
                          className: cx(
                            "import-viewer-file-meta",
                            needsReview && "warning",
                          ),
                          children: autoSummary,
                        },
                        "meta",
                      )
                    : null,
                ],
              },
              "text",
            ),
          ],
        },
        "content",
      ),
      jsx(
        "div",
        {
          className: "import-viewer-file-actions",
          children: jsx("button", {
            type: "button",
            "aria-label": "Remove CSV file",
            id: fileEntry?.itemKey
              ? `csv-file-remove-${toDomIdToken(fileEntry.itemKey)}`
              : undefined,
            "data-item-key": fileEntry?.itemKey || undefined,
            onClick: (event: MouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              onRemove(fileEntry.fileId ?? null);
            },
            className: "import-viewer-file-remove",
            children: jsx(CogIcon, { icon: lxClose, size: 16 }),
          }),
        },
        "actions",
      ),
    ],
  });
};

const ImportViewer = ({
  effectiveSelectedFileId,
  error,
  fileInputRef,
  files,
  isDragging,
  listRef,
  onDragLeave,
  onDragOver,
  onDrop,
  onFileChange,
  onListScroll,
  onRemoveFile,
  onSelectFile,
  t,
}: ImportViewerProps) =>
  jsxs(Fragment, {
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
                  children: jsx(List, {
                    ref: listRef,
                    className: "import-viewer-file-list",
                    viewportClassName: "import-viewer-file-list-viewport",
                    items: files,
                    getKey: (fileEntry: ImporterFileEntry, index: number) =>
                      fileEntry.fileId ?? fileEntry.itemKey ?? String(index),
                    gap: 12,
                    minVirtualCount: 200,
                    onScroll: onListScroll,
                    onSelect: (fileEntry: ImporterFileEntry) =>
                      onSelectFile(fileEntry.fileId ?? null),
                    renderItem: (fileEntry: ImporterFileEntry) =>
                      renderImportViewerFileItem(
                        fileEntry,
                        effectiveSelectedFileId === fileEntry.fileId,
                        onRemoveFile,
                      ),
                    rowHeight: 64,
                    selectedKey: effectiveSelectedFileId ?? null,
                  }),
                },
                "filled",
              ),
        ],
      }),
      error
        ? jsxs("div", {
            className:
              "flex items-center gap-2 p-3 text-sm text-red-500 bg-red-500/10 rounded-lg mt-4 whitespace-pre-wrap",
            children: [
              jsx(CogIcon, { icon: lxAlertCircle, size: 16 }),
              error,
            ],
          })
        : null,
    ],
  });

export default ImportViewer;
