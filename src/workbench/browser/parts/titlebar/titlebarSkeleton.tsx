import {
  WORKBENCH_TITLEBAR_APP_ICON_SRC,
  WORKBENCH_TITLEBAR_APP_NAME,
} from "./titlebarPart";

type WorkbenchTitlebarSkeletonProps = {
  className?: string;
};

const SkeletonIcon = ({ className = "" }: { className?: string }) => (
  <div className={`da_window_icon_btn pointer-events-none ${className}`.trim()}>
    <div className="h-[14px] w-[14px] rounded-full bg-current/15" />
  </div>
);

const SkeletonWindowControl = ({
  className = "",
}: {
  className?: string;
}) => (
  <div className={`da_window_control_btn pointer-events-none ${className}`.trim()}>
    <div className="h-[12px] w-[12px] rounded-full bg-current/15" />
  </div>
);

export const WorkbenchTitlebarSkeleton = ({
  className = "",
}: WorkbenchTitlebarSkeletonProps) => (
  <header className={`da_top_menu_bar ${className}`.trim()} aria-hidden="true">
    <div className="da_top_menu_brand">
      <img
        src={WORKBENCH_TITLEBAR_APP_ICON_SRC}
        alt=""
        aria-hidden="true"
        className="da_top_menu_brand_icon"
      />
      <span>{WORKBENCH_TITLEBAR_APP_NAME}</span>
    </div>

    <div className="da_window_controls ml-4">
      <SkeletonIcon />
      <SkeletonIcon />
    </div>

    <div className="da_top_menu_center">
      <div className="h-7 w-44 rounded-full border border-border bg-bg-surface/70" />
    </div>

    <div className="da_window_controls">
      <SkeletonIcon />
      <SkeletonIcon />
      <SkeletonIcon />
      <SkeletonIcon />
      <SkeletonIcon />
      <SkeletonWindowControl />
      <SkeletonWindowControl />
      <SkeletonWindowControl className="da_window_control_btn--close" />
    </div>
  </header>
);
