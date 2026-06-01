import { Disposable } from "src/cs/base/common/lifecycle";
import {
  WorkbenchTitlebarPart,
  type WorkbenchTitlebarProps,
} from "src/cs/workbench/browser/parts/titlebar/titlebarPart";
import { renderWorkbenchTitlebarSkeleton } from "src/cs/workbench/browser/parts/titlebar/titlebarSkeleton";
import { applyWorkbenchStyle, type WorkbenchStyle } from "src/cs/workbench/browser/style";
import { getWorkbenchEnvironment } from "src/cs/workbench/services/environment/browser/environmentService";
import type { IWorkbenchEnvironmentService } from "src/cs/workbench/services/environment/common/environmentService";

import "src/cs/workbench/browser/media/window.css";

export type WorkbenchWindowState = {
  readonly environment: IWorkbenchEnvironmentService["environment"];
  readonly isAppUpdatePreviewEnabled: boolean;
  readonly isDesktopChromePreviewEnabled: boolean;
  readonly isPackagedWindowsDesktopShell: boolean;
  readonly isWindowsDesktopShell: boolean;
};

export type WorkbenchWindowOptions = {
  readonly className?: string;
  readonly id?: string;
  readonly showDesktopCommandBar?: boolean;
  readonly showSkeleton?: boolean;
  readonly style?: WorkbenchStyle;
  readonly titlebarState?: WorkbenchTitlebarProps;
};

const snapshotEnvironmentService: IWorkbenchEnvironmentService = {
  _serviceBrand: undefined,
  get environment() {
    return getWorkbenchEnvironment();
  },
  get isDesktop() {
    return this.environment?.isDesktop === true;
  },
  get isWindowsDesktop() {
    return this.environment?.isDesktop === true && this.environment.platform === "win32";
  },
  get isPackaged() {
    return this.environment?.isPackaged === true;
  },
};

export const getWorkbenchWindowState = (
  environmentService: IWorkbenchEnvironmentService = snapshotEnvironmentService,
): WorkbenchWindowState => {
  return {
    environment: environmentService.environment,
    isAppUpdatePreviewEnabled:
      (environmentService.isWindowsDesktop && environmentService.isPackaged) ||
      import.meta.env.DEV,
    isDesktopChromePreviewEnabled:
      environmentService.isWindowsDesktop || import.meta.env.DEV,
    isPackagedWindowsDesktopShell:
      environmentService.isWindowsDesktop && environmentService.isPackaged,
    isWindowsDesktopShell: environmentService.isWindowsDesktop,
  };
};

export const shouldShowDesktopCommandBar =
  typeof window !== "undefined" &&
  getWorkbenchWindowState().isWindowsDesktopShell;

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
  private titlebarPart: WorkbenchTitlebarPart | undefined;
  private clearTitlebarSkeleton: (() => void) | undefined;

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
      titlebarState,
    } = options;

    this.element.id = id ?? "";
    this.element.className =
      `workbench_window ${className}`.trim();
    applyWorkbenchStyle(this.element, style);

    this.renderTitlebar(showDesktopCommandBar, titlebarState);
    this.renderSkeleton(showSkeleton, showDesktopCommandBar);
  }

  private renderTitlebar(
    showDesktopCommandBar: boolean,
    titlebarState: WorkbenchTitlebarProps | undefined,
  ): void {
    if (!showDesktopCommandBar) {
      this.clearTitlebar();
      return;
    }

    if (!titlebarState) {
      this.titlebarPart?.dispose();
      this.titlebarPart = undefined;

      if (!this.clearTitlebarSkeleton) {
        this.clearTitlebarSkeleton = renderWorkbenchTitlebarSkeleton(
          this.titlebarHost,
        );
      }
      return;
    }

    this.clearTitlebarSkeleton?.();
    this.clearTitlebarSkeleton = undefined;

    this.titlebarPart ??= new WorkbenchTitlebarPart(this.titlebarHost);
    this.titlebarPart.update(titlebarState);
    this.titlebarPart.layout();
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
    this.clearTitlebarSkeleton?.();
    this.clearTitlebarSkeleton = undefined;
    this.titlebarPart?.dispose();
    this.titlebarPart = undefined;
    this.titlebarHost.replaceChildren();
  }

  override dispose(): void {
    this.clearTitlebar();
    this.element.remove();
    super.dispose();
  }
}
