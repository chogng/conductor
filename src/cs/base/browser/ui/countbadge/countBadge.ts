import { $, append } from "src/cs/base/browser/dom";
import { Disposable, toDisposable } from "src/cs/base/common/lifecycle";

import "src/cs/base/browser/ui/countbadge/countBadge.css";

export interface ICountBadgeOptions {
  readonly count?: number;
  readonly countFormat?: string;
  readonly titleFormat?: string;
}

export interface ICountBadgeStyles {
  readonly badgeBackground: string | undefined;
  readonly badgeForeground: string | undefined;
  readonly badgeBorder: string | undefined;
}

export const unthemedCountStyles: ICountBadgeStyles = {
  badgeBackground: undefined,
  badgeForeground: undefined,
  badgeBorder: undefined,
};

export class CountBadge extends Disposable {
  private readonly element: HTMLElement;
  private count = 0;
  private countFormat: string;
  private titleFormat: string;

  constructor(
    container: HTMLElement,
    options: ICountBadgeOptions,
    private readonly styles: ICountBadgeStyles = unthemedCountStyles,
  ) {
    super();

    this.element = append(container, $(".monaco-count-badge"));
    this._register(toDisposable(() => this.element.remove()));

    this.countFormat = options.countFormat ?? "{0}";
    this.titleFormat = options.titleFormat ?? "";
    this.setCount(options.count ?? 0);
  }

  setCount(count: number): void {
    this.count = count;
    this.render();
  }

  setCountFormat(countFormat: string): void {
    this.countFormat = countFormat;
    this.render();
  }

  setTitleFormat(titleFormat: string): void {
    this.titleFormat = titleFormat;
    this.render();
  }

  private render(): void {
    const countText = String(this.count);
    this.element.textContent = formatCount(this.countFormat, countText);
    this.element.title = formatCount(this.titleFormat, countText);
    this.element.style.backgroundColor = this.styles.badgeBackground ?? "";
    this.element.style.color = this.styles.badgeForeground ?? "";
    this.element.style.border = this.styles.badgeBorder
      ? `1px solid ${this.styles.badgeBorder}`
      : "";
  }
}

const formatCount = (format: string, countText: string): string =>
  format.replaceAll("{count}", countText).replaceAll("{0}", countText);
