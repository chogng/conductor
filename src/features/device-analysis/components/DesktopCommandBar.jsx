import {
  Minus,
  Settings,
  Square,
  X,
} from "lucide-react";
import originIcon from "../../../assets/icons/origin.svg";

const DesktopCommandBar = ({
  t,
  onMinimizeWindow,
  onToggleMaximizeWindow,
  onCloseWindow,
  onOpenSettings,
  onOpenOrigin,
}) => {
  return (
    <header id="device-analysis-desktop-command-bar" className="da_top_menu_bar">
      <div className="da_top_menu_brand">{t("da_menu_app")}</div>

      {/* Spacer to push window controls to the right */}
      <div className="flex-1" style={{ WebkitAppRegion: "drag" }}></div>

      <div className="da_window_controls">
        <button
          id="device-analysis-window-origin-btn"
          type="button"
          aria-label={t("da_open_in_origin")}
          title={t("da_open_in_origin")}
          className="da_window_icon_btn mr-[2px]"
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
          aria-label="Settings"
          title="Settings"
          className="da_window_icon_btn mr-[2px]"
          onClick={onOpenSettings}
        >
          <Settings size={14} />
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
