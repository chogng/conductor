import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { ActionBar, type IActionViewItemProvider } from "src/cs/base/browser/ui/actionbar/actionbar";
import * as aria from "src/cs/base/browser/ui/aria/aria";
import type { IManagedHover } from "src/cs/base/browser/ui/hover/hover";
import { getBaseLayerHoverDelegate } from "src/cs/base/browser/ui/hover/hoverDelegate";
import { ScrollableElement } from "src/cs/base/browser/ui/scrollbar/scrollableElement";
import type { IAction, IActionRunner } from "src/cs/base/common/actions";
import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable, MutableDisposable } from "src/cs/base/common/lifecycle";

import "src/cs/base/browser/ui/inputbox/inputBox.css";

export type InputBoxInputElement = HTMLInputElement | HTMLTextAreaElement;

export interface IMessage {
  readonly content?: string;
  readonly formatContent?: boolean;
  readonly type?: MessageType;
}

export const enum MessageType {
  INFO = 1,
  WARNING = 2,
  ERROR = 3,
}

export type InputBoxOptions = {
  readonly actions?: readonly IAction[];
  readonly ariaDescribedBy?: string;
  readonly ariaLabel?: string;
  readonly ariaLabelledBy?: string;
  readonly autoComplete?: string;
  readonly disabled?: boolean;
  readonly flexibleHeight?: boolean;
  readonly id?: string;
  readonly left?: Node;
  readonly name?: string;
  readonly placeholder?: string;
  readonly readOnly?: boolean;
  readonly right?: Node;
  readonly scrollable?: boolean;
  readonly tooltip?: string;
  readonly type?: string;
  readonly value?: string | number;
  readonly actionRunner?: IActionRunner;
  readonly actionViewItemProvider?: IActionViewItemProvider;
};

export type InputBoxSelectionRange = {
  readonly start: number;
  readonly end: number;
};

export class InputBox<TInput extends InputBoxInputElement = HTMLInputElement> extends Disposable {
  public readonly element: HTMLDivElement;
  public readonly field: HTMLDivElement;
  public readonly input: TInput;

  private readonly actionBar = this._register(new MutableDisposable<ActionBar>());
  private readonly hover = this._register(new MutableDisposable<IManagedHover>());
  private readonly scrollableElement = this._register(new MutableDisposable<ScrollableElement>());
  private actionSlot: HTMLSpanElement | undefined;
  private message: IMessage | null = null;
  private tooltip = "";

  private readonly onDidChangeEmitter = this._register(new Emitter<string>());
  public readonly onDidChange: Event<string> = this.onDidChangeEmitter.event;

  private readonly onDidFocusEmitter = this._register(new Emitter<void>());
  public readonly onDidFocus: Event<void> = this.onDidFocusEmitter.event;

  private readonly onDidBlurEmitter = this._register(new Emitter<void>());
  public readonly onDidBlur: Event<void> = this.onDidBlurEmitter.event;

  public constructor(options: InputBoxOptions = {}) {
    super();
    this.element = document.createElement("div");
    this.field = document.createElement("div");
    this.input = document.createElement(options.flexibleHeight ? "textarea" : "input") as TInput;

    this.element.classList.add("inputbox_wrap", "idle");
    this.field.classList.add("inputbox_field");

    this.update(options, true);
    if (options.left) {
      const left = document.createElement("span");
      left.className = "inputbox_left";
      left.append(options.left);
      this.field.append(left);
    }
    this.field.append(this.input);

    if (options.right) {
      const right = document.createElement("span");
      right.className = "inputbox_right";
      right.append(options.right);
      this.field.append(right);
    }

    this.element.append(this.field);

    this.setTooltip(options.tooltip ?? "");
    this.setActions(options.actions, options);
    this.setScrollable(options.scrollable === true || options.flexibleHeight === true);
    this.registerListeners();
  }

  public get inputElement(): TInput {
    return this.input;
  }

  public get value(): string {
    return this.input.value;
  }

  public set value(value: string) {
    if (this.input.value !== value) {
      this.input.value = value;
    }
  }

  public update(options: InputBoxOptions = {}, applyDefaults = false): void {
    updateNativeInputBox(this.input, options, applyDefaults);
    if (options.tooltip !== undefined) {
      this.setTooltip(options.tooltip);
    }
    if (options.actions !== undefined || options.actionRunner !== undefined || options.actionViewItemProvider !== undefined) {
      this.setActions(options.actions, options);
    }
    if (options.scrollable !== undefined || options.flexibleHeight !== undefined) {
      this.setScrollable(options.scrollable === true || options.flexibleHeight === true);
    }
    this.scrollableElement.current?.update();
  }

  public focus(): void {
    this.input.focus();
  }

  public blur(): void {
    this.input.blur();
  }

  public select(range?: InputBoxSelectionRange): void {
    this.input.select();
    if (range && "setSelectionRange" in this.input) {
      this.input.setSelectionRange(range.start, range.end);
    }
  }

  public setEnabled(enabled: boolean): void {
    this.update({ disabled: !enabled });
  }

  public isEnabled(): boolean {
    return !this.input.disabled;
  }

  public setTooltip(tooltip: string): void {
    this.tooltip = tooltip;
    this.input.removeAttribute("title");
    if (!tooltip) {
      this.hover.clear();
      return;
    }

    if (this.hover.current) {
      this.hover.current.update?.(tooltip);
      return;
    }

    this.hover.current = getBaseLayerHoverDelegate().setupManagedHover(this.input, () => this.tooltip, {
      appearance: {
        compact: true,
      },
    });
  }

  public setActions(
    actions: readonly IAction[] | undefined,
    options: Pick<InputBoxOptions, "actionRunner" | "actionViewItemProvider"> = {},
  ): void {
    if (!actions?.length) {
      this.actionBar.clear();
      this.actionSlot?.remove();
      this.actionSlot = undefined;
      return;
    }

    let actionBar = this.actionBar.current;
    if (!actionBar) {
      actionBar = new ActionBar({
        actionRunner: options.actionRunner,
        actionViewItemProvider: options.actionViewItemProvider,
      });
      this.actionBar.current = actionBar;
      const actionsSlot = document.createElement("span");
      actionsSlot.className = "inputbox_right inputbox_action_slot";
      actionsSlot.append(actionBar.domNode);
      this.field.append(actionsSlot);
      this.actionSlot = actionsSlot;
    } else if (options.actionRunner) {
      actionBar.actionRunner = options.actionRunner;
    }

    actionBar.clear();
    actionBar.push([...actions], { icon: true, label: false });
  }

  public showMessage(message: IMessage): void {
    this.message = message;

    this.element.classList.remove("idle");
    this.element.classList.remove("info");
    this.element.classList.remove("warning");
    this.element.classList.remove("error");
    this.element.classList.add(this.classForType(message.type));
    if (message.type === MessageType.ERROR) {
      this.input.setAttribute("aria-invalid", "true");
    } else {
      this.input.setAttribute("aria-invalid", "false");
    }
    if (message.content) {
      aria.alert(this.alertTextForMessage(message));
    }
  }

  public hideMessage(): void {
    this.message = null;

    this.element.classList.remove("info");
    this.element.classList.remove("warning");
    this.element.classList.remove("error");
    this.element.classList.add("idle");
    this.input.setAttribute("aria-invalid", "false");
  }

  public layout(): void {
    this.scrollableElement.current?.update();
  }

  public override dispose(): void {
    this.element.remove();
    super.dispose();
  }

  private registerListeners(): void {
    this._register(addDisposableListener(this.input, EventType.INPUT, () => {
      this.onDidChangeEmitter.fire(this.input.value);
      this.scrollableElement.current?.update();
    }));
    this._register(addDisposableListener(this.input, EventType.FOCUS, () => {
      this.element.classList?.add("synthetic-focus");
      this.onDidFocusEmitter.fire();
    }));
    this._register(addDisposableListener(this.input, EventType.BLUR, () => {
      this.element.classList?.remove("synthetic-focus");
      this.onDidBlurEmitter.fire();
    }));
  }

  private setScrollable(scrollable: boolean): void {
    if (!scrollable) {
      this.scrollableElement.clear();
      this.element.classList?.remove("inputbox_scrollable");
      return;
    }

    if (this.scrollableElement.current) {
      return;
    }

    this.element.classList?.add("inputbox_scrollable");
    this.scrollableElement.current = new ScrollableElement({
      axis: "y",
      handleMouseWheel: true,
      root: this.element,
      viewport: this.input,
    });
  }

  private classForType(type: MessageType | undefined): string {
    switch (type) {
      case MessageType.INFO:
        return "info";
      case MessageType.WARNING:
        return "warning";
      default:
        return "error";
    }
  }

  private alertTextForMessage(message: IMessage): string {
    switch (message.type) {
      case MessageType.INFO:
        return `Info: ${message.content}`;
      case MessageType.WARNING:
        return `Warning: ${message.content}`;
      default:
        return `Error: ${message.content}`;
    }
  }
}

export function createInputBox(options: InputBoxOptions & { readonly flexibleHeight: true }): InputBox<HTMLTextAreaElement>;
export function createInputBox(options?: InputBoxOptions): InputBox<HTMLInputElement>;
export function createInputBox(options: InputBoxOptions = {}): InputBox<InputBoxInputElement> {
  return new InputBox(options);
}

const updateNativeInputBox = (
  input: InputBoxInputElement,
  options: InputBoxOptions = {},
  applyDefaults = false,
): void => {
  if (options.id !== undefined) {
    input.id = options.id;
  }
  if (options.name !== undefined) {
    input.name = options.name;
  }
  if (options.ariaLabel !== undefined) {
    setOptionalAttribute(input, "aria-label", options.ariaLabel);
  }
  if (options.ariaLabelledBy !== undefined) {
    setOptionalAttribute(input, "aria-labelledby", options.ariaLabelledBy);
  }
  if (options.ariaDescribedBy !== undefined) {
    setOptionalAttribute(input, "aria-describedby", options.ariaDescribedBy);
  }

  if (!isTextArea(input) && (applyDefaults || options.type !== undefined)) {
    input.type = options.type ?? "text";
  }
  if (options.value !== undefined && input.value !== String(options.value)) {
    input.value = String(options.value);
  }
  if (applyDefaults || options.disabled !== undefined) {
    input.disabled = options.disabled === true;
  }
  if (applyDefaults || options.readOnly !== undefined) {
    input.readOnly = options.readOnly === true;
  }
  if (applyDefaults || options.placeholder !== undefined) {
    input.placeholder = options.placeholder ?? "";
  }
  if (applyDefaults || options.autoComplete !== undefined) {
    input.setAttribute("autocomplete", options.autoComplete ?? "off");
  }
  if (applyDefaults) {
    input.className = "inputbox_native";
    input.setAttribute("aria-invalid", "false");
  }
};

const isTextArea = (input: InputBoxInputElement): input is HTMLTextAreaElement =>
  (input as HTMLElement).tagName === "TEXTAREA";

const setOptionalAttribute = (
  element: HTMLElement,
  name: string,
  value: string | undefined,
): void => {
  if (value === undefined || value === "") {
    element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, value);
};
