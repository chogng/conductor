import { lxDownloadTray } from "@chogng/lxicon";
import { createButton } from "src/cs/base/browser/ui/button/button";
import { normalizeLxIconSvgMarkup } from "src/cs/base/browser/ui/lxicon/lxiconMarkup";
import { localize } from "src/cs/nls";

export type EmptyViewOptions = {
  readonly onImportFiles: () => void;
};

const createEmptyIcon = (className: string): HTMLSpanElement => {
  const icon = document.createElement("span");
  icon.className = `ui-lxicon ${className}`;
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = normalizeLxIconSvgMarkup(lxDownloadTray);
  return icon;
};

export const createEmptyView = ({
  onImportFiles,
}: EmptyViewOptions): HTMLDivElement => {
  const empty = document.createElement("div");
  empty.dataset.slot = "empty";
  empty.className = "file-list-empty";

  const content = document.createElement("div");
  content.className = "file-list-empty-content";

  const avatar = document.createElement("div");
  avatar.className = "file-list-empty-avatar";
  avatar.appendChild(createEmptyIcon("file-list-empty-icon"));

  const subtitle = document.createElement("p");
  subtitle.className = "file-list-empty-subtitle";

  const prefix = document.createTextNode(
    `${localize("files.emptySubtitlePrefix", "拖拽文件夹到这里，或")} `,
  );
  const browse = document.createElement("span");
  browse.className = "file-list-empty-browse";
  browse.textContent = localize("files.emptyBrowse", "浏览文件夹");

  subtitle.append(prefix, browse);
  content.append(avatar, subtitle);

  const importButton = createButton({
    ariaLabel: localize("files.importFolderButton", "导入文件夹"),
    className: "file-list-empty-import-button",
    content: [
      createEmptyIcon("file-list-empty-import-icon"),
      document.createTextNode(localize("files.importFolderButton", "导入文件夹")),
    ],
    size: "sm",
    title: localize("files.importFolderButton", "导入文件夹"),
    variant: "primary",
  });
  importButton.addEventListener("click", onImportFiles);

  empty.append(content, importButton);
  return empty;
};
