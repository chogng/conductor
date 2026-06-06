import type {
  LayoutNavigationState,
  LayoutView,
} from "src/cs/workbench/browser/layout";

export type VisitedLayoutViewsState = {
  hasVisitedAnalysisView: boolean;
  hasVisitedSettingsView: boolean;
};

export const LayoutViewSwitchIds: Record<LayoutView, string> = {
  data: "workbench-titlebar-data-button",
  analysis: "workbench-titlebar-analysis-button",
  settings: "workbench-titlebar-settings-button",
};

export const INITIAL_VISITED_VIEWS_STATE: VisitedLayoutViewsState = {
  hasVisitedAnalysisView: false,
  hasVisitedSettingsView: false,
};

export const navigateToLayoutPage = (
  prevState: LayoutNavigationState,
  nextPage: LayoutView,
): LayoutNavigationState => {
  if (prevState.activeView === nextPage) {
    return prevState;
  }

  const truncatedHistory = prevState.history.slice(
    0,
    prevState.historyIndex + 1,
  );
  const nextHistory = [...truncatedHistory, nextPage];

  return {
    activeView: nextPage,
    history: nextHistory,
    historyIndex: nextHistory.length - 1,
  };
};

export const navigateLayoutBack = (
  prevState: LayoutNavigationState,
): LayoutNavigationState => {
  if (prevState.historyIndex <= 0) {
    return prevState;
  }

  const nextIndex = prevState.historyIndex - 1;
  return {
    ...prevState,
    activeView: prevState.history[nextIndex],
    historyIndex: nextIndex,
  };
};

export const navigateLayoutForward = (
  prevState: LayoutNavigationState,
): LayoutNavigationState => {
  if (prevState.historyIndex >= prevState.history.length - 1) {
    return prevState;
  }

  const nextIndex = prevState.historyIndex + 1;
  return {
    ...prevState,
    activeView: prevState.history[nextIndex],
    historyIndex: nextIndex,
  };
};

export const markVisitedLayoutView = (
  prevState: VisitedLayoutViewsState,
  activePage: LayoutView,
): VisitedLayoutViewsState => {
  if (activePage === "analysis" && !prevState.hasVisitedAnalysisView) {
    return {
      ...prevState,
      hasVisitedAnalysisView: true,
    };
  }

  if (activePage === "settings" && !prevState.hasVisitedSettingsView) {
    return {
      ...prevState,
      hasVisitedSettingsView: true,
    };
  }

  return prevState;
};

export const resetVisitedAnalysisLayoutView = (
  prevState: VisitedLayoutViewsState,
): VisitedLayoutViewsState => ({
  ...prevState,
  hasVisitedAnalysisView: false,
});

export const resolveLayoutView = (value: string): LayoutView | null =>
  value === "data" || value === "analysis" || value === "settings"
    ? value
    : null;
