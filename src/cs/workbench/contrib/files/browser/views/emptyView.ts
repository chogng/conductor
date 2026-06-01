import { lxDownloadTray } from "@chogng/lxicon";
import { createButton } from "src/cs/base/browser/ui/button/button";
import { normalizeLxIconSvgMarkup } from "src/cs/base/browser/ui/lxicon/lxiconMarkup";
import type { TranslateFn } from "src/cs/platform/language/common/language";

export type EmptyViewOptions = {
  readonly onImportFiles: () => void;
  readonly t: TranslateFn;
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
  t,
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

  const prefix = document.createTextNode(`${t("da_csv_empty_subtitle_prefix")} `);
  const browse = document.createElement("span");
  browse.className = "file-list-empty-browse";
  browse.textContent = t("da_csv_empty_browse");

  subtitle.append(prefix, browse);
  content.append(avatar, subtitle);

  const importButton = createButton({
    ariaLabel: t("da_import_csv"),
    className: "file-list-empty-import-button",
    content: [
      createEmptyIcon("file-list-empty-import-icon"),
      document.createTextNode(t("da_import_csv")),
    ],
    size: "sm",
    title: t("da_import_csv"),
    variant: "primary",
  });
  importButton.addEventListener("click", onImportFiles);

  empty.append(content, importButton);
  return empty;
};
