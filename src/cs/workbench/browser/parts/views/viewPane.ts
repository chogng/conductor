import { Disposable } from "src/cs/base/common/lifecycle";
import type { IView } from "src/cs/workbench/common/views";

import "src/cs/workbench/browser/parts/views/media/paneviewlet.css";

let viewPaneIdPool = 0;

export type ViewPaneOptions = {
  readonly bodyClassName?: string;
  readonly className?: string;
  readonly id?: string;
  readonly title: string;
};

export class ViewPane extends Disposable implements IView {
  public readonly id: string;
  public readonly body: HTMLElement;
  public readonly element: HTMLElement;

  constructor(options: ViewPaneOptions) {
    super();

    this.id = options.id ?? `workbench_view_pane_${viewPaneIdPool++}`;
    this.element = document.createElement("section");
    this.element.className = this.getElementClassName(options.className);
    this.element.setAttribute("aria-label", options.title);

    this.body = document.createElement("div");
    this.body.id = `${this.id}_body`;
    this.body.className = this.getBodyClassName(options.bodyClassName);
    this.body.tabIndex = -1;
    this.element.append(this.body);
  }

  public focus(): void {
    const focusTarget = this.body.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") ?? this.body;
    focusTarget.focus();
  }

  public layout(height: number, width: number): void {
    const nextHeight = Math.max(0, height);
    const nextWidth = Math.max(0, width);
    this.element.style.height = `${nextHeight}px`;
    this.element.style.width = `${nextWidth}px`;

    this.body.style.height = `${nextHeight}px`;
    this.body.style.width = `${nextWidth}px`;
    this.layoutBody(nextHeight, nextWidth);
  }

  public isVisible(): boolean {
    return !this.element.hidden;
  }

  public isBodyVisible(): boolean {
    return this.isVisible() && !this.body.hidden;
  }

  public setVisible(visible: boolean): boolean {
    if (this.isVisible() === visible) {
      return false;
    }

    this.element.hidden = !visible;
    return true;
  }

  public getProgressIndicator(): unknown | undefined {
    return undefined;
  }

  protected layoutBody(_height: number, _width: number): void {}

  public override dispose(): void {
    super.dispose();
    this.element.replaceChildren();
    this.element.remove();
  }

  private getElementClassName(className = ""): string {
    const classNames = ["workbench-view-pane"];
    if (className) {
      classNames.push(className);
    }
    return classNames.join(" ");
  }

  private getBodyClassName(className = ""): string {
    const classNames = ["workbench-view-pane__body"];
    if (className) {
      classNames.push(className);
    }
    return classNames.join(" ");
  }
}
