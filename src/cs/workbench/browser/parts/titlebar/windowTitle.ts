import { Emitter } from "src/cs/base/common/event";
import {
  Disposable,
  DisposableStore,
  type IDisposable,
} from "src/cs/base/common/lifecycle";
import { isMacintosh, isNative, isWindows } from "src/cs/base/common/platform";
import { ICommandService } from "src/cs/platform/commands/common/commands";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { INativeHostService } from "src/cs/platform/native/common/native";
import {
  IWorkbenchLayoutService,
  Parts,
} from "src/cs/workbench/services/layout/browser/layoutService";
import type { IWorkbenchEnvironmentService } from "src/cs/workbench/services/environment/common/environmentService";
import { getWorkbenchEnvironment } from "src/cs/workbench/services/environment/browser/environmentService";
import {
  ITitleService,
  type WorkbenchTitlebarActivePage,
  type WorkbenchTitlebarState,
} from "src/cs/workbench/services/title/browser/titleService";
import {
  WORKBENCH_TITLEBAR_ID,
  WorkbenchTitlebarPart,
} from "src/cs/workbench/browser/parts/titlebar/titlebarPart";

export type WorkbenchWindowState = {
  readonly environment: IWorkbenchEnvironmentService["environment"];
  readonly isAppUpdatePreviewEnabled: boolean;
  readonly isDesktopChromePreviewEnabled: boolean;
  readonly isMacintoshDesktopShell: boolean;
  readonly isPackagedWindowsDesktopShell: boolean;
  readonly isWindowsDesktopShell: boolean;
};

export type WorkbenchTitlebarWindowControlsSide = "left" | "right";

export type WorkbenchTitlebarChrome = {
  readonly showBrandIcon?: boolean;
  readonly windowControlsSide?: WorkbenchTitlebarWindowControlsSide;
};

export type WorkbenchTitlebarUpdateAction = {
  readonly commandId?: string;
  readonly isVisible: boolean;
  readonly isReadyToInstall?: boolean;
  readonly label?: string | null;
  readonly progressPercent?: number | null;
  readonly tooltip?: string | null;
  readonly version?: string | null;
};

export type WorkbenchTitlebarProps = Omit<WorkbenchTitlebarState, "activePage"> & {
  readonly activePage: WorkbenchTitlebarActivePage;
  readonly chrome?: WorkbenchTitlebarChrome;
  readonly commandService?: ICommandService;
  readonly id?: string;
  readonly nativeHostService?: INativeHostService;
  readonly updateAction?: WorkbenchTitlebarUpdateAction;
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

export const getWorkbenchTitlebarChrome = (
  windowState: WorkbenchWindowState,
): WorkbenchTitlebarChrome => {
  if (windowState.isMacintoshDesktopShell) {
    return {
      showBrandIcon: false,
      windowControlsSide: "left",
    };
  }

  if (windowState.isWindowsDesktopShell) {
    return {
      showBrandIcon: true,
      windowControlsSide: "right",
    };
  }

  return {};
};

export class BrowserTitleService extends Disposable implements ITitleService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeTitlebarStateEmitter =
    this._register(new Emitter<void>());
  private titlebarState: WorkbenchTitlebarState = {};

  public readonly onDidChangeTitlebarState =
    this.onDidChangeTitlebarStateEmitter.event;

  public constructor(
    @ICommandService private readonly commandService: ICommandService,
    @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
    @INativeHostService private readonly nativeHostService: INativeHostService,
  ) {
    super();

    this._register(this.layoutService.onDidChangeWorkbenchNavigation(() => {
      this.onDidChangeTitlebarStateEmitter.fire();
    }));
    this._register(this.layoutService.onDidChangePartVisibility(event => {
      if (event.partId === Parts.SIDEBAR_PART) {
        this.onDidChangeTitlebarStateEmitter.fire();
      }
    }));
  }

  public attachTitlebarPart(parent: HTMLElement): IDisposable {
    const disposables = new DisposableStore();
    const part = new WorkbenchTitlebarPart(parent);
    const render = (): void => {
      const props = this.getTitlebarProps();
      if (!props) {
        part.clear();
        return;
      }

      part.update(props);
      part.layout();
    };

    render();
    disposables.add(this.onDidChangeTitlebarState(render));
    disposables.add(part);

    return disposables;
  }

  public getTitlebarState(): WorkbenchTitlebarState | undefined {
    const state = this.titlebarState;
    const navigation = this.layoutService.getWorkbenchNavigationState();
    const windowState = getWorkbenchWindowState();
    const enabled = state.enabled ?? windowState.isDesktopChromePreviewEnabled;

    if (!enabled) {
      return undefined;
    }

    return {
      activeFileId: state.activeFileId,
      activePage: state.activePage ?? navigation.activeMainPart,
      canNavigateBack:
        state.canNavigateBack ?? navigation.historyIndex > 0,
      canNavigateForward:
        state.canNavigateForward ??
        navigation.historyIndex < navigation.historyLength - 1,
      chartIntentCommandId: state.chartIntentCommandId,
      fileSelectionCommandId: state.fileSelectionCommandId,
      fileOptions: state.fileOptions,
      installUpdateCommandId: state.installUpdateCommandId,
      isSidebarVisible:
        state.isSidebarVisible ??
        this.layoutService.isVisible(Parts.SIDEBAR_PART),
      isUpdateReadyToInstall: state.isUpdateReadyToInstall,
      isUpdateVisible: state.isUpdateVisible,
      showFileSelector: state.showFileSelector,
      updateCommandId: state.updateCommandId,
      updateLabel: state.updateLabel,
      updateProgressPercent: state.updateProgressPercent,
      updateTooltip: state.updateTooltip,
      updateVersion: state.updateVersion,
    };
  }

  private getTitlebarProps(): WorkbenchTitlebarProps | undefined {
    const state = this.getTitlebarState();

    if (!state) {
      return undefined;
    }

    const windowState = getWorkbenchWindowState();
    return {
      ...state,
      activePage: state.activePage ?? "table",
      id: WORKBENCH_TITLEBAR_ID,
      chrome: getWorkbenchTitlebarChrome(windowState),
      commandService: this.commandService,
      nativeHostService: this.nativeHostService,
      updateAction: {
        commandId: state.updateCommandId ?? state.installUpdateCommandId ?? undefined,
        isVisible: Boolean(state.isUpdateVisible ?? state.isUpdateReadyToInstall),
        isReadyToInstall: state.isUpdateReadyToInstall,
        label: state.updateLabel,
        progressPercent: state.updateProgressPercent,
        tooltip: state.updateTooltip,
        version: state.updateVersion,
      },
    };
  }

  public layout(): void {
    this.onDidChangeTitlebarStateEmitter.fire();
  }

  public patchTitlebarState(state: WorkbenchTitlebarState): void {
    this.titlebarState = {
      ...this.titlebarState,
      ...state,
    };
    this.onDidChangeTitlebarStateEmitter.fire();
  }

  public updateTitlebarState(state: WorkbenchTitlebarState = {}): void {
    this.titlebarState = state;
    this.onDidChangeTitlebarStateEmitter.fire();
  }
}

registerSingleton(
  ITitleService,
  BrowserTitleService,
  InstantiationType.Delayed,
);
