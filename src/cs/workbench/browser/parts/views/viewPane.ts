import { addDisposableListener } from "src/cs/base/browser/dom";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { Emitter, type Event } from "src/cs/base/common/event";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";
import type { IView } from "src/cs/workbench/common/views";

import "src/cs/workbench/browser/parts/views/media/viewPane.css";

let viewPaneIdPool = 0;

export type ViewPaneOptions = {
  readonly bodyClassName?: string;
  readonly className?: string;
  readonly collapsed?: boolean;
  readonly headerClassName?: string;
  readonly headerVisible?: boolean;
  readonly id?: string;
  readonly title: string;
  readonly titleClassName?: string;
};

export class ViewPane implements IView {
  public readonly id: string;
  public readonly body: HTMLElement;
  public readonly element: HTMLElement;
  public readonly onDidChangeCollapsed: Event<boolean>;
  private readonly disposables = new DisposableStore();
  private readonly header: HTMLButtonElement;
  private readonly onDidChangeCollapsedEmitter = new Emitter<boolean>();
  private collapsed: boolean;

  constructor(options: ViewPaneOptions) {
    this.collapsed = Boolean(options.collapsed);
    this.onDidChangeCollapsed = this.onDidChangeCollapsedEmitter.event;

    this.id = options.id ?? `workbench_view_pane_${viewPaneIdPool++}`;
    this.element = document.createElement("section");
    this.element.className = this.getElementClassName(options.className, options.headerVisible !== false);
    this.element.dataset.collapsed = this.collapsed ? "true" : "false";

    this.header = document.createElement("button");
    this.header.type = "button";
    this.header.className = this.getHeaderClassName(options.headerClassName);
    this.header.setAttribute("aria-expanded", String(!this.collapsed));
    this.header.setAttribute("aria-controls", `${this.id}_body`);

    const icon = document.createElement("span");
    icon.className = "workbench-view-pane__twisty";
    icon.setAttribute("aria-hidden", "true");
    icon.append(createLxIcon({ icon: LxIcon.chevronRight, size: 14 }));

    const title = document.createElement("span");
    title.className = this.getTitleClassName(options.titleClassName);
    title.textContent = options.title;

    this.body = document.createElement("div");
    this.body.id = `${this.id}_body`;
    this.body.className = this.getBodyClassName(options.bodyClassName);
    this.body.hidden = this.collapsed;

    this.disposables.add(addDisposableListener(this.header, "click", () => {
      this.setExpanded(this.collapsed);
    }));
    this.disposables.add(this.onDidChangeCollapsedEmitter);

    this.header.append(icon, title);
    if (options.headerVisible === false) {
      this.body.tabIndex = -1;
      this.element.append(this.body);
    } else {
      this.element.append(this.header, this.body);
    }
  }

  public isCollapsed(): boolean {
    return this.collapsed;
  }

  public focus(): void {
    const focusTarget = this.element.contains(this.header)
      ? this.header
      : this.body.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") ?? this.body;
    focusTarget.focus();
  }

  public layout(height: number, width: number): void {
    const nextHeight = Math.max(0, height);
    const nextWidth = Math.max(0, width);
    this.element.style.height = `${nextHeight}px`;
    this.element.style.width = `${nextWidth}px`;

    const headerHeight = this.element.contains(this.header)
      ? this.header.getBoundingClientRect().height
      : 0;
    const bodyHeight = this.collapsed ? 0 : Math.max(0, nextHeight - headerHeight);
    this.body.style.height = `${bodyHeight}px`;
    this.body.style.width = `${nextWidth}px`;
    if (!this.collapsed) {
      this.layoutBody(bodyHeight, nextWidth);
    }
  }

  public isVisible(): boolean {
    return !this.element.hidden;
  }

  public isBodyVisible(): boolean {
    return this.isVisible() && !this.body.hidden;
  }

  public setExpanded(expanded: boolean): boolean {
    return this.setCollapsed(!expanded);
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

  public setCollapsed(collapsed: boolean): boolean {
    if (this.collapsed === collapsed) {
      return false;
    }

    this.collapsed = collapsed;
    this.body.hidden = collapsed;
    this.element.dataset.collapsed = collapsed ? "true" : "false";
    this.header.setAttribute("aria-expanded", String(!collapsed));
    this.layout(this.element.clientHeight, this.element.clientWidth);
    this.onDidChangeCollapsedEmitter.fire(collapsed);
    return true;
  }

  protected layoutBody(_height: number, _width: number): void {}

  public dispose(): void {
    this.disposables.dispose();
    this.element.replaceChildren();
    this.element.remove();
  }

  private getElementClassName(className = "", hasHeader = true): string {
    const classNames = ["workbench-view-pane"];
    if (!hasHeader) {
      classNames.push("workbench-view-pane--headerless");
    }
    if (className) {
      classNames.push(className);
    }
    return classNames.join(" ");
  }

  private getHeaderClassName(className = ""): string {
    const classNames = ["workbench-view-pane__header"];
    if (className) {
      classNames.push(className);
    }
    return classNames.join(" ");
  }

  private getTitleClassName(className = ""): string {
    const classNames = ["workbench-view-pane__title"];
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
