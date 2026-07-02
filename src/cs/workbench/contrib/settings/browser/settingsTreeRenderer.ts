import { append } from "src/cs/base/browser/dom";
import type {
  SettingsTreeListItemRenderState,
  SettingsTreeListItemTemplate,
  SettingsTreeRenderer,
  SettingsTreeSectionHeaderTemplate,
  SettingsTreeSectionTemplate,
} from "src/cs/workbench/contrib/settings/browser/settingsTree";

export const settingsTreeRenderer: SettingsTreeRenderer = {
  createCompositeChild(): HTMLElement {
    return div("settings-composite-child");
  },

  createCompositeItem(): HTMLElement {
    return div("settings-cell settings-cell-composite");
  },

  createListItem(item: SettingsTreeListItemRenderState): SettingsTreeListItemTemplate {
    const element = div(getSettingsTreeListItemClassName(item));
    const dividerElement = div("settings-list-item-divider");
    dividerElement.setAttribute("aria-hidden", "true");
    const bodyElement = div("settings-list-item-body");
    element.append(dividerElement, bodyElement);
    updateElementDataset(element, "groupId", item.groupId);
    updateElementHidden(dividerElement, !item.hasDivider);
    return {
      bodyElement,
      dividerElement,
      element,
    };
  },

  createRoot(): HTMLElement {
    return div("settings-section-list");
  },

  createSection(): SettingsTreeSectionTemplate {
    const element = document.createElement("section");
    element.className = "settings-section";
    const bodyElement = div("settings-section-body");
    const listElement = div("settings-list");
    bodyElement.appendChild(listElement);
    element.appendChild(bodyElement);
    return {
      bodyElement,
      element,
      listElement,
    };
  },

  createSectionHeader(): SettingsTreeSectionHeaderTemplate {
    const element = div("settings-section-header");
    const textElement = div("settings-section-header-text");
    const titleElement = title("");
    const descriptionElement = text("p", "settings-description", "");
    const actionBarElement = div("settings-section-header-actions");
    textElement.append(titleElement, descriptionElement);
    element.append(textElement, actionBarElement);
    return {
      actionBarElement,
      descriptionElement,
      element,
      titleElement,
    };
  },

  updateCompositeChild(element: HTMLElement): void {
    updateElementClassName(element, "settings-composite-child");
  },

  updateCompositeItem(element: HTMLElement): void {
    updateElementClassName(element, "settings-cell settings-cell-composite");
  },

  updateListItem(template: SettingsTreeListItemTemplate, item: SettingsTreeListItemRenderState): void {
    updateElementClassName(template.element, getSettingsTreeListItemClassName(item));
    updateElementDataset(template.element, "groupId", item.groupId);
    updateElementHidden(template.dividerElement, !item.hasDivider);
  },
};

function div(className: string, ...children: Array<Node | string>): HTMLDivElement {
  const element = document.createElement("div");
  element.className = className;
  append(element, ...children);
  return element;
}

function updateElementClassName(element: HTMLElement, className: string): void {
  if (element.className !== className) {
    element.className = className;
  }
}

function updateElementDataset(element: HTMLElement, key: string, value: string): void {
  if (element.dataset[key] !== value) {
    element.dataset[key] = value;
  }
}

function updateElementHidden(element: HTMLElement, hidden: boolean): void {
  if (element.hidden !== hidden) {
    element.hidden = hidden;
  }
}

function getSettingsTreeListItemClassName(item: SettingsTreeListItemRenderState): string {
  return [
    "settings-list-item",
    item.first ? "settings-list-item--first" : undefined,
    item.last ? "settings-list-item--last" : undefined,
  ].filter(Boolean).join(" ");
}

function title(value: string): HTMLElement {
  return text("h3", "settings-title", value);
}

function text<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  value: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}
