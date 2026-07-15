import {
  createAvatar,
  getAvatarContentElement,
  getAvatarIconClassName,
} from "src/cs/base/browser/ui/avatar/avatar";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { LxIcon } from "src/cs/base/common/lxicon";

export type EmptyViewOptions = {
  readonly description?: string;
  readonly title?: string;
};

const createEmptyIcon = (): HTMLSpanElement => {
  const icon = createLxIcon({
    className: getAvatarIconClassName(),
    icon: LxIcon.fileText,
  });
  icon.setAttribute("aria-hidden", "true");
  return icon;
};

export const createEmptyView = ({
  description,
  title,
}: EmptyViewOptions): HTMLDivElement => {
  const root = document.createElement("div");
  root.className = "table_view_empty";

  const avatar = createAvatar({
    className: "table_view_empty_avatar",
    variant: "empty",
  });
  getAvatarContentElement(avatar).append(createEmptyIcon());

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
