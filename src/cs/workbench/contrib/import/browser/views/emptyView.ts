import { lxDownloadTray } from "@chogng/lxicon";
import { createButton } from "src/cs/base/browser/ui/button/button";
import { normalizeLxIconSvgMarkup } from "src/cs/base/browser/ui/lxicon/lxiconMarkup";
import type { TranslateFn } from "src/cs/platform/language/common/language";

export type ImportEmptyViewOptions = {
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

export const createImportEmptyView = ({
  onImportFiles,
  t,
}: ImportEmptyViewOptions): HTMLDivElement => {
  const empty = document.createElement("div");
  empty.dataset.slot = "empty";
  empty.className = "import-viewer-empty";

  const content = document.createElement("div");
  content.className = "import-viewer-empty-content";

  const avatar = document.createElement("div");
  avatar.className = "import-viewer-empty-avatar";
  avatar.appendChild(createEmptyIcon("import-viewer-empty-icon"));

  const subtitle = document.createElement("p");
  subtitle.className = "import-viewer-empty-subtitle";

  const prefix = document.createTextNode(`${t("da_csv_empty_subtitle_prefix")} `);
  const browse = document.createElement("span");
  browse.className = "import-viewer-empty-browse";
  browse.textContent = t("da_csv_empty_browse");

  subtitle.append(prefix, browse);
  content.append(avatar, subtitle);

  const importButton = createButton({
    ariaLabel: t("da_import_csv"),
    className: "import-viewer-empty-import-button",
    content: [
      createEmptyIcon("import-viewer-empty-import-icon"),
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
