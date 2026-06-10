import { createButton } from "src/cs/base/browser/ui/button/button";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { LxIcon } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import {
  detectFolderImportSupport,
  type FolderImportSupport,
} from "src/cs/platform/files/browser/webFileSystemAccess";
import {
  getFolderImportUnsupportedMessage,
} from "src/cs/workbench/contrib/files/browser/fileImportExport";

export type EmptyViewOptions = {
  readonly onImportFiles: () => void;
  /** Override for tests; defaults to probing the current environment. */
  readonly folderImportSupport?: FolderImportSupport;
};

export const createEmptyView = ({
  onImportFiles,
  folderImportSupport,
}: EmptyViewOptions): HTMLDivElement => {
  const empty = document.createElement("div");
  empty.dataset.slot = "empty";
  empty.className = "file-list-empty";

  const defaultView = document.createElement("div");
  defaultView.className = "file-list-empty-default";

  const support = folderImportSupport ?? detectFolderImportSupport();
  const importButton = createButton({
    ariaLabel: localize("files.importFolderButton", "Import Folder"),
    className: "file-list-empty-import-button",
    content: document.createTextNode(localize("files.importFolderButton", "Import Folder")),
    disabled: !support.supported,
    size: "sm",
    title: localize("files.importFolderButton", "Import Folder"),
    variant: "primary",
  });
  importButton.addEventListener("click", onImportFiles);

  defaultView.append(importButton);

  if (!support.supported) {
    defaultView.append(createUnsupportedNotice(support));
  }

  empty.append(defaultView, createDragEmptyView());
  return empty;
};

const createUnsupportedNotice = (
  support: FolderImportSupport,
): HTMLDivElement => {
  const notice = document.createElement("div");
  notice.className = "file-list-empty-unsupported";
  notice.setAttribute("role", "alert");
  notice.dataset.reason = support.reason ?? "";
  // Self-contained styling so the hint is visible regardless of stylesheet.
  notice.style.cssText =
    "margin-top:8px;max-width:280px;font-size:12px;line-height:1.5;color:#b54708;text-align:center;";
  notice.textContent = getFolderImportUnsupportedMessage(support);
  return notice;
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
  title.textContent = localize("files.dropFilesTitle", "Release to import");

  const description = document.createElement("div");
  description.className = "file-list-drag-empty-description";
  description.textContent = localize(
    "files.dropFilesDescription",
    "Drag files or folders here",
  );

  view.append(icon, title, description);
  return view;
};
