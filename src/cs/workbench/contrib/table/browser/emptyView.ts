import { lxFileText } from "@chogng/lxicon";
import { normalizeLxIconSvgMarkup } from "src/cs/base/browser/ui/lxicon/lxiconMarkup";

export type EmptyViewOptions = {
  readonly description?: string;
  readonly title?: string;
};

const createEmptyIcon = (): HTMLSpanElement => {
  const icon = document.createElement("span");
  icon.className = "ui-lxicon table_view_empty_icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = normalizeLxIconSvgMarkup(lxFileText);
  return icon;
};

export const createEmptyView = ({
  description,
  title,
}: EmptyViewOptions): HTMLDivElement => {
  const root = document.createElement("div");
  root.className = "table_view_empty";

  const avatar = document.createElement("div");
  avatar.className = "table_view_empty_avatar";
  avatar.append(createEmptyIcon());

  root.append(avatar);

  if (title) {
    const titleElement = document.createElement("p");
    titleElement.className = "table_view_empty_title";
    titleElement.textContent = title;
    root.append(titleElement);
  }

  if (description) {
    const descriptionElement = document.createElement("p");
    descriptionElement.className = "table_view_empty_description";
    descriptionElement.textContent = description;
    root.append(descriptionElement);
  }

  return root;
};
