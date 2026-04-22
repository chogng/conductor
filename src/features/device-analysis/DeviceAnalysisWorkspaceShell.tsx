import { useEffect, type CSSProperties, type ReactNode } from "react";
import { DEFAULT_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX } from "./deviceAnalysisLayout";

const shouldShowDesktopCommandBarByDefault =
  typeof window !== "undefined" &&
  window.desktopMeta?.isDesktop === true &&
  window.desktopMeta?.platform === "win32";

type DesktopCommandBarShellProps = {
  className?: string;
};

export const DesktopCommandBarShell = ({
  className = "",
}: DesktopCommandBarShellProps) => (
  <header className={`da_top_menu_bar ${className}`.trim()} aria-hidden="true">
    <div className="da_top_menu_brand">
      <img
        src="/logo.svg"
        alt=""
        aria-hidden="true"
        className="da_top_menu_brand_icon"
      />
      <span>conductor</span>
    </div>

    <div className="da_window_controls ml-4">
      <div className="da_window_icon_btn pointer-events-none">
        <div className="h-[14px] w-[14px] rounded-full bg-current/15" />
      </div>
      <div className="da_window_icon_btn pointer-events-none">
        <div className="h-[14px] w-[14px] rounded-full bg-current/15" />
      </div>
    </div>

    <div className="da_top_menu_center">
      <div className="h-7 w-44 rounded-full border border-border bg-bg-surface/70" />
    </div>

      <div className="da_window_controls">
        <div className="da_window_icon_btn pointer-events-none">
          <div className="h-[14px] w-[14px] rounded-full bg-current/15" />
        </div>
        <div className="da_window_icon_btn pointer-events-none">
        <div className="h-[14px] w-[14px] rounded-full bg-current/15" />
      </div>
      <div className="da_window_icon_btn pointer-events-none">
        <div className="h-[14px] w-[14px] rounded-full bg-current/15" />
      </div>
        <div className="da_window_icon_btn pointer-events-none">
          <div className="h-[14px] w-[14px] rounded-full bg-current/15" />
        </div>
        <div className="da_window_icon_btn pointer-events-none">
          <div className="h-[14px] w-[14px] rounded-full bg-current/15" />
        </div>
        <div className="da_window_control_btn pointer-events-none">
          <div className="h-[12px] w-[12px] rounded-full bg-current/15" />
        </div>
      <div className="da_window_control_btn pointer-events-none">
        <div className="h-[12px] w-[12px] rounded-full bg-current/15" />
      </div>
      <div className="da_window_control_btn da_window_control_btn--close pointer-events-none">
        <div className="h-[12px] w-[12px] rounded-full bg-current/15" />
      </div>
    </div>
  </header>
);

type DeviceAnalysisWorkspaceShellProps = {
  children?: ReactNode;
  className?: string;
  id?: string;
  showDesktopCommandBar?: boolean;
  showSkeleton?: boolean;
  style?: CSSProperties;
  titleBar?: ReactNode;
};

const DeviceAnalysisWorkspaceShell = ({
  children,
  className = "",
  id,
  showDesktopCommandBar = shouldShowDesktopCommandBarByDefault,
  showSkeleton = true,
  style,
  titleBar,
}: DeviceAnalysisWorkspaceShellProps) => {
  const resolvedStyle = {
    "--sidebar-width": `${DEFAULT_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX}px`,
    "--da-template-stack-panel-h": "clamp(24rem, 52dvh, 40rem)",
    ...(style ?? {}),
  } as CSSProperties;

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const markUiReady = window.__CONDUCTOR_BOOT_MARK_UI_READY__;
    if (!markUiReady) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      markUiReady("workspace-shell");
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div
      id={id}
      className={`flex h-full min-h-screen flex-col overflow-hidden bg-bg-page ${className}`.trim()}
      style={resolvedStyle}
    >
      {showDesktopCommandBar ? titleBar ?? <DesktopCommandBarShell /> : null}

      <div className="relative flex-1 min-h-0">
        {showSkeleton ? (
          <section
            aria-hidden="true"
            className="absolute inset-0 min-h-0 opacity-100 pointer-events-none"
          >
            <div
              className={`h-full min-h-0 overflow-hidden ${
                showDesktopCommandBar ? "p-1 pt-0" : "p-1"
              }`}
            >
              <div
                className="grid h-full min-h-0 grid-cols-1 gap-1 min-[1200px]:grid-cols-[var(--sidebar-width,280px)_minmax(0,1fr)]"
              >
                <div className="rounded-[20px] border border-border bg-bg-surface/70 p-4 flex min-h-0 flex-col">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <div className="h-10 w-40 rounded-xl border border-border bg-bg-page/70" />
                    <div className="h-10 w-10 rounded-xl border border-border bg-bg-page/70" />
                  </div>
                  <div className="mb-4 h-4 w-28 rounded bg-bg-page/70" />
                  <div className="flex-1 rounded-[20px] border border-border bg-bg-page/60" />
                </div>

                <div className="rounded-[20px] border border-border bg-bg-surface/60 pt-4 pr-4 pb-4 pl-0 flex min-h-0">
                  <div className="flex min-h-0 flex-1 flex-col pl-4">
                    <div className="flex-1 min-h-0 rounded-[16px] border border-border bg-bg-page/75" />
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {children ? (
          <div className="relative z-[1] flex h-full min-h-0 flex-col">{children}</div>
        ) : null}
      </div>
    </div>
  );
};

export default DeviceAnalysisWorkspaceShell;
