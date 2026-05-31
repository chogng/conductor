import { Disposable } from "src/cs/base/common/lifecycle";
import {
  WorkbenchTitlebarPart,
  type WorkbenchTitlebarProps,
} from "src/cs/workbench/browser/parts/titlebar/titlebarPart";
import { renderWorkbenchTitlebarSkeleton } from "src/cs/workbench/browser/parts/titlebar/titlebarSkeleton";
import { applyWorkbenchStyle, type WorkbenchStyle } from "src/cs/workbench/browser/style";
import { getWorkbenchEnvironment } from "src/cs/workbench/services/environment/browser/environmentService";
import type { IWorkbenchEnvironmentService } from "src/cs/workbench/services/environment/common/environmentService";

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
      "absolute inset-0 min-h-0 opacity-100 pointer-events-none",
    ),
    [
      appendChildren(
        createElement(
          "div",
          `h-full min-h-0 overflow-hidden ${
            showDesktopCommandBar ? "p-1 pt-0" : "p-1"
          }`,
        ),
        [
          appendChildren(
            createElement(
              "div",
              "grid h-full min-h-0 grid-cols-[var(--sidebar-width,280px)_minmax(0,1fr)] gap-1",
            ),
            [
              appendChildren(
                createElement(
                  "div",
                  "rounded-[20px] border border-border bg-bg-surface/70 p-4 flex min-h-0 flex-col",
                ),
                [
                  appendChildren(
                    createElement(
                      "div",
                      "mb-4 flex items-center justify-between gap-2",
                    ),
                    [
                      createElement(
                        "div",
                        "h-10 w-40 rounded-xl border border-border bg-bg-page/70",
                      ),
                      createElement(
                        "div",
                        "h-10 w-10 rounded-xl border border-border bg-bg-page/70",
                      ),
                    ],
                  ),
                  createElement("div", "mb-4 h-4 w-28 rounded bg-bg-page/70"),
                  createElement(
                    "div",
                    "flex-1 rounded-[20px] border border-border bg-bg-page/60",
                  ),
                ],
              ),
              appendChildren(
                createElement(
                  "div",
                  "rounded-[20px] border border-border bg-bg-surface/60 pt-4 pr-4 pb-4 pl-0 flex min-h-0",
                ),
                [
                  appendChildren(
                    createElement("div", "flex min-h-0 flex-1 flex-col pl-4"),
                    [
                      createElement(
                        "div",
                        "flex-1 min-h-0 rounded-[16px] border border-border bg-bg-page/75",
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
  private readonly body = createElement("div", "relative flex-1 min-h-0");
  private readonly skeletonHost = createElement("div");
  private readonly contentHost = createElement(
    "div",
    "relative z-[1] flex h-full min-h-0 flex-col",
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
      `flex h-full min-h-screen flex-col overflow-hidden bg-bg-page ${className}`.trim();
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
