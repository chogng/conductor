import {
  Disposable,
  type IDisposable,
} from "src/cs/base/common/lifecycle";
import {
  type ITitleService,
} from "src/cs/workbench/services/title/browser/titleService";
import { shouldShowDesktopCommandBar } from "src/cs/workbench/browser/parts/titlebar/windowTitle";
import { applyWorkbenchStyle, type WorkbenchStyle } from "src/cs/workbench/browser/style";

import "src/cs/workbench/browser/media/window.css";

export type WorkbenchWindowOptions = {
  readonly className?: string;
  readonly id?: string;
  readonly showDesktopCommandBar?: boolean;
  readonly style?: WorkbenchStyle;
  readonly titleService?: ITitleService;
};

const createElement = <K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className = "",
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  return element;
};

export class WorkbenchWindow extends Disposable {
  private readonly element: HTMLElement;
  private readonly titlebarHost = createElement("div");
  private readonly body = createElement("div", "workbench_window_body");
  private readonly contentHost = createElement(
    "div",
    "workbench_window_content",
  );
  private titlebarPart: IDisposable | undefined;
  private attachedTitleService: ITitleService | undefined;

  public readonly contentElement = this.contentHost;

  constructor(
    parent: HTMLElement,
    private options: WorkbenchWindowOptions = {},
  ) {
    super();

    this.element = createElement("div");
    this.element.append(this.titlebarHost, this.body);
    this.body.append(this.contentHost);
    parent.replaceChildren(this.element);
    this.update(options);
  }

  update(options: WorkbenchWindowOptions = this.options): void {
    this.options = options;

    const {
      className = "",
      id,
      showDesktopCommandBar = shouldShowDesktopCommandBar,
      style,
      titleService,
    } = options;

    this.element.id = id ?? "";
    this.element.className =
      `workbench_window ${className}`.trim();
    applyWorkbenchStyle(this.element, style);

    this.renderTitlebar(showDesktopCommandBar, titleService);
  }

  private renderTitlebar(
    showDesktopCommandBar: boolean,
    titleService: ITitleService | undefined,
  ): void {
    if (!showDesktopCommandBar) {
      this.clearTitlebar();
      return;
    }

    if (!titleService) {
      this.clearTitlebar();
      return;
    }

    if (this.attachedTitleService !== titleService) {
      this.clearTitlebar();
      this.attachedTitleService = titleService;
      this.titlebarPart = titleService.attachTitlebarPart(this.titlebarHost);
      return;
    }
  }

  private clearTitlebar(): void {
    this.titlebarPart?.dispose();
    this.titlebarPart = undefined;
    this.attachedTitleService = undefined;
    this.titlebarHost.replaceChildren();
  }

  override dispose(): void {
    this.clearTitlebar();
    this.element.remove();
    super.dispose();
  }
}
