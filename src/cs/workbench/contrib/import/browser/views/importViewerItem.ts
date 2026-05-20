import { memo, type MouseEvent } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { lxClose, lxFileText } from "cogicon";
import CogIcon from "src/cs/base/browser/ui/CogIcon/cogicon";
import { cx } from "src/utils/cx";
import type { ImporterFileEntry } from "src/cs/workbench/contrib/import/common/types";
import { toDomIdToken } from "src/cs/workbench/contrib/import/common/utils";

export type ImportViewerItemProps = {
  readonly fileEntry: ImporterFileEntry;
  readonly isSelected: boolean;
  readonly onRemove?: (fileId: string | null) => void;
};

const ImportViewerItem = memo(
  ({
    fileEntry,
    isSelected,
    onRemove,
  }: ImportViewerItemProps) => {
    const fileName =
      fileEntry?.file &&
      typeof fileEntry.file === "object" &&
      "name" in fileEntry.file
        ? String(fileEntry.file.name ?? "")
        : String(fileEntry?.fileName ?? "");
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
                onRemove?.(fileEntry.fileId ?? null);
              },
              className: "import-viewer-file-remove",
              children: jsx(CogIcon, { icon: lxClose, size: 16 }),
            }),
          },
          "actions",
        ),
      ],
    });
  },
);

ImportViewerItem.displayName = "ImportViewerItem";

export default ImportViewerItem;
