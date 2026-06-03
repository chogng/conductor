import { createButton } from "src/cs/base/browser/ui/button/button";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { LxIcon } from "src/cs/base/common/lxicon";
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

  const defaultView = document.createElement("div");
  defaultView.className = "file-list-empty-default";

  const importButton = createButton({
    ariaLabel: localize("files.importFolderButton", "导入文件夹"),
    className: "file-list-empty-import-button",
    content: document.createTextNode(localize("files.importFolderButton", "导入文件夹")),
    size: "sm",
    title: localize("files.importFolderButton", "导入文件夹"),
    variant: "primary",
  });
  importButton.addEventListener("click", onImportFiles);

  defaultView.append(importButton);
  empty.append(defaultView, createDragEmptyView());
  return empty;
};

const createDragEmptyView = (): HTMLDivElement => {
  const view = document.createElement("div");
  view.className = "file-list-drag-empty";
  view.setAttribute("aria-live", "polite");

  const icon = createLxIcon({
    className: "file-list-drag-empty-icon",
    icon: LxIcon.downloadTray,
    size: 24,
  });

  const title = document.createElement("div");
  title.className = "file-list-drag-empty-title";
  title.textContent = localize("files.dropFilesTitle", "释放以导入");

  const description = document.createElement("div");
  description.className = "file-list-drag-empty-description";
  description.textContent = localize(
    "files.dropFilesDescription",
    "支持拖入文件或文件夹",
  );

  view.append(icon, title, description);
  return view;
};
