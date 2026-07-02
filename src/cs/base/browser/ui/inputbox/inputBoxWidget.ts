import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { createInputBox, type IMessage, type InputBox, type InputBoxOptions } from "src/cs/base/browser/ui/inputbox/inputBox";
import { createLxIcon, type LxIconDefinition } from "src/cs/base/browser/ui/lxicon/lxicon";
import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";

import "src/cs/base/browser/ui/inputbox/inputBoxWidget.css";

export type InputBoxWidgetItemAction = {
  readonly ariaLabel: string;
  readonly icon: LxIconDefinition;
};

type InputBoxWidgetItemBase = {
  readonly id: string;
  readonly label: string;
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
  readonly draggable?: boolean;
  readonly kind?: string;
};

export type IInputBoxWidgetItem = InputBoxWidgetItemBase & (
  | {
    readonly action?: InputBoxWidgetItemAction;
    readonly removable?: false;
    readonly removeAriaLabel?: never;
  }
  | {
    readonly action?: never;
    readonly removable: true;
    readonly removeAriaLabel: string;
  }
);

export type IInputBoxWidgetItemActionEvent = {
  readonly browserEvent: MouseEvent;
  readonly item: IInputBoxWidgetItem;
};

export type IInputBoxWidgetItemRemoveEvent = {
  readonly browserEvent: MouseEvent;
  readonly item: IInputBoxWidgetItem;
};

export type IInputBoxWidgetItemDropEvent = {
  readonly browserEvent: DragEvent;
  readonly sourceItem: IInputBoxWidgetItem;
  readonly targetItem: IInputBoxWidgetItem;
};

export type InputBoxWidgetOptions = Pick<
  InputBoxOptions,
  | "ariaDescribedBy"
  | "ariaLabel"
  | "ariaLabelledBy"
  | "autoComplete"
  | "disabled"
  | "id"
  | "placeholder"
  | "readOnly"
  | "type"
  | "value"
> & {
  readonly emptyLabel?: string;
  readonly inputVisible?: boolean;
  readonly items?: readonly IInputBoxWidgetItem[];
};

export class InputBoxWidget extends Disposable {
  public readonly element: HTMLDivElement;
  public readonly field: HTMLDivElement;
  public readonly input: HTMLInputElement;

  private readonly inputBox: InputBox<HTMLInputElement>;
  private readonly itemActionButtons = new Map<string, HTMLButtonElement>();
  private readonly itemActionIcons = new Map<string, LxIconDefinition>();
  private readonly itemById = new Map<string, IInputBoxWidgetItem>();
  private readonly itemLabels = new Map<string, HTMLElement>();
  private readonly itemNodes = new Map<string, HTMLElement>();
  private emptyElement: HTMLElement | undefined;
  private items: readonly IInputBoxWidgetItem[] = [];
  private emptyLabel = "";
  private inputVisible = true;
  private disabled = false;
  private dragSourceItemId: string | null = null;

  private readonly onDidAcceptEmitter = this._register(new Emitter<string>());
  public readonly onDidAccept: Event<string> = this.onDidAcceptEmitter.event;

  public readonly onDidBlur: Event<void>;

  private readonly onDidChangeEmitter = this._register(new Emitter<string>());
  public readonly onDidChange: Event<string> = this.onDidChangeEmitter.event;

  private readonly onDidTriggerItemActionEmitter = this._register(new Emitter<IInputBoxWidgetItemActionEvent>());
  public readonly onDidTriggerItemAction: Event<IInputBoxWidgetItemActionEvent> = this.onDidTriggerItemActionEmitter.event;

  private readonly onDidRemoveItemEmitter = this._register(new Emitter<IInputBoxWidgetItemRemoveEvent>());
  public readonly onDidRemoveItem: Event<IInputBoxWidgetItemRemoveEvent> = this.onDidRemoveItemEmitter.event;

  private readonly onDidDropItemEmitter = this._register(new Emitter<IInputBoxWidgetItemDropEvent>());
  public readonly onDidDropItem: Event<IInputBoxWidgetItemDropEvent> = this.onDidDropItemEmitter.event;

  public constructor(options: InputBoxWidgetOptions = {}) {
    super();
    this.inputBox = this._register(createInputBox(getInputBoxOptions(options)));
    this.onDidBlur = this.inputBox.onDidBlur;
    this.element = this.inputBox.element;
    this.field = this.inputBox.field;
    this.input = this.inputBox.input;
    this.element.classList.add("inputbox_widget");
    this.field.classList.add("inputbox_widget_field");
    this.update(options);
    this.registerListeners();
  }

  public get value(): string {
    return this.inputBox.value;
  }

  public set value(value: string) {
    this.inputBox.value = value;
  }

  public update(options: InputBoxWidgetOptions = {}): void {
    let shouldRenderItems = false;
    let shouldUpdateEmptyElement = false;
    if (options.items !== undefined) {
      this.items = options.items;
      shouldRenderItems = true;
    }
    if (options.emptyLabel !== undefined) {
      this.emptyLabel = options.emptyLabel;
      shouldUpdateEmptyElement = true;
    }
    if (options.inputVisible !== undefined) {
      this.inputVisible = options.inputVisible;
      this.updateInputVisibility();
      shouldUpdateEmptyElement = true;
    }
    let forceUpdateItems = false;
    if (options.disabled !== undefined) {
      const disabled = options.disabled === true;
      if (this.disabled !== disabled) {
        shouldRenderItems = true;
        forceUpdateItems = true;
      }
      this.disabled = disabled;
    }
    if (shouldRenderItems) {
      this.renderItems(forceUpdateItems);
    }
    else if (shouldUpdateEmptyElement) {
      this.updateEmptyElement();
    }
    this.inputBox.update(getInputBoxOptions(options));
  }

  public focus(): void {
    this.inputBox.focus();
  }

  public blur(): void {
    this.inputBox.blur();
  }

  public setEnabled(enabled: boolean): void {
    this.update({ disabled: !enabled });
  }

  public isEnabled(): boolean {
    return this.inputBox.isEnabled();
  }

  public showMessage(message: IMessage): void {
    this.inputBox.showMessage(message);
  }

  public hideMessage(): void {
    this.inputBox.hideMessage();
  }

  public layout(): void {
    this.inputBox.layout();
  }

  private registerListeners(): void {
    this._register(this.inputBox.onDidChange(value => this.onDidChangeEmitter.fire(value)));
    this._register(addDisposableListener(this.input, EventType.KEY_DOWN, event => {
      if (event.key !== "Enter" || event.isComposing || this.disabled || !this.inputVisible || this.input.readOnly) {
        return;
      }

      const value = this.input.value.trim();
      if (!value) {
        return;
      }

      event.preventDefault();
      this.onDidAcceptEmitter.fire(this.input.value);
    }));
    this._register(addDisposableListener(this.field, EventType.MOUSE_DOWN, event => {
      if (!this.inputVisible || this.disabled || isElementInsideButton(event.target) || event.target === this.input) {
        return;
      }

      event.preventDefault();
      this.input.focus();
    }));
  }

  private renderItems(forceUpdateItems = false): void {
    const nextIds = new Set<string>();
    const previousItems = new Map(this.itemById);
    this.itemById.clear();

    for (const item of this.items) {
      nextIds.add(item.id);
      this.itemById.set(item.id, item);
      let node = this.itemNodes.get(item.id);
      if (!node) {
        node = this.createItemElement(item);
        this.itemNodes.set(item.id, node);
      }
      const previousItem = previousItems.get(item.id);
      if (forceUpdateItems || !previousItem || !inputBoxWidgetItemsEqual(previousItem, item)) {
        this.updateItemElement(node, item);
      }
    }

    for (const [id, node] of Array.from(this.itemNodes)) {
      if (nextIds.has(id)) {
        continue;
      }
      node.remove();
      this.itemNodes.delete(id);
      this.itemLabels.delete(id);
      this.itemActionButtons.delete(id);
      this.itemActionIcons.delete(id);
    }

    let referenceNode: ChildNode = this.input;
    for (let index = this.items.length - 1; index >= 0; index--) {
      const item = this.items[index]!;
      const node = this.itemNodes.get(item.id)!;
      if (node.parentElement !== this.field || node.nextSibling !== referenceNode) {
        this.field.insertBefore(node, referenceNode);
      }
      referenceNode = node;
    }

    this.updateEmptyElement();
  }

  private createItemElement(item: IInputBoxWidgetItem): HTMLElement {
    const element = document.createElement("span");
    this._register(addDisposableListener(element, EventType.DRAG_START, event => {
      const currentItem = this.getItemForElement(element);
      if (!currentItem || this.disabled || currentItem.draggable !== true) {
        event.preventDefault();
        return;
      }
      this.dragSourceItemId = currentItem.id;
      if (event.dataTransfer) {
        event.dataTransfer.setData("application/x-conductor-inputbox-widget-item", currentItem.id);
        event.dataTransfer.effectAllowed = "move";
      }
    }));
    this._register(addDisposableListener(element, EventType.DRAG_OVER, event => {
      const currentItem = this.getItemForElement(element);
      if (!currentItem || !this.dragSourceItemId || currentItem.id === this.dragSourceItemId) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    }));
    this._register(addDisposableListener(element, EventType.DROP, event => {
      const targetItem = this.getItemForElement(element);
      const sourceItem = this.dragSourceItemId ? this.itemById.get(this.dragSourceItemId) : undefined;
      this.dragSourceItemId = null;
      if (!sourceItem || !targetItem || sourceItem.id === targetItem.id) {
        return;
      }
      event.preventDefault();
      this.onDidDropItemEmitter.fire({ browserEvent: event, sourceItem, targetItem });
    }));
    this._register(addDisposableListener(element, EventType.DRAG_END, () => {
      this.dragSourceItemId = null;
    }));

    const label = document.createElement("span");
    label.className = "inputbox_widget_item_label";
    element.appendChild(label);
    this.itemLabels.set(item.id, label);
    return element;
  }

  private updateItemElement(element: HTMLElement, item: IInputBoxWidgetItem): void {
    setClassName(element, "inputbox_widget_item");
    if (element.dataset.itemId !== item.id) {
      element.dataset.itemId = item.id;
    }
    const draggable = !this.disabled && item.draggable === true;
    if (element.draggable !== draggable) {
      element.draggable = draggable;
    }
    if (item.kind) {
      if (element.dataset.kind !== item.kind) {
        element.dataset.kind = item.kind;
      }
    }
    else if (element.dataset.kind !== undefined) {
      delete element.dataset.kind;
    }
    setOptionalAttribute(element, "aria-label", item.ariaLabel);

    const label = this.itemLabels.get(item.id)!;
    if (label.textContent !== item.label) {
      label.textContent = item.label;
    }
    const itemAction = getInputBoxWidgetItemAction(item);
    if (itemAction) {
      this.updateItemActionButton(element, item, itemAction);
      return;
    }

    this.itemActionButtons.get(item.id)?.remove();
    this.itemActionButtons.delete(item.id);
    this.itemActionIcons.delete(item.id);
  }

  private getItemForElement(element: HTMLElement): IInputBoxWidgetItem | undefined {
    const id = element.dataset.itemId;
    return id ? this.itemById.get(id) : undefined;
  }

  private updateItemActionButton(
    element: HTMLElement,
    item: IInputBoxWidgetItem,
    action: InputBoxWidgetItemAction,
  ): void {
    let actionButton = this.itemActionButtons.get(item.id);
    if (!actionButton) {
      actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.addEventListener("click", event => {
        const currentItem = this.itemById.get(item.id);
        if (!currentItem) {
          return;
        }
        if (currentItem.removable === true) {
          this.onDidRemoveItemEmitter.fire({ browserEvent: event, item: currentItem });
        }
        else {
          this.onDidTriggerItemActionEmitter.fire({ browserEvent: event, item: currentItem });
        }
      });
      element.appendChild(actionButton);
      this.itemActionButtons.set(item.id, actionButton);
    }

    setClassName(actionButton, "inputbox_widget_item_action");
    const disabled = this.disabled || item.disabled === true;
    if (actionButton.disabled !== disabled) {
      actionButton.disabled = disabled;
    }
    setOptionalAttribute(actionButton, "aria-label", action.ariaLabel);
    if (this.itemActionIcons.get(item.id) !== action.icon) {
      actionButton.replaceChildren(createLxIcon({
        className: "inputbox_widget_item_action_icon",
        icon: action.icon,
        size: 14,
      }));
      this.itemActionIcons.set(item.id, action.icon);
    }
  }

  private updateInputVisibility(): void {
    if (this.input.hidden === this.inputVisible) {
      this.input.hidden = !this.inputVisible;
    }
    this.field.classList.toggle("inputbox_widget_field--input-hidden", !this.inputVisible);
  }

  private updateEmptyElement(): void {
    const shouldShowEmpty = !this.inputVisible && this.items.length === 0 && Boolean(this.emptyLabel);
    if (!shouldShowEmpty) {
      this.emptyElement?.remove();
      this.emptyElement = undefined;
      return;
    }

    if (!this.emptyElement) {
      this.emptyElement = document.createElement("span");
      this.emptyElement.className = "inputbox_widget_empty";
      this.field.insertBefore(this.emptyElement, this.input);
    }
    if (this.emptyElement.textContent !== this.emptyLabel) {
      this.emptyElement.textContent = this.emptyLabel;
    }
  }
}

const isElementInsideButton = (target: EventTarget | null): boolean =>
  target instanceof Element && Boolean(target.closest("button"));

const getInputBoxOptions = (options: InputBoxWidgetOptions): InputBoxOptions => ({
  ariaDescribedBy: options.ariaDescribedBy,
  ariaLabel: options.ariaLabel,
  ariaLabelledBy: options.ariaLabelledBy,
  autoComplete: options.autoComplete,
  disabled: options.disabled,
  id: options.id,
  placeholder: options.placeholder,
  readOnly: options.readOnly,
  tooltip: "",
  type: options.type,
  value: options.value,
});

const inputBoxWidgetItemsEqual = (
  current: IInputBoxWidgetItem,
  next: IInputBoxWidgetItem,
): boolean =>
  current.id === next.id &&
  current.label === next.label &&
  normalizeOptionalString(current.ariaLabel) === normalizeOptionalString(next.ariaLabel) &&
  (current.disabled === true) === (next.disabled === true) &&
  (current.draggable === true) === (next.draggable === true) &&
  (current.removable === true) === (next.removable === true) &&
  normalizeOptionalString(current.kind) === normalizeOptionalString(next.kind) &&
  normalizeOptionalString(current.removeAriaLabel) === normalizeOptionalString(next.removeAriaLabel) &&
  inputBoxWidgetItemActionsEqual(current.action, next.action);

const inputBoxWidgetItemActionsEqual = (
  current: InputBoxWidgetItemAction | undefined,
  next: InputBoxWidgetItemAction | undefined,
): boolean => {
  if (!current || !next) {
    return current === next;
  }
  return current.icon === next.icon &&
    normalizeOptionalString(current.ariaLabel) === normalizeOptionalString(next.ariaLabel);
};

const normalizeOptionalString = (value: string | undefined): string | undefined =>
  value || undefined;

const getInputBoxWidgetItemAction = (item: IInputBoxWidgetItem): InputBoxWidgetItemAction | undefined => {
  if (item.action) {
    return item.action;
  }
  if (item.removable === true) {
    return {
      ariaLabel: item.removeAriaLabel,
      icon: LxIcon.close,
    };
  }
  return undefined;
};

const setClassName = (element: HTMLElement, className: string): void => {
  if (element.className !== className) {
    element.className = className;
  }
};

const setOptionalAttribute = (element: HTMLElement, name: string, value: string | undefined): void => {
  if (value) {
    if (element.getAttribute(name) !== value) {
      element.setAttribute(name, value);
    }
    return;
  }

  if (element.getAttribute(name) !== null) {
    element.removeAttribute(name);
  }
};
