import { lxDownloadTray } from "cogicon";
import { normalizeCogIconSvgMarkup } from "src/cs/base/browser/ui/cogIcon/cogIcon";
import type { TranslateFn } from "src/cs/platform/language/common/language";

const appendEmptyViewIcon = (container: HTMLElement): void => {
  const iconSpan = document.createElement("span");
  iconSpan.className = "ui-cogicon";
  iconSpan.style.width = "20px";
  iconSpan.style.height = "20px";
  iconSpan.innerHTML = normalizeCogIconSvgMarkup(lxDownloadTray);
  container.appendChild(iconSpan);
};

export const createImportEmptyView = (t: TranslateFn): HTMLDivElement => {
  const empty = document.createElement("div");
  empty.id = "analysis-csv-empty";
  empty.dataset.slot = "empty";
  empty.className = "import-viewer-empty";

  const avatar = document.createElement("div");
  avatar.className = "import-viewer-empty-avatar";
  appendEmptyViewIcon(avatar);

  const subtitle = document.createElement("p");
  subtitle.className = "import-viewer-empty-subtitle";

  const prefix = document.createTextNode(`${t("da_csv_empty_subtitle_prefix")} `);
  const browse = document.createElement("span");
  browse.className = "import-viewer-empty-browse";
  browse.textContent = t("da_csv_empty_browse");

  subtitle.append(prefix, browse);
  empty.append(avatar, subtitle);
  return empty;
};
