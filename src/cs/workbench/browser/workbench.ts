import { jsx, jsxs } from "react/jsx-runtime";
import type { CSSProperties } from "react";
import { layoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { LayoutView } from "src/cs/workbench/browser/layout";
import type { DeviceAnalysisPageParts } from "src/cs/workbench/browser/parts";
import type { WorkbenchTitlebarProps } from "src/cs/workbench/browser/parts/titlebar/titlebarPart";
import WorkbenchWorkspace from "src/cs/workbench/contrib/workspace/WorkbenchWorkspace";
import WorkspaceShell from "src/cs/workbench/contrib/workspace/WorkspaceShell";
import { getWorkbenchEnvironment } from "src/cs/workbench/services/environment/browser/environmentService";

export type DeviceAnalysisWorkbenchTitlebarState = {
  readonly enabled?: boolean;
  readonly activePage: LayoutView;
  readonly analysisActiveFileId?: string | null;
  readonly analysisFileOptions?: WorkbenchTitlebarProps["analysisFileOptions"];
  readonly canNavigateBack?: boolean;
  readonly canNavigateForward?: boolean;
  readonly onAnalysisFileChange?: (fileId: string) => void;
  readonly onAnalysisIntent?: () => void;
  readonly onCloseWindow?: () => void;
  readonly onMinimizeWindow?: () => void;
  readonly onNavigateBack?: () => void;
  readonly onNavigateForward?: () => void;
  readonly onOpenSettings?: () => void;
  readonly onPageChange?: (page: "data" | "analysis") => void;
  readonly onToggleMaximizeWindow?: () => void;
  readonly showAnalysisFileSelector?: boolean;
  readonly t: TranslateFn;
  readonly updateVersion?: string | null;
  readonly isUpdateReadyToInstall?: boolean;
  readonly onInstallUpdate?: () => void;
};

export const getWorkbenchShellFlags = () => {
  const environment = getWorkbenchEnvironment();
  const isWindowsDesktopShell =
    environment?.isDesktop === true && environment?.platform === "win32";
  const isPackagedWindowsDesktopShell =
    isWindowsDesktopShell && environment?.isPackaged === true;

  return {
    environment,
    isAppUpdatePreviewEnabled:
      isPackagedWindowsDesktopShell || import.meta.env.DEV,
    isDesktopChromePreviewEnabled: isWindowsDesktopShell || import.meta.env.DEV,
    isPackagedWindowsDesktopShell,
    isWindowsDesktopShell,
  };
};

type DeviceAnalysisWorkbenchProps = {
  readonly activeView: LayoutView;
  readonly className?: string;
  readonly id?: string;
  readonly parts: DeviceAnalysisPageParts;
  readonly showDesktopCommandBar?: boolean;
  readonly showSkeleton?: boolean;
  readonly style?: CSSProperties;
  readonly titlebarState?: DeviceAnalysisWorkbenchTitlebarState;
};

export const buildDeviceAnalysisWorkbenchTitlebarState = (
  state: DeviceAnalysisWorkbenchTitlebarState | undefined,
): WorkbenchTitlebarProps | undefined =>
  state && state.enabled !== false
    ? {
        id: layoutService.elements.titlebarCommandBar,
        activePage: state.activePage,
        analysisActiveFileId: state.analysisActiveFileId,
        analysisFileOptions: state.analysisFileOptions,
        canNavigateBack: state.canNavigateBack,
        canNavigateForward: state.canNavigateForward,
        onAnalysisFileChange: state.onAnalysisFileChange,
        onAnalysisIntent: state.onAnalysisIntent,
        onCloseWindow: state.onCloseWindow,
        onMinimizeWindow: state.onMinimizeWindow,
        onNavigateBack: state.onNavigateBack,
        onNavigateForward: state.onNavigateForward,
        onOpenSettings: state.onOpenSettings,
        onPageChange: state.onPageChange,
        onToggleMaximizeWindow: state.onToggleMaximizeWindow,
        showAnalysisFileSelector: state.showAnalysisFileSelector,
        t: state.t,
        updateAction: {
          isVisible: Boolean(state.isUpdateReadyToInstall),
          isReadyToInstall: state.isUpdateReadyToInstall,
          version: state.updateVersion,
          onClick: state.onInstallUpdate,
        },
      }
    : undefined;

const DeviceAnalysisWorkbench = ({
  activeView,
  className,
  id,
  parts,
  showDesktopCommandBar,
  showSkeleton,
  style,
  titlebarState,
}: DeviceAnalysisWorkbenchProps) =>
  jsx(WorkspaceShell, {
    id,
    className,
    showDesktopCommandBar,
    showSkeleton,
    style,
    titlebarState: buildDeviceAnalysisWorkbenchTitlebarState(titlebarState),
    children: jsxs("div", {
      className: "relative flex flex-1 min-h-0 flex-col",
      children: [
        parts.controller ?? null,
        jsx(WorkbenchWorkspace, {
          activeView,
          dataSidebar: parts.dataSidebar,
          children: parts.workspace,
        }),
        parts.overlay ?? null,
      ],
    }),
  });

export default DeviceAnalysisWorkbench;
