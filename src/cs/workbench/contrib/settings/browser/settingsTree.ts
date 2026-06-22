import { append } from "src/cs/base/browser/dom";
import { Disposable } from "src/cs/base/common/lifecycle";
import { normalizeSettingsSearchText } from "src/cs/workbench/contrib/settings/browser/settingsSearch";

export type SettingsTreeItem = {
  readonly control: HTMLElement;
  readonly description?: string;
  readonly id: string;
  readonly searchText?: string;
  readonly title: string;
};

export type SettingsTreeSection = {
  readonly id: string;
  readonly items: readonly SettingsTreeItem[];
  readonly title: string;
};

// Small settings tree: section and item ids are stable keys, while controls are
// caller-owned slot content. SettingsView owns control behavior and lifecycle.
export class SettingsTree extends Disposable {
  public readonly element = div("settings-tree");
  private readonly sections = new Map<string, SettingsTreeSectionWidget>();

  public update(sections: readonly SettingsTreeSection[]): void {
    // Patch by id so unchanged sections and caller-owned controls can keep
    // focus, DOM state, and widget instances across settings snapshot updates.
    const nextSectionIds = new Set(sections.map(section => section.id));
    for (const [id, section] of this.sections) {
      if (!nextSectionIds.has(id)) {
        section.dispose();
        this.sections.delete(id);
      }
    }

    for (let index = 0; index < sections.length; index++) {
      const section = sections[index];
      let instance = this.sections.get(section.id);
      if (!instance) {
        instance = this._register(new SettingsTreeSectionWidget(section));
        this.sections.set(section.id, instance);
      }
      else {
        instance.update(section);
      }
      ensureChildAt(this.element, instance.element, index);
    }
  }

  public override dispose(): void {
    super.dispose();
    this.sections.clear();
    this.element.remove();
  }
}

class SettingsTreeSectionWidget extends Disposable {
  public readonly element = div("settings-section");
  private readonly titleElement = title("");
  private readonly listElement = div("settings-list");
  private readonly items = new Map<string, SettingsTreeItemWidget>();

  constructor(section: SettingsTreeSection) {
    super();
    this.element.id = section.id;
    this.element.append(this.titleElement, this.listElement);
    this.update(section);
  }

  public update(section: SettingsTreeSection): void {
    this.titleElement.textContent = section.title;

    // Item ids are the row-level reuse boundary. Control structure belongs to
    // the supplied control node and is patched within the fixed right slot.
    const nextItemIds = new Set(section.items.map(item => item.id));
    for (const [id, item] of this.items) {
      if (!nextItemIds.has(id)) {
        item.dispose();
        this.items.delete(id);
      }
    }

    for (let index = 0; index < section.items.length; index++) {
      const item = section.items[index];
      let instance = this.items.get(item.id);

      if (!instance) {
        instance = this._register(new SettingsTreeItemWidget(item));
        this.items.set(item.id, instance);
      }
      else {
        instance.update(item);
      }
      ensureChildAt(this.listElement, instance.element, index);
    }
  }

  public override dispose(): void {
    super.dispose();
    this.items.clear();
    this.element.remove();
  }
}

export class SettingsTreeItemWidget extends Disposable {
  public readonly element = card("");
  private readonly rowElement = div("settings-row settings-split-row");
  private readonly labelElement = div("settings-row-title");
  private readonly titleElement = title("");
  private readonly descriptionElement = text("p", "settings-description", "");
  private readonly controlElement = div("settings-row-control");

  constructor(item: SettingsTreeItem) {
    super();
    this.labelElement.append(this.titleElement, this.descriptionElement);
    this.rowElement.append(this.labelElement, this.controlElement);
    this.element.appendChild(this.rowElement);
    this.update(item);
  }

  public update(item: SettingsTreeItem): void {
    this.element.id = item.id;
    this.updateSearchText(item);
    this.updateLabel(item);
    this.controlElement.className = "settings-row-control";
    this.updateControl(item.control);
  }

  public override dispose(): void {
    super.dispose();
    this.element.remove();
  }

  private updateLabel(item: SettingsTreeItem): void {
    this.labelElement.className = item.description ? "settings-heading" : "settings-row-title";
    this.titleElement.textContent = item.title;
    this.descriptionElement.hidden = !item.description;
    this.descriptionElement.textContent = item.description ?? "";
  }

  private updateSearchText(item: SettingsTreeItem): void {
    const searchText = normalizeSettingsSearchText(item.title, item.description, item.searchText);
    if (searchText) {
      this.element.dataset.search = searchText;
    }
    else {
      delete this.element.dataset.search;
    }
  }

  private updateControl(control: HTMLElement): void {
    if (this.controlElement.childNodes.length !== 1 || this.controlElement.firstChild !== control) {
      this.controlElement.replaceChildren(control);
    }
  }
}

function card(id: string): HTMLDivElement {
  const element = div("settings-card settings-card-row");
  element.id = id;
  return element;
}

function div(className: string, ...children: Array<Node | string>): HTMLDivElement {
  const element = document.createElement("div");
  element.className = className;
  append(element, ...children);
  return element;
}

function ensureChildAt(parent: HTMLElement, child: HTMLElement, index: number): void {
  if (parent.children.item(index) === child) {
    return;
  }

  parent.insertBefore(child, parent.children.item(index));
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
