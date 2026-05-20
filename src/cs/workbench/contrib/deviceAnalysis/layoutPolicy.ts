import {
  VIEW_PANES,
  type LayoutView,
  type ViewPaneDefinition,
} from "src/cs/workbench/contrib/deviceAnalysis/layout";

export type LayoutStateInput = {
  activeView: LayoutView;
  hasVisitedAnalysisView: boolean;
  hasVisitedSettingsView: boolean;
  historyIndex: number;
  historyLength: number;
};

export type ViewPaneState = ViewPaneDefinition & {
  isActive: boolean;
  shouldMount: boolean;
};

export const getViewPaneClassName = (isActive: boolean): string =>
  `absolute inset-0 min-h-0 transition-opacity duration-150 ${
    isActive
      ? "pointer-events-auto opacity-100"
      : "pointer-events-none opacity-0"
  }`;

export const getLayoutState = ({
  activeView,
  hasVisitedAnalysisView,
  hasVisitedSettingsView,
  historyIndex,
  historyLength,
}: LayoutStateInput) => {
  const isDataActive = activeView === "data";
  const isAnalysisActive = activeView === "analysis";
  const isSettingsActive = activeView === "settings";

  return {
    activeView,
    canNavigateBack: historyIndex > 0,
    canNavigateForward: historyIndex < historyLength - 1,
    panes: {
      data: {
        ...VIEW_PANES.data,
        isActive: isDataActive,
        shouldMount: true,
      },
      analysis: {
        ...VIEW_PANES.analysis,
        isActive: isAnalysisActive,
        shouldMount: isAnalysisActive || hasVisitedAnalysisView,
      },
      settings: {
        ...VIEW_PANES.settings,
        isActive: isSettingsActive,
        shouldMount: isSettingsActive || hasVisitedSettingsView,
      },
    },
  };
};
