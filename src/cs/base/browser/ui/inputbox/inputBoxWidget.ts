import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { createInputBox, type IMessage, type InputBox, type InputBoxOptions } from "src/cs/base/browser/ui/inputbox/inputBox";
import { createLxIcon, type LxIconDefinition } from "src/cs/base/browser/ui/lxicon/lxicon";
import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";

import "src/cs/base/browser/ui/inputbox/inputBoxWidget.css";

export type InputBoxWidgetItemAction = {
  readonly ariaLabel: string;
  readonly icon: LxIconDefinition;
};

export type IInputBoxWidgetItem = {
  readonly id: string;
  readonly label: string;
  readonly action?: InputBoxWidgetItemAction;
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
  readonly kind?: string;
};

export type IInputBoxWidgetItemActionEvent = {
  readonly browserEvent: MouseEvent;
  readonly item: IInputBoxWidgetItem;
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
  private readonly itemNodes: HTMLElement[] = [];
  private emptyElement: HTMLElement | undefined;
  private items: readonly IInputBoxWidgetItem[] = [];
  private emptyLabel = "";
  private inputVisible = true;
  private disabled = false;

  private readonly onDidAcceptEmitter = this._register(new Emitter<string>());
  public readonly onDidAccept: Event<string> = this.onDidAcceptEmitter.event;

  private readonly onDidChangeEmitter = this._register(new Emitter<string>());
  public readonly onDidChange: Event<string> = this.onDidChangeEmitter.event;

  private readonly onDidTriggerItemActionEmitter = this._register(new Emitter<IInputBoxWidgetItemActionEvent>());
  public readonly onDidTriggerItemAction: Event<IInputBoxWidgetItemActionEvent> = this.onDidTriggerItemActionEmitter.event;

  public constructor(options: InputBoxWidgetOptions = {}) {
    super();
    this.inputBox = this._register(createInputBox(getInputBoxOptions(options)));
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
    if (options.items !== undefined) {
      this.items = options.items;
      this.renderItems();
    }
    if (options.emptyLabel !== undefined) {
      this.emptyLabel = options.emptyLabel;
      this.updateEmptyElement();
    }
    if (options.inputVisible !== undefined) {
      this.inputVisible = options.inputVisible;
      this.updateInputVisibility();
      this.updateEmptyElement();
    }
    if (options.disabled !== undefined) {
      this.disabled = options.disabled === true;
      this.renderItems();
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
      if (!this.inputVisible || this.disabled || isElementInsideButton(event.target)) {
        return;
      }

      event.preventDefault();
      this.input.focus();
    }));
  }

  private renderItems(): void {
    for (const node of this.itemNodes.splice(0)) {
      node.remove();
    }

    for (const item of this.items) {
      const node = this.createItemElement(item);
      this.itemNodes.push(node);
      this.field.insertBefore(node, this.input);
    }

    this.updateEmptyElement();
  }

  private createItemElement(item: IInputBoxWidgetItem): HTMLElement {
    const element = document.createElement("span");
    element.className = "inputbox_widget_item";
    element.dataset.itemId = item.id;
    if (item.kind) {
      element.dataset.kind = item.kind;
    }
    if (item.ariaLabel) {
      element.setAttribute("aria-label", item.ariaLabel);
    }

    const label = document.createElement("span");
    label.className = "inputbox_widget_item_label";
    label.textContent = item.label;
    element.appendChild(label);

    if (item.action) {
      const actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.className = "inputbox_widget_item_action";
      actionButton.disabled = this.disabled || item.disabled === true;
      actionButton.setAttribute("aria-label", item.action.ariaLabel);
      actionButton.appendChild(createLxIcon({
        className: "inputbox_widget_item_action_icon",
        icon: item.action.icon,
        size: 14,
      }));
      actionButton.addEventListener("click", event => {
        this.onDidTriggerItemActionEmitter.fire({ browserEvent: event, item });
      });
      element.appendChild(actionButton);
    }

    return element;
  }

  private updateInputVisibility(): void {
    this.input.hidden = !this.inputVisible;
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
    this.emptyElement.textContent = this.emptyLabel;
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
