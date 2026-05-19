import { type CSSProperties, type ReactNode } from "react";
import { DEFAULT_SIDEBAR_WIDTH_PX } from "./layout";
import { WorkbenchTitlebarSkeleton } from "src/cs/workbench/browser/parts/titlebar/titlebarSkeleton";

const shouldShowDesktopCommandBarByDefault =
  typeof window !== "undefined" &&
  window.desktopMeta?.isDesktop === true &&
  window.desktopMeta?.platform === "win32";

type WorkspaceShellProps = {
  children?: ReactNode;
  className?: string;
  id?: string;
  showDesktopCommandBar?: boolean;
  showSkeleton?: boolean;
  style?: CSSProperties;
  titleBar?: ReactNode;
};

const WorkspaceShell = ({
  children,
  className = "",
  id,
  showDesktopCommandBar = shouldShowDesktopCommandBarByDefault,
  showSkeleton = true,
  style,
  titleBar,
}: WorkspaceShellProps) => {
  const resolvedStyle = {
    "--sidebar-width": `${DEFAULT_SIDEBAR_WIDTH_PX}px`,
    "--da-template-stack-panel-h": "clamp(24rem, 52dvh, 40rem)",
    ...(style ?? {}),
  } as CSSProperties;

  return (
    <div
      id={id}
      className={`flex h-full min-h-screen flex-col overflow-hidden bg-bg-page ${className}`.trim()}
      style={resolvedStyle}
    >
      {showDesktopCommandBar ? titleBar ?? <WorkbenchTitlebarSkeleton /> : null}

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
                className="grid h-full min-h-0 grid-cols-[var(--sidebar-width,280px)_minmax(0,1fr)] gap-1"
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

export default WorkspaceShell;
