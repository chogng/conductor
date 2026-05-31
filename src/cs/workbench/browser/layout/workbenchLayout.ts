import { jsx } from "react/jsx-runtime";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import SplitView, {
  type SplitViewResizeEvent,
} from "src/cs/base/browser/ui/splitview/splitview";
import {
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  WorkbenchSidebarPortalContext,
  type LayoutView,
  useWorkbenchSidebarLayout,
} from "src/cs/workbench/browser/layout";

type WorkbenchLayoutProps = {
  readonly activeView: LayoutView;
  readonly children: ReactNode;
  readonly dataSidebar: ReactNode;
};

const hasWorkbenchSidebar = (activeView: LayoutView) =>
  activeView === "data" || activeView === "analysis";

const WorkbenchLayout = ({
  activeView,
  children,
  dataSidebar,
}: WorkbenchLayoutProps) => {
  const sidebarContainerRef = useRef<HTMLDivElement | null>(null);
  const [sidebarContainer, setSidebarContainer] =
    useState<HTMLDivElement | null>(null);
  const { handleSidebarResize, sidebarWidth } = useWorkbenchSidebarLayout();
  const hasSidebar = hasWorkbenchSidebar(activeView);

  useLayoutEffect(() => {
    setSidebarContainer(sidebarContainerRef.current);
  }, [hasSidebar]);

  const workspaceContent = hasSidebar
    ? jsx(SplitView, {
        className: "h-full min-h-0",
        gap: 2,
        onDidResizeEnd: ({ sizes }: SplitViewResizeEvent) => {
          const nextWidth = sizes[0];
          if (Number.isFinite(nextWidth)) {
            handleSidebarResize(nextWidth);
          }
        },
        orientation: "horizontal",
        panes: [
          {
            id: "workbench-sidebar",
            children: jsx("div", {
              ref: sidebarContainerRef,
              className: "h-full min-h-0",
              children: activeView === "data" ? dataSidebar : null,
            }),
            defaultSize: SIDEBAR_DEFAULT_WIDTH_PX,
            minSize: SIDEBAR_MIN_WIDTH_PX,
            maxSize: SIDEBAR_MAX_WIDTH_PX,
            size: sidebarWidth,
          },
          {
            id: "workbench-main",
            children,
            minSize: 520,
          },
        ],
      })
    : jsx("div", {
        className: "h-full min-h-0",
        children,
      });

  return jsx(WorkbenchSidebarPortalContext.Provider, {
    value: activeView === "analysis" ? sidebarContainer : null,
    children: workspaceContent,
  });
};

export default WorkbenchLayout;
