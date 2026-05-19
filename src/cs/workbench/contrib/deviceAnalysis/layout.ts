export const DEFAULT_SIDEBAR_WIDTH_PX = 280;
export const MIN_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX = 200;
export const MAX_DEVICE_ANALYSIS_SIDEBAR_WIDTH_PX = 600;
export const DEVICE_ANALYSIS_TEMPLATE_MODE_ICON_ONLY_THRESHOLD_PX = 250;

export type DeviceAnalysisLayoutView = "data" | "analysis" | "settings";

export type DeviceAnalysisViewPaneDefinition = {
  labelledBy: string;
  paneId: string;
  view: DeviceAnalysisLayoutView;
};

export const DEVICE_ANALYSIS_VIEW_PANES: Record<
  DeviceAnalysisLayoutView,
  DeviceAnalysisViewPaneDefinition
> = {
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
