import type { Event } from "src/cs/base/common/event";
import { isNative, isWindows } from "src/cs/base/common/platform";
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
  readonly enabled?: boolean;
  readonly fileOptions?: WorkbenchTitlebarFileOption[];
  readonly isSidebarVisible?: boolean;
  readonly isUpdateReadyToInstall?: boolean;
  readonly onChartIntent?: () => void;
  readonly onFileChange?: (fileId: string) => void;
  readonly onInstallUpdate?: () => void;
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
  return {
    environment: environmentService.environment,
    isAppUpdatePreviewEnabled:
      (environmentService.isWindowsDesktop && environmentService.isPackaged) ||
      isDev,
    isDesktopChromePreviewEnabled:
      environmentService.isWindowsDesktop || isDev,
    isPackagedWindowsDesktopShell:
      environmentService.isWindowsDesktop && environmentService.isPackaged,
    isWindowsDesktopShell: environmentService.isWindowsDesktop,
  };
};

export const shouldShowDesktopCommandBar =
  typeof window !== "undefined" &&
  getWorkbenchWindowState().isWindowsDesktopShell;
