import { DisposableStore, toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";

import "src/cs/base/browser/ui/InlineEditableText/inlineEditableText.css";

export type InlineEditableTextWidgetStyle = Partial<CSSStyleDeclaration>;

export type InlineEditableTextWidgetOptions = {
  className?: string;
  displayClassName?: string;
  draftValue: string;
  editing: boolean;
  inputClassName?: string;
  inputFieldClassName?: string;
  onCancel: () => void;
  onChange: (nextValue: string) => void;
  onCommit: () => void;
  onStartEdit: () => void;
  style?: InlineEditableTextWidgetStyle;
  title?: string;
  value: string;
};

export class InlineEditableTextWidget implements IDisposable {
  private readonly disposables = new DisposableStore();
  private readonly root = document.createElement("div");
  private readonly input = document.createElement("input");
  private pendingExitAction: "commit" | "cancel" | null = null;
  private options: InlineEditableTextWidgetOptions;

  public constructor(options: InlineEditableTextWidgetOptions) {
    this.options = options;
    this.input.type = "text";
    this.input.autocomplete = "off";
    this.root.appendChild(this.input);

    this.input.addEventListener("change", this.handleInputChange);
    this.input.addEventListener("input", this.handleInputChange);
    this.input.addEventListener("blur", this.handleBlur);
    this.input.addEventListener("keydown", this.handleKeyDown);
    this.input.addEventListener("dblclick", this.handleDoubleClick);

    this.disposables.add(toDisposable(() => {
      this.input.removeEventListener("change", this.handleInputChange);
      this.input.removeEventListener("input", this.handleInputChange);
      this.input.removeEventListener("blur", this.handleBlur);
      this.input.removeEventListener("keydown", this.handleKeyDown);
      this.input.removeEventListener("dblclick", this.handleDoubleClick);
    }));

    this.update(options);
  }

  public get element(): HTMLElement {
    return this.root;
  }

  public get inputElement(): HTMLInputElement {
    return this.input;
  }

  public update(options: InlineEditableTextWidgetOptions): void {
    const wasEditing = this.options.editing;
    this.options = options;

    const rootClassNames = [
      "inline-editable-text",
      options.editing ? "inline-editable-text--editing" : "inline-editable-text--display",
    ];
    if (options.className) {
      rootClassNames.push(options.className);
    }
    if (options.inputFieldClassName) {
      rootClassNames.push(options.inputFieldClassName);
    }
    this.root.className = rootClassNames.join(" ");
    this.root.title = options.title ?? "";

    this.input.value = options.editing ? options.draftValue : options.value;
    this.input.readOnly = !options.editing;
    const inputClassNames = [
      "inline-editable-text__input",
      options.editing
        ? "inline-editable-text__input--editing"
        : "inline-editable-text__input--display",
    ];
    if (options.displayClassName) {
      inputClassNames.push(options.displayClassName);
    }
    if (options.inputClassName) {
      inputClassNames.push(options.inputClassName);
    }
    this.input.className = inputClassNames.join(" ");
    this.applyStyle(options.style);

    if (options.editing && !wasEditing) {
      this.input.focus();
      this.input.select();
    }
  }

  public dispose(): void {
    this.disposables.dispose();
    this.root.remove();
  }

  private applyStyle(style: InlineEditableTextWidgetStyle | undefined): void {
    this.input.removeAttribute("style");
    if (!style) return;

    Object.assign(this.input.style, style);
  }

  private readonly handleInputChange = (): void => {
    if (!this.options.editing) return;
    this.options.onChange(this.input.value);
  };

  private readonly handleBlur = (): void => {
    const pendingAction = this.pendingExitAction;
    this.pendingExitAction = null;

    if (pendingAction === "cancel") {
      this.options.onCancel();
      return;
    }

    this.options.onCommit();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      this.pendingExitAction = "commit";
      this.input.blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      this.pendingExitAction = "cancel";
      this.input.blur();
    }
  };

  private readonly handleDoubleClick = (): void => {
    if (!this.options.editing) {
      this.options.onStartEdit();
    }
  };
}

export default InlineEditableTextWidget;
