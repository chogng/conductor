import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import {
  getTabsButtonClassName,
  getTabsInstanceId,
  getTabsMenuClassName,
  normalizeTabsOptions,
  type NormalizedTabOption,
  type TabOptionBase,
} from "src/cs/base/browser/ui/tab/tab";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { isPlotType, PlotTypes, type PlotType } from "src/cs/workbench/services/plot/common/plot";

type ChartPlotTabOption = TabOptionBase & {
  readonly label: string;
  readonly plotType: PlotType;
};

const CHART_PLOT_ID_BASE = "chart-view-plot";
const CHART_PLOT_PANEL_ID_BASE = "chart-view-plot-panel";

export const createPlotTabs = ({
  activePlotType,
  onDidChangePlotType,
  store,
}: {
  readonly activePlotType: PlotType;
  readonly onDidChangePlotType: (plotType: PlotType) => void;
  readonly store: DisposableStore;
}): HTMLElement => {
  const tabs = document.createElement("div");
  tabs.className = getTabsMenuClassName("chart_view_tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", localize("chart.plotTabs.ariaLabel", "Chart plot tabs"));

  const normalizedTabs = normalizeTabsOptions<ChartPlotTabOption>({
    idBase: CHART_PLOT_ID_BASE,
    instanceId: getTabsInstanceId(CHART_PLOT_ID_BASE, CHART_PLOT_ID_BASE),
    options: PlotTypes.map((plotType) => ({
      label: getPlotTypeLabel(plotType),
      plotType,
      value: plotType,
    })),
    panelIdBase: CHART_PLOT_PANEL_ID_BASE,
    shouldLinkPanels: true,
  });

  for (const tab of normalizedTabs) {
    tabs.append(createPlotTabButton(tab, activePlotType));
  }

  store.add(addDisposableListener(tabs, EventType.CLICK, (event) => {
    const plotType = getEventPlotType(event);
    if (plotType) {
      onDidChangePlotType(plotType);
    }
  }));
  store.add(addDisposableListener(tabs, EventType.KEY_DOWN, (event) => {
    const currentPlotType = getEventPlotType(event);
    const nextTab = currentPlotType
      ? getNextPlotTab(normalizedTabs, currentPlotType, event.key)
      : undefined;
    if (!nextTab) {
      return;
    }

    event.preventDefault();
    tabs.querySelector<HTMLButtonElement>(`#${CSS.escape(nextTab.__tabId)}`)?.focus();
    onDidChangePlotType(nextTab.plotType);
  }));

  return tabs;
};

export const getPlotPanelId = (plotType: PlotType): string =>
  `${CHART_PLOT_PANEL_ID_BASE}-${plotType}`;

export const getPlotTabId = (plotType: PlotType): string =>
  `${CHART_PLOT_ID_BASE}-tab-${plotType}`;

const createPlotTabButton = (
  tab: NormalizedTabOption<ChartPlotTabOption>,
  activePlotType: PlotType,
): HTMLButtonElement => {
  const button = document.createElement("button");
  const isActive = tab.plotType === activePlotType;
  button.id = tab.__tabId;
  button.type = "button";
  button.className = getTabsButtonClassName({
    isActive,
    size: "sm",
  });
  button.tabIndex = isActive ? 0 : -1;
  button.setAttribute("role", "tab");
  button.setAttribute("aria-selected", String(isActive));
  if (tab.__panelId) {
    button.setAttribute("aria-controls", tab.__panelId);
  }
  button.dataset.chartPlotType = tab.plotType;

  const text = document.createElement("span");
  text.className = "tab_btn_text";
  text.textContent = tab.label;
  button.append(text);
  return button;
};

const getPlotTypeLabel = (plotType: PlotType): string => {
  switch (plotType) {
    case "gm":
      return "GM";
    case "ss":
      return "SS";
    case "vth":
      return "VTH";
    case "iv":
    default:
      return "IV";
  }
};

const getEventPlotType = (event: Event): PlotType | undefined => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return undefined;
  }

  const value = target.closest<HTMLElement>("[data-chart-plot-type]")?.dataset.chartPlotType;
  return isPlotType(value) ? value : undefined;
};

const getNextPlotTab = (
  tabs: readonly NormalizedTabOption<ChartPlotTabOption>[],
  plotType: PlotType,
  key: string,
): NormalizedTabOption<ChartPlotTabOption> | undefined => {
  const currentIndex = tabs.findIndex((tab) => tab.plotType === plotType);
  if (currentIndex < 0) {
    return tabs[0];
  }

  if (key === "Home") {
    return tabs[0];
  }
  if (key === "End") {
    return tabs[tabs.length - 1];
  }
  if (key !== "ArrowLeft" && key !== "ArrowRight") {
    return undefined;
  }

  const delta = key === "ArrowRight" ? 1 : -1;
  return tabs[(currentIndex + delta + tabs.length) % tabs.length];
};
