import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { LxIcon } from "src/cs/base/common/lxicon";

export type IIconLabelCreationOptions = {
  readonly className?: string;
};

export type IIconLabelValueOptions = {
  readonly extraClasses?: readonly string[];
  readonly icon?: LxIcon;
  readonly title?: string;
};

export class IconLabel implements IDisposable {
  private static readonly rootClassName = "conductor-icon-label";
  private static readonly iconClassName = "conductor-icon-label-icon";
  private static readonly nameClassName = "conductor-icon-label-name";

  readonly element: HTMLDivElement;
  private readonly className: string;
  private icon: HTMLSpanElement;
  private readonly name: HTMLSpanElement;
  private disposed = false;

  constructor(container: HTMLElement, options: IIconLabelCreationOptions = {}) {
    this.className = options.className ?? "";
    this.element = document.createElement("div");
    this.element.className = this.className
      ? `${IconLabel.rootClassName} ${this.className}`
      : IconLabel.rootClassName;

    this.icon = this.createIcon();

    this.name = document.createElement("span");
    this.name.className = IconLabel.nameClassName;

    this.element.append(this.icon, this.name);
    container.appendChild(this.element);
  }

  setLabel(label: string, options: IIconLabelValueOptions = {}): void {
    const classes = [IconLabel.rootClassName];
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

    const icon = this.createIcon(options.icon);
    this.icon.replaceWith(icon);
    this.icon = icon;
  }

  clear(): void {
    this.name.textContent = "";
    const icon = this.createIcon();
    this.icon.replaceWith(icon);
    this.icon = icon;
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

  private createIcon(icon?: LxIcon): HTMLSpanElement {
    const element = icon
      ? createLxIcon({ className: IconLabel.iconClassName, icon })
      : document.createElement("span");
    if (!icon) {
      element.className = IconLabel.iconClassName;
    }
    element.setAttribute("aria-hidden", "true");
    return element;
  }
}
