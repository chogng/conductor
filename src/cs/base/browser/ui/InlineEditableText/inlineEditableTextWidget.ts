import { DisposableStore, toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { cx } from "src/utils/cx";

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

    this.root.className = cx(
      "flex h-6 min-w-0 max-w-full flex-1 items-center overflow-hidden rounded-md px-1.5 transition-colors",
      options.editing ? "bg-bg-page" : "bg-transparent",
      options.className,
      options.inputFieldClassName,
    );
    this.root.title = options.title ?? "";

    this.input.value = options.editing ? options.draftValue : options.value;
    this.input.readOnly = !options.editing;
    this.input.className = cx(
      "h-full min-w-0 w-full flex-1 bg-transparent border-0 p-0 outline-none focus:outline-none focus:ring-0 text-[11px] leading-4",
      options.editing
        ? "cursor-text text-text-primary"
        : "cursor-text text-text-secondary select-text",
      options.displayClassName,
      options.inputClassName,
    );
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
