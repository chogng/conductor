import {
  ArrowLeft,
  ArrowRight,
  BarChart2,
  Import,
  Minus,
  Settings,
  Square,
  X,
} from "lucide-react";
import originIcon from "../../../assets/icons/origin.svg";
import DropdownField from "cs/base/browser/ui/DropdownField/DropdownField";
import type { TranslateFn } from "../../../context/language";
import {
  createWorkbenchTitlebarNavActions,
  createWorkbenchTitlebarPageActions,
  createWorkbenchTitlebarWindowActions,
  getWorkbenchTitlebarUpdateLabel,
  getWorkbenchTitlebarUpdateTitle,
  normalizeWorkbenchTitlebarAnalysisFileOptions,
  WORKBENCH_TITLEBAR_APP_ICON_SRC,
  WORKBENCH_TITLEBAR_DRAG_REGION_STYLE,
  type WorkbenchTitlebarActivePage,
  type WorkbenchTitlebarAnalysisFileOption,
  type WorkbenchTitlebarUpdateAction,
} from "../../../workbench/browser/parts/titlebar/titlebarPart";

type DesktopCommandBarProps = {
  t: TranslateFn;
  activePage: WorkbenchTitlebarActivePage;
  canNavigateBack?: boolean;
  canNavigateForward?: boolean;
  onAnalysisIntent?: () => void;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
  onPageChange?: (page: "data" | "analysis") => void;
  onMinimizeWindow?: () => void;
  onToggleMaximizeWindow?: () => void;
  onCloseWindow?: () => void;
  onOpenSettings?: () => void;
  onOpenOrigin?: () => void;
  updateAction?: WorkbenchTitlebarUpdateAction;
  showAnalysisFileSelector?: boolean;
  analysisFileOptions?: WorkbenchTitlebarAnalysisFileOption[];
  analysisActiveFileId?: string | null;
  onAnalysisFileChange?: (fileId: string) => void;
};

const DesktopCommandBar = ({
  t,
  activePage,
  canNavigateBack = false,
  canNavigateForward = false,
  onAnalysisIntent,
  onNavigateBack,
  onNavigateForward,
  onPageChange,
  onMinimizeWindow,
  onToggleMaximizeWindow,
  onCloseWindow,
  onOpenSettings,
  onOpenOrigin,
  updateAction,
  showAnalysisFileSelector = false,
  analysisFileOptions = [],
  analysisActiveFileId = null,
  onAnalysisFileChange,
}: DesktopCommandBarProps) => {
  const normalizedAnalysisFileOptions =
    normalizeWorkbenchTitlebarAnalysisFileOptions(analysisFileOptions);
  const shouldShowAnalysisFileSelector =
    showAnalysisFileSelector && normalizedAnalysisFileOptions.length > 0;
  const shouldShowUpdateAction = updateAction?.isVisible === true;
  const updateActionLabel = getWorkbenchTitlebarUpdateLabel(t);
  const updateActionTitle = getWorkbenchTitlebarUpdateTitle(t, updateAction);
  const navActions = createWorkbenchTitlebarNavActions(
    t,
    canNavigateBack,
    canNavigateForward,
  );
  const pageActions = createWorkbenchTitlebarPageActions(t, activePage);
  const windowActions = createWorkbenchTitlebarWindowActions(t);

  return (
    <header
      id="device-analysis-desktop-command-bar"
      className="da_top_menu_bar"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="da_top_menu_brand">
        <img
          src={WORKBENCH_TITLEBAR_APP_ICON_SRC}
          alt=""
          aria-hidden="true"
          className="da_top_menu_brand_icon"
        />
      </div>

      <div className="da_window_controls ml-4">
        {navActions.map((action) => (
          <button
            key={action.id}
            id={action.id}
            type="button"
            aria-label={action.title}
            title={action.title}
            className="da_window_icon_btn"
            onClick={
              action.id === "device-analysis-window-nav-back-btn"
                ? onNavigateBack
                : onNavigateForward
            }
            disabled={action.isDisabled}
          >
            {action.id === "device-analysis-window-nav-back-btn" ? (
              <ArrowLeft size={14} className="opacity-80" />
            ) : (
              <ArrowRight size={14} className="opacity-80" />
            )}
          </button>
        ))}
      </div>

      <div
        className="da_top_menu_center"
        style={WORKBENCH_TITLEBAR_DRAG_REGION_STYLE}
      >
        {shouldShowAnalysisFileSelector ? (
          <div className="da_top_menu_center_file_select">
            <DropdownField
              id="device-analysis-window-file-select"
              size="md"
              value={analysisActiveFileId ?? ""}
              onChange={(next) => onAnalysisFileChange?.(String(next))}
              options={normalizedAnalysisFileOptions}
              className="da-neutral-select"
              align="center"
              stableWidth={false}
              data-cta="Device Analysis"
              data-cta-position="titlebar-file-select"
              data-cta-copy="titlebar file select"
              hideChevron
            />
          </div>
        ) : null}
      </div>

      <div className="da_window_controls">
        {shouldShowUpdateAction ? (
          <button
            id="device-analysis-window-update-btn"
            type="button"
            aria-label={updateActionTitle}
            title={updateActionTitle}
            className="da_window_action_btn"
            onClick={updateAction?.onClick}
          >
            <span>{updateActionLabel}</span>
          </button>
        ) : null}
        {pageActions.map((action) => {
          if (action.id === "origin") {
            return (
              <button
                key={action.id}
                id="device-analysis-window-origin-btn"
                type="button"
                aria-label={action.title}
                title={action.title}
                className="da_window_icon_btn"
                onMouseEnter={onAnalysisIntent}
                onFocus={onAnalysisIntent}
                onClick={onOpenOrigin}
              >
                <img
                  src={originIcon}
                  alt=""
                  aria-hidden="true"
                  className="h-[14px] w-[14px] opacity-80 dark:invert"
                />
              </button>
            );
          }

          return (
            <button
              key={action.id}
              type="button"
              aria-label={action.title}
              title={action.title}
              className={`da_window_icon_btn ${action.isActive ? "da_top_nav_btn--active" : ""}`}
              onMouseEnter={action.id === "analysis" ? onAnalysisIntent : undefined}
              onFocus={action.id === "analysis" ? onAnalysisIntent : undefined}
              onClick={() => {
                if (action.id === "data" || action.id === "analysis") {
                  onPageChange?.(action.id);
                  return;
                }
                onOpenSettings?.();
              }}
              id={
                action.id === "settings"
                  ? "device-analysis-window-settings-btn"
                  : undefined
              }
            >
              {action.id === "data" ? (
                <Import size={14} className="opacity-80" />
              ) : action.id === "analysis" ? (
                <BarChart2 size={14} className="opacity-80" />
              ) : (
                <Settings size={14} className="opacity-80" />
              )}
            </button>
          );
        })}
        {windowActions.map((action) => (
          <button
            key={action.id}
            id={`device-analysis-window-${action.id}-btn`}
            type="button"
            aria-label={action.title}
            title={action.title}
            className={`da_window_control_btn ${action.isDanger ? "da_window_control_btn--close" : ""}`.trim()}
            onClick={
              action.id === "minimize"
                ? onMinimizeWindow
                : action.id === "maximize"
                  ? onToggleMaximizeWindow
                  : onCloseWindow
            }
          >
            {action.id === "minimize" ? (
              <Minus size={14} />
            ) : action.id === "maximize" ? (
              <Square size={12} />
            ) : (
              <X size={14} />
            )}
          </button>
        ))}
      </div>
    </header>
  );
};

export default DesktopCommandBar;

