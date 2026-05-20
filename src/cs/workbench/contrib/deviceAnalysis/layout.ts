import { useCallback, useState } from "react";

export const SIDEBAR_DEFAULT_WIDTH_PX = 280;
export const SIDEBAR_MIN_WIDTH_PX = 235;
export const SIDEBAR_MAX_WIDTH_PX = 600;
export const TEMPLATE_MODE_ICON_ONLY_THRESHOLD_PX = 250;

export type LayoutView = "data" | "analysis" | "settings";

export type ViewPaneDefinition = {
  labelledBy: string;
  paneId: string;
  view: LayoutView;
};

export const VIEW_PANES: Record<LayoutView, ViewPaneDefinition> = {
  data: {
    labelledBy: "analysis-tab-data",
    paneId: "analysis-viewpane-data",
    view: "data",
  },
  analysis: {
    labelledBy: "analysis-tab-analysis",
    paneId: "analysis-viewpane-analysis",
    view: "analysis",
  },
  settings: {
    labelledBy: "analysis-window-settings-btn",
    paneId: "analysis-viewpane-settings",
    view: "settings",
  },
};

export const clampSidebarWidth = (width: number): number =>
  Math.max(
    SIDEBAR_MIN_WIDTH_PX,
    Math.min(SIDEBAR_MAX_WIDTH_PX, Math.round(width)),
  );

export const useDeviceAnalysisSidebarLayout = () => {
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH_PX);
  const handleSidebarResize = useCallback((width: number) => {
    setSidebarWidth(clampSidebarWidth(width));
  }, []);

  return {
    handleSidebarResize,
    sidebarWidth,
  };
};
