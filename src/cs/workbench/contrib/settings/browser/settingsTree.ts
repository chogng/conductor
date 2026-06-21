import { append } from "src/cs/base/browser/dom";
import { SelectBox, createSelectBox, type SelectBoxOption } from "src/cs/base/browser/ui/selectBox/selectBox";
import { SwitchWidget } from "src/cs/base/browser/ui/switch/switchWidget";
import { Disposable, DisposableStore } from "src/cs/base/common/lifecycle";

export type SettingsTreeSelectOption = {
  readonly disabled?: boolean;
  readonly label: string;
  readonly value: string;
};

type SettingsTreeItemBase = {
  readonly description?: string;
  readonly id: string;
  readonly title: string;
};

export type SettingsTreeSelectItem = SettingsTreeItemBase & {
  readonly controlId: string;
  readonly disabled?: boolean;
  readonly kind: "select";
  readonly onChange: (value: string) => void;
  readonly options: readonly SettingsTreeSelectOption[];
  readonly value: string;
};

export type SettingsTreeSwitchItem = SettingsTreeItemBase & {
  readonly ariaLabel: string;
  readonly checked: boolean;
  readonly controlId: string;
  readonly disabled?: boolean;
  readonly kind: "switch";
  readonly onChange: (checked: boolean) => void;
};

export type SettingsTreeItem = SettingsTreeSelectItem | SettingsTreeSwitchItem;

export type SettingsTreeSection = {
  readonly id: string;
  readonly items: readonly SettingsTreeItem[];
  readonly title: string;
};

export class SettingsTree extends Disposable {
  public readonly element = div("settings-tree");
  private readonly sections = new Map<string, SettingsTreeSectionWidget>();

  public update(sections: readonly SettingsTreeSection[]): void {
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
      if (instance && instance.kind !== item.kind) {
        instance.dispose();
        this.items.delete(item.id);
        instance = undefined;
      }

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
  private readonly controlDisposables = this._register(new DisposableStore());
  private control: SelectBox<string> | SwitchWidget | null = null;
  private controlKind: SettingsTreeItem["kind"] | null = null;
  private currentItem: SettingsTreeItem;

  constructor(item: SettingsTreeItem) {
    super();
    this.currentItem = item;
    this.labelElement.append(this.titleElement, this.descriptionElement);
    this.rowElement.append(this.labelElement, this.controlElement);
    this.element.appendChild(this.rowElement);
    this.update(item);
  }

  public get kind(): SettingsTreeItem["kind"] {
    return this.currentItem.kind;
  }

  public update(item: SettingsTreeItem): void {
    this.currentItem = item;
    this.element.id = item.id;
    this.updateLabel(item);

    if (!this.control || this.controlKind !== item.kind) {
      this.controlDisposables.clear();
      this.control = this.createControl(item);
      this.controlKind = item.kind;
      this.controlElement.replaceChildren(this.control.domNode);
    }

    if (item.kind === "select" && this.control instanceof SelectBox) {
      this.updateSelectControl(this.control, item);
      return;
    }

    if (item.kind === "switch" && this.control instanceof SwitchWidget) {
      this.updateSwitchControl(this.control, item);
    }
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

  private createControl(item: SettingsTreeItem): SelectBox<string> | SwitchWidget {
    if (item.kind === "select") {
      const select = createSelectBox({
        id: item.controlId,
        className: "settings-select",
        disabled: item.disabled,
        value: item.value,
        options: item.options as readonly SelectBoxOption<string>[],
        onDidSelect: this.handleSelect,
      });
      this.controlDisposables.add(select);
      return select;
    }

    const widget = new SwitchWidget({
      checked: item.checked,
      className: "settings-switch",
      disabled: item.disabled,
      id: item.controlId,
      onDidChangeChecked: this.handleSwitch,
    });
    this.controlDisposables.add(widget);
    return widget;
  }

  private updateSelectControl(select: SelectBox<string>, item: SettingsTreeSelectItem): void {
    select.update({
      id: item.controlId,
      className: "settings-select",
      disabled: item.disabled,
      value: item.value,
      options: item.options as readonly SelectBoxOption<string>[],
      onDidSelect: this.handleSelect,
    });
  }

  private updateSwitchControl(widget: SwitchWidget, item: SettingsTreeSwitchItem): void {
    widget.update({
      checked: item.checked,
      className: "settings-switch",
      disabled: item.disabled,
      id: item.controlId,
    });
    widget.domNode.setAttribute("aria-label", item.ariaLabel);
  }

  private readonly handleSelect = (value: string): void => {
    const current = this.currentItem;
    if (current.kind === "select") {
      current.onChange(value);
    }
  };

  private readonly handleSwitch = (checked: boolean): void => {
    const current = this.currentItem;
    if (current.kind === "switch") {
      current.onChange(checked);
    }
  };
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
