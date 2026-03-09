import {
  ArrowLeft,
  ArrowRight,
  BarChart2,
  Minus,
  Settings,
  Square,
  Upload,
  X,
} from "lucide-react";
import type { CSSProperties } from "react";
import originIcon from "../../../assets/icons/origin.svg";
import type { TranslateFn } from "../../../context/language-context";

type ActivePage = "data" | "analysis" | "settings" | string;

type DesktopCommandBarProps = {
  t: TranslateFn;
  activePage: ActivePage;
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
}: DesktopCommandBarProps) => {
  const dragRegionStyle = { WebkitAppRegion: "drag" } as CSSProperties;

  return (
    <header
      id="device-analysis-desktop-command-bar"
      className="da_top_menu_bar"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="da_top_menu_brand">{t("da_menu_app")}</div>

      <div className="da_window_controls ml-4">
        <button
          id="device-analysis-window-nav-back-btn"
          type="button"
          aria-label={t("da_menu_page_back")}
          title={t("da_menu_page_back")}
          className="da_window_icon_btn"
          onClick={onNavigateBack}
          disabled={!canNavigateBack}
        >
          <ArrowLeft size={14} className="opacity-80" />
        </button>
        <button
          id="device-analysis-window-nav-forward-btn"
          type="button"
          aria-label={t("da_menu_page_forward")}
          title={t("da_menu_page_forward")}
          className="da_window_icon_btn"
          onClick={onNavigateForward}
          disabled={!canNavigateForward}
        >
          <ArrowRight size={14} className="opacity-80" />
        </button>
      </div>

      <div className="flex-1" style={dragRegionStyle} />

      <div className="da_window_controls">
        <button
          type="button"
          aria-label={t("da_tab_data")}
          title={t("da_tab_data")}
          className={`da_window_icon_btn ${activePage === "data" ? "da_top_nav_btn--active" : ""}`}
          onClick={() => onPageChange?.("data")}
        >
          <Upload size={14} className="opacity-80" />
        </button>
        <button
          type="button"
          aria-label={t("da_tab_analysis")}
          title={t("da_tab_analysis")}
          className={`da_window_icon_btn ${activePage === "analysis" ? "da_top_nav_btn--active" : ""}`}
          onMouseEnter={onAnalysisIntent}
          onFocus={onAnalysisIntent}
          onClick={() => onPageChange?.("analysis")}
        >
          <BarChart2 size={14} className="opacity-80" />
        </button>

        <button
          id="device-analysis-window-origin-btn"
          type="button"
          aria-label={t("da_open_in_origin")}
          title={t("da_open_in_origin")}
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
        <button
          id="device-analysis-window-settings-btn"
          type="button"
          aria-label={t("da_settings_title")}
          title={t("da_settings_title")}
          className={`da_window_icon_btn ${activePage === "settings" ? "da_top_nav_btn--active" : ""}`}
          onClick={onOpenSettings}
        >
          <Settings size={14} className="opacity-80" />
        </button>
        <button
          id="device-analysis-window-minimize-btn"
          type="button"
          aria-label={t("da_menu_window_minimize")}
          title={t("da_menu_window_minimize")}
          className="da_window_control_btn"
          onClick={onMinimizeWindow}
        >
          <Minus size={14} />
        </button>
        <button
          id="device-analysis-window-maximize-btn"
          type="button"
          aria-label={t("da_menu_window_maximize")}
          title={t("da_menu_window_maximize")}
          className="da_window_control_btn"
          onClick={onToggleMaximizeWindow}
        >
          <Square size={12} />
        </button>
        <button
          id="device-analysis-window-close-btn"
          type="button"
          aria-label={t("da_menu_window_close")}
          title={t("da_menu_window_close")}
          className="da_window_control_btn da_window_control_btn--close"
          onClick={onCloseWindow}
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
};

export default DesktopCommandBar;
