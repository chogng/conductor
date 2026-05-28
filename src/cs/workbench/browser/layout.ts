import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  INITIAL_VISITED_VIEWS_STATE,
  markVisitedLayoutView,
  navigateLayoutBack,
  navigateLayoutForward,
  navigateToLayoutPage,
  resetVisitedAnalysisLayoutView,
  resolveLayoutView,
} from "src/cs/workbench/browser/actions/layoutActions";
import {
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
} from "src/cs/workbench/browser/layoutConstants";
import { layoutService } from "src/cs/workbench/services/layout/browser/layoutService";

export {
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  TEMPLATE_MODE_ICON_ONLY_THRESHOLD_PX,
} from "src/cs/workbench/browser/layoutConstants";

export type LayoutView = "data" | "analysis" | "settings";

export type LayoutNavigationState = {
  activeView: LayoutView;
  history: LayoutView[];
  historyIndex: number;
};

export type ViewPaneDefinition = {
  labelledBy: string;
  paneId: string;
  view: LayoutView;
};

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

export type LayoutState = ReturnType<typeof getLayoutState>;

export const INITIAL_LAYOUT_NAVIGATION_STATE: LayoutNavigationState = {
  activeView: "data",
  history: ["data"],
  historyIndex: 0,
};

export const VIEW_PANES: Record<LayoutView, ViewPaneDefinition> = {
  data: {
    labelledBy: layoutService.elements.dataTab,
    paneId: layoutService.elements.dataPane,
    view: "data",
  },
  analysis: {
    labelledBy: layoutService.elements.analysisTab,
    paneId: layoutService.elements.analysisPane,
    view: "analysis",
  },
  settings: {
    labelledBy: layoutService.elements.settingsViewSwitch,
    paneId: layoutService.elements.settingsPane,
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

export const DeviceAnalysisSidebarPortalContext =
  createContext<HTMLElement | null>(null);

export const useDeviceAnalysisSidebarPortal = () =>
  useContext(DeviceAnalysisSidebarPortalContext);

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

export const useWorkbenchLayoutNavigation = () => {
  const [navigation, setNavigation] = useState<LayoutNavigationState>(
    INITIAL_LAYOUT_NAVIGATION_STATE,
  );
  const [visitedViews, setVisitedViews] = useState(
    INITIAL_VISITED_VIEWS_STATE,
  );
  const activeView = navigation.activeView;

  useEffect(() => {
    setVisitedViews((prevState) => markVisitedLayoutView(prevState, activeView));

    if (typeof document !== "undefined") {
      const activeElement = document.activeElement;
      if (
        activeElement &&
        activeElement instanceof HTMLElement &&
        typeof activeElement.blur === "function"
      ) {
        activeElement.blur();
      }
    }
  }, [activeView]);

  const navigateToView = useCallback((nextView: LayoutView) => {
    setNavigation((prevState) => navigateToLayoutPage(prevState, nextView));
  }, []);

  const navigateBack = useCallback(() => {
    setNavigation((prevState) => navigateLayoutBack(prevState));
  }, []);

  const navigateForward = useCallback(() => {
    setNavigation((prevState) => navigateLayoutForward(prevState));
  }, []);

  const selectView = useCallback(
    (nextView: string) => {
      const resolvedView = resolveLayoutView(nextView);
      if (resolvedView) {
        navigateToView(resolvedView);
      }
    },
    [navigateToView],
  );

  const resetAnalysisViewVisit = useCallback(() => {
    setVisitedViews((prevState) => resetVisitedAnalysisLayoutView(prevState));
  }, []);

  return {
    activeView,
    layoutState: getLayoutState({
      activeView,
      hasVisitedAnalysisView: visitedViews.hasVisitedAnalysisView,
      hasVisitedSettingsView: visitedViews.hasVisitedSettingsView,
      historyIndex: navigation.historyIndex,
      historyLength: navigation.history.length,
    }),
    navigateBack,
    navigateForward,
    navigateToView,
    resetAnalysisViewVisit,
    selectView,
    visitedViews,
  };
};
