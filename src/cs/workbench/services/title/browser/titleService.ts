import type { Event } from "src/cs/base/common/event";
import { isMacintosh, isNative, isWindows } from "src/cs/base/common/platform";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { IWorkbenchEnvironmentService } from "src/cs/workbench/services/environment/common/environmentService";
import { getWorkbenchEnvironment } from "src/cs/workbench/services/environment/browser/environmentService";
import type { LayoutView } from "src/cs/workbench/services/layout/browser/layoutService";

export const ITitleService = createDecorator<ITitleService>("titleService");

export type WorkbenchWindowState = {
  readonly environment: IWorkbenchEnvironmentService["environment"];
  readonly isAppUpdatePreviewEnabled: boolean;
  readonly isDesktopChromePreviewEnabled: boolean;
  readonly isMacintoshDesktopShell: boolean;
  readonly isPackagedWindowsDesktopShell: boolean;
  readonly isWindowsDesktopShell: boolean;
};

export type WorkbenchTitlebarActivePage =
  | LayoutView
  | string;

export type WorkbenchTitlebarFileOption = {
  readonly value: string;
  readonly label: string;
};

export type WorkbenchTitlebarState = {
  readonly activeFileId?: string | null;
  readonly activePage?: LayoutView;
  readonly canNavigateBack?: boolean;
  readonly canNavigateForward?: boolean;
  readonly chartIntentCommandId?: string;
  readonly enabled?: boolean;
  readonly fileSelectionCommandId?: string;
  readonly fileOptions?: WorkbenchTitlebarFileOption[];
  readonly installUpdateCommandId?: string;
  readonly isSidebarVisible?: boolean;
  readonly isUpdateReadyToInstall?: boolean;
  readonly showFileSelector?: boolean;
  readonly updateVersion?: string | null;
};

export interface ITitleService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeTitlebarState: Event<void>;

  attachTitlebarPart(parent: HTMLElement): IDisposable;
  getTitlebarState(): WorkbenchTitlebarState | undefined;
  layout(): void;
  updateTitlebarState(state?: WorkbenchTitlebarState): void;
}

const snapshotEnvironmentService: IWorkbenchEnvironmentService = {
  _serviceBrand: undefined,
  get environment() {
    return getWorkbenchEnvironment();
  },
  get isDesktop() {
    return this.environment?.isDesktop === true;
  },
  get isWindowsDesktop() {
    if (this.environment) {
      return this.environment.isDesktop === true && this.environment.platform === "win32";
    }

    return isNative && isWindows;
  },
  get isPackaged() {
    return this.environment?.isPackaged === true;
  },
};

const isWorkbenchDevMode = (): boolean =>
  (import.meta as ImportMeta & {
    readonly env?: { readonly DEV?: boolean };
  }).env?.DEV === true;

export const getWorkbenchWindowState = (
  environmentService: IWorkbenchEnvironmentService = snapshotEnvironmentService,
): WorkbenchWindowState => {
  const isDev = isWorkbenchDevMode();
  const environment = environmentService.environment;
  const isMacintoshDesktopShell = environment
    ? environment.isDesktop === true && environment.platform === "darwin"
    : isNative && isMacintosh;
  const isWindowsDesktopShell = environmentService.isWindowsDesktop;
  return {
    environment,
    isAppUpdatePreviewEnabled:
      (isWindowsDesktopShell && environmentService.isPackaged) ||
      isDev,
    isDesktopChromePreviewEnabled:
      isMacintoshDesktopShell || isWindowsDesktopShell || isDev,
    isMacintoshDesktopShell,
    isPackagedWindowsDesktopShell:
      isWindowsDesktopShell && environmentService.isPackaged,
    isWindowsDesktopShell,
  };
};

export const shouldShowDesktopCommandBar =
  typeof window !== "undefined" &&
  getWorkbenchWindowState().isDesktopChromePreviewEnabled;
