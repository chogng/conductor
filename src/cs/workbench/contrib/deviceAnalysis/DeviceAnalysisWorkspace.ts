import { jsx } from "react/jsx-runtime";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import SplitView, {
  type SplitViewResizeEvent,
} from "src/cs/base/browser/ui/splitview/splitview";
import {
  DeviceAnalysisSidebarPortalContext,
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  type LayoutView,
  useDeviceAnalysisSidebarLayout,
} from "src/cs/workbench/contrib/deviceAnalysis/layout";

type DeviceAnalysisWorkspaceProps = {
  readonly activeView: LayoutView;
  readonly children: ReactNode;
  readonly dataSidebar: ReactNode;
};

const DeviceAnalysisWorkspace = ({
  activeView,
  children,
  dataSidebar,
}: DeviceAnalysisWorkspaceProps) => {
  const sidebarContainerRef = useRef<HTMLDivElement | null>(null);
  const [sidebarContainer, setSidebarContainer] = useState<HTMLDivElement | null>(null);
  const { handleSidebarResize, sidebarWidth } =
    useDeviceAnalysisSidebarLayout();
  const hasSidebar = activeView === "data" || activeView === "analysis";

  useLayoutEffect(() => {
    setSidebarContainer(sidebarContainerRef.current);
  }, [hasSidebar]);

  const workspaceContent = hasSidebar
    ? jsx(SplitView, {
        className: "h-full min-h-0",
        gap: 4,
        onDidResizeEnd: ({ sizes }: SplitViewResizeEvent) => {
          const nextWidth = sizes[0];
          if (Number.isFinite(nextWidth)) {
            handleSidebarResize(nextWidth);
          }
        },
        orientation: "horizontal",
        panes: [
          {
            id: "device-analysis-sidebar",
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
            id: "device-analysis-workspace",
            children,
            minSize: 520,
          },
        ],
      })
    : jsx("div", {
        className: "h-full min-h-0",
        children,
      });

  return jsx(DeviceAnalysisSidebarPortalContext.Provider, {
    value: activeView === "analysis" ? sidebarContainer : null,
    children: workspaceContent,
  });
};

export default DeviceAnalysisWorkspace;
