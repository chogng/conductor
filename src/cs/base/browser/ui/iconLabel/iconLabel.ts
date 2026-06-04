import { normalizeLxIconSvgMarkup } from "src/cs/base/browser/ui/lxicon/lxiconMarkup";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { LxIconDefinition } from "src/cs/base/common/lxicon";

export type IIconLabelCreationOptions = {
  readonly className?: string;
};

export type IIconLabelValueOptions = {
  readonly extraClasses?: readonly string[];
  readonly icon?: LxIconDefinition;
  readonly title?: string;
};

export class IconLabel implements IDisposable {
  readonly element: HTMLDivElement;
  private readonly className: string;
  private readonly icon: HTMLSpanElement;
  private readonly name: HTMLSpanElement;
  private disposed = false;

  constructor(container: HTMLElement, options: IIconLabelCreationOptions = {}) {
    this.className = options.className ?? "";
    this.element = document.createElement("div");
    this.element.className = this.className
      ? `monaco-icon-label ${this.className}`
      : "monaco-icon-label";

    this.icon = document.createElement("span");
    this.icon.className = "monaco-icon-label-icon";
    this.icon.setAttribute("aria-hidden", "true");

    this.name = document.createElement("span");
    this.name.className = "monaco-icon-label-name";

    this.element.append(this.icon, this.name);
    container.appendChild(this.element);
  }

  setLabel(label: string, options: IIconLabelValueOptions = {}): void {
    const classes = ["monaco-icon-label"];
    if (this.className) {
      classes.push(this.className);
    }
    for (const className of options.extraClasses ?? []) {
      classes.push(className);
    }
    this.element.className = classes.join(" ");
    this.name.textContent = label;
    this.element.setAttribute("aria-label", label);

    if (options.title) {
      this.element.title = options.title;
    } else {
      this.element.removeAttribute("title");
    }

    this.icon.replaceChildren();
    if (options.icon) {
      this.icon.innerHTML = normalizeLxIconSvgMarkup(options.icon);
    }
  }

  clear(): void {
    this.name.textContent = "";
    this.icon.replaceChildren();
    this.element.removeAttribute("aria-label");
    this.element.removeAttribute("title");
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.element.remove();
  }
}
