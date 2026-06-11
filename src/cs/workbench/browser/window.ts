import {
  Disposable,
  type IDisposable,
} from "src/cs/base/common/lifecycle";
import {
  shouldShowDesktopCommandBar,
  type ITitleService,
} from "src/cs/workbench/services/title/browser/titleService";
import { applyWorkbenchStyle, type WorkbenchStyle } from "src/cs/workbench/browser/style";

import "src/cs/workbench/browser/media/window.css";

export type WorkbenchWindowOptions = {
  readonly className?: string;
  readonly id?: string;
  readonly showDesktopCommandBar?: boolean;
  readonly showSkeleton?: boolean;
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

const appendChildren = <T extends HTMLElement>(
  parent: T,
  children: HTMLElement[],
): T => {
  for (const child of children) {
    parent.appendChild(child);
  }

  return parent;
};

const createSkeleton = (showDesktopCommandBar: boolean): HTMLElement =>
  appendChildren(
    createElement(
      "section",
      "workbench_window_skeleton",
    ),
    [
      appendChildren(
        createElement(
          "div",
          showDesktopCommandBar
            ? "workbench_window_skeleton_body workbench_window_skeleton_body--desktop-command-bar"
            : "workbench_window_skeleton_body",
        ),
        [
          appendChildren(
            createElement(
              "div",
              "workbench_window_skeleton_grid",
            ),
            [
              appendChildren(
                createElement(
                  "div",
                  "workbench_window_skeleton_sidebar",
                ),
                [
                  appendChildren(
                    createElement(
                      "div",
                      "workbench_window_skeleton_sidebar_header",
                    ),
                    [
                      createElement(
                        "div",
                        "workbench_window_skeleton_sidebar_action",
                      ),
                      createElement(
                        "div",
                        "workbench_window_skeleton_sidebar_icon",
                      ),
                    ],
                  ),
                  createElement("div", "workbench_window_skeleton_sidebar_label"),
                  createElement(
                    "div",
                    "workbench_window_skeleton_sidebar_dropzone",
                  ),
                ],
              ),
              appendChildren(
                createElement(
                  "div",
                  "workbench_window_skeleton_content",
                ),
                [
                  appendChildren(
                    createElement("div", "workbench_window_skeleton_content_inner"),
                    [
                      createElement(
                        "div",
                        "workbench_window_skeleton_content_panel",
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );

export class WorkbenchWindow extends Disposable {
  private readonly element: HTMLElement;
  private readonly titlebarHost = createElement("div");
  private readonly body = createElement("div", "workbench_window_body");
  private readonly skeletonHost = createElement("div");
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
    this.body.append(this.skeletonHost, this.contentHost);
    parent.replaceChildren(this.element);
    this.update(options);
  }

  update(options: WorkbenchWindowOptions = this.options): void {
    this.options = options;

    const {
      className = "",
      id,
      showDesktopCommandBar = shouldShowDesktopCommandBar,
      showSkeleton = true,
      style,
      titleService,
    } = options;

    this.element.id = id ?? "";
    this.element.className =
      `workbench_window ${className}`.trim();
    applyWorkbenchStyle(this.element, style);

    this.renderTitlebar(showDesktopCommandBar, titleService);
    this.renderSkeleton(showSkeleton, showDesktopCommandBar);
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
    }

    titleService.layout();
  }

  private renderSkeleton(
    showSkeleton: boolean,
    showDesktopCommandBar: boolean,
  ): void {
    if (!showSkeleton) {
      this.skeletonHost.replaceChildren();
      return;
    }

    this.skeletonHost.replaceChildren(createSkeleton(showDesktopCommandBar));
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
