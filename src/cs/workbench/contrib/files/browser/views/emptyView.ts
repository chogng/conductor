import { createButton } from "src/cs/base/browser/ui/button/button";
import { localize } from "src/cs/nls";

export type EmptyViewOptions = {
  readonly onImportFiles: () => void;
};

export const createEmptyView = ({
  onImportFiles,
}: EmptyViewOptions): HTMLDivElement => {
  const empty = document.createElement("div");
  empty.dataset.slot = "empty";
  empty.className = "file-list-empty";

  const importButton = createButton({
    ariaLabel: localize("files.importFolderButton", "导入文件夹"),
    className: "file-list-empty-import-button",
    content: document.createTextNode(localize("files.importFolderButton", "导入文件夹")),
    size: "sm",
    title: localize("files.importFolderButton", "导入文件夹"),
    variant: "primary",
  });
  importButton.addEventListener("click", onImportFiles);

  empty.append(importButton);
  return empty;
};
