import {
  DEVICE_ANALYSIS_VIEW_PANES,
  type DeviceAnalysisLayoutView,
  type DeviceAnalysisViewPaneDefinition,
} from "src/cs/workbench/contrib/deviceAnalysis/layout";

export type DeviceAnalysisLayoutStateInput = {
  activeView: DeviceAnalysisLayoutView;
  hasVisitedAnalysisView: boolean;
  hasVisitedSettingsView: boolean;
  historyIndex: number;
  historyLength: number;
};

export type DeviceAnalysisViewPaneState = DeviceAnalysisViewPaneDefinition & {
  isActive: boolean;
  shouldMount: boolean;
};

export const getViewPaneClassName = (isActive: boolean): string =>
  `absolute inset-0 min-h-0 transition-opacity duration-150 ${
    isActive
      ? "pointer-events-auto opacity-100"
      : "pointer-events-none opacity-0"
  }`;

export const getDeviceAnalysisLayoutState = ({
  activeView,
  hasVisitedAnalysisView,
  hasVisitedSettingsView,
  historyIndex,
  historyLength,
}: DeviceAnalysisLayoutStateInput) => {
  const isDataActive = activeView === "data";
  const isAnalysisActive = activeView === "analysis";
  const isSettingsActive = activeView === "settings";

  return {
    activeView,
    canNavigateBack: historyIndex > 0,
    canNavigateForward: historyIndex < historyLength - 1,
    panes: {
      data: {
        ...DEVICE_ANALYSIS_VIEW_PANES.data,
        isActive: isDataActive,
        shouldMount: true,
      },
      analysis: {
        ...DEVICE_ANALYSIS_VIEW_PANES.analysis,
        isActive: isAnalysisActive,
        shouldMount: isAnalysisActive || hasVisitedAnalysisView,
      },
      settings: {
        ...DEVICE_ANALYSIS_VIEW_PANES.settings,
        isActive: isSettingsActive,
        shouldMount: isSettingsActive || hasVisitedSettingsView,
      },
    },
  };
};
