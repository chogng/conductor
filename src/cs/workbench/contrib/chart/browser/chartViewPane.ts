import AnalysisPanel, {
  type AnalysisPanelProps,
} from "src/cs/workbench/contrib/chart/browser/analysisPanel";
import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { createButton } from "src/cs/base/browser/ui/button/button";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import {
  getTabsButtonClassName,
  getTabsInstanceId,
  getTabsMenuClassName,
  normalizeTabsOptions,
  type NormalizedTabOption,
  type TabOptionBase,
} from "src/cs/base/browser/ui/tab/tab";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import { createPreviewPart } from "src/cs/workbench/browser/parts/previewArea/previewPart";
import type { LxIconDefinition } from "src/cs/base/browser/ui/lxicon/lxicon";
import { ChartViewId } from "src/cs/workbench/contrib/chart/common/chart";
import type { ChartAuxiliaryPane, ChartPane } from "src/cs/workbench/contrib/chart/browser/chartView";
import { isPlotType, PlotTypes, type PlotType } from "src/cs/workbench/contrib/plot/common/plot";
import type { CleanedEntry } from "src/cs/workbench/contrib/session/common/sessionTypes";

import "src/cs/workbench/contrib/chart/browser/media/chart.css";

type ChartPlotTabOption = TabOptionBase & {
  readonly label: string;
  readonly plotType: PlotType;
};

const CHART_PLOT_ID_BASE = "chart-view-plot";
const CHART_PLOT_PANEL_ID_BASE = "chart-view-plot-panel";
type PaneVisibilityMode = "single" | "multiple";

export class ChartViewPane {
  public readonly element: HTMLElement;
  private readonly headerTabs = document.createElement("div");
  private readonly headerActions = document.createElement("div");
  private readonly headerStore = new DisposableStore();
  private readonly content = document.createElement("div");
  private readonly analysisPanel: AnalysisPanel;
  private activePlotType: PlotType = "iv";
  private visibleAuxiliaryPanes: readonly ChartAuxiliaryPane[] = ["locator"];
  private readonly paneVisibilityMode: PaneVisibilityMode = "multiple";
  private props: AnalysisPanelProps;

  constructor(props: AnalysisPanelProps) {
    this.props = props;
    this.analysisPanel = new AnalysisPanel(toAnalysisPanelProps(
      props,
      this.activePlotType,
      this.visibleAuxiliaryPanes,
    ));
    this.updateAnalysisPanelTabState();
    this.headerTabs.className = "chart_view_header_tabs";
    this.headerActions.className = "chart_view_header_actions";
    this.content.className = "chart_view_pane_content";
    this.content.append(this.analysisPanel.element);
    this.element = createPreviewPart({
      id: ChartViewId,
      ariaLabel: localize("analysis.visualization", "Analysis & Visualization"),
      actionbarContent: this.headerActions,
      className: "chart_view_pane",
      children: this.content,
      titleContent: this.headerTabs,
    });
    this.update(props);
  }

  public update(props: AnalysisPanelProps): void {
    this.props = props;
    this.renderHeader(props);
    this.updateAnalysisPanel(props);
  }

  public dispose(): void {
    this.headerStore.dispose();
    this.analysisPanel.dispose();
    this.content.replaceChildren();
    this.element.remove();
  }

  private renderHeader(props: AnalysisPanelProps): void {
    this.headerStore.clear();
    const activeFile = resolveActiveFile(props);
    const isEmpty = !props.cleanedData.length;
    this.element.dataset.headerVisible = isEmpty ? "false" : "true";
    this.headerTabs.replaceChildren();
    this.headerActions.replaceChildren();

    if (isEmpty) {
      return;
    }

    this.headerTabs.append(createPlotTabs({
      activePlotType: this.activePlotType,
      onDidChangePlotType: (plotType) => this.setActivePlotType(plotType),
      props,
      store: this.headerStore,
    }));

    this.headerActions.append(this.createAuxiliaryPaneActions(props));

    if (activeFile && props.showFileSelect !== false) {
      this.headerActions.append(createFileSelect(props, activeFile, this.headerStore));
    }
  }

  private setActivePlotType(plotType: PlotType): void {
    if (plotType === this.activePlotType) {
      return;
    }

    this.activePlotType = plotType;
    this.renderHeader(this.props);
    this.updateAnalysisPanel(this.props);
  }

  private updateAnalysisPanel(props: AnalysisPanelProps): void {
    this.updateAnalysisPanelTabState();
    this.analysisPanel.update(toAnalysisPanelProps(
      props,
      this.activePlotType,
      this.visibleAuxiliaryPanes,
    ));
  }

  private updateAnalysisPanelTabState(): void {
    this.analysisPanel.element.id = getPlotPanelId(this.activePlotType);
    this.analysisPanel.element.setAttribute("role", "tabpanel");
    this.analysisPanel.element.setAttribute("aria-labelledby", getPlotTabId(this.activePlotType));
  }

  private createAuxiliaryPaneActions(props: AnalysisPanelProps): HTMLElement {
    const root = document.createElement("div");
    root.className = "chart_view_auxiliary_actions";
    root.setAttribute("role", "toolbar");
    root.setAttribute("aria-label", localize("da_chart_detail_actions", "Chart detail views"));
    root.append(
      this.createAuxiliaryPaneAction({
        icon: LxIcon.search,
        label: localize("da_chart_locator_heading", "Locator"),
        pane: "locator",
      }),
      this.createAuxiliaryPaneAction({
        icon: LxIcon.diagnostics,
        label: localize("da_chart_diagnostics_heading", "Diagnostics"),
        pane: "inspector",
      }),
    );
    return root;
  }

  private createAuxiliaryPaneAction({
    icon,
    label,
    pane,
  }: {
    readonly icon: LxIconDefinition;
    readonly label: string;
    readonly pane: ChartAuxiliaryPane;
  }): HTMLButtonElement {
    const isActive = this.visibleAuxiliaryPanes.includes(pane);
    const button = createButton({
      ariaLabel: label,
      className: isActive
        ? "chart_view_header_icon_btn chart_view_header_icon_btn--active"
        : "chart_view_header_icon_btn",
      content: createLxIcon({ icon, size: 16 }),
      size: "iconSm",
      title: label,
      variant: "ghost",
    });
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    this.headerStore.add(addDisposableListener(button, EventType.CLICK, () => {
      this.toggleAuxiliaryPane(pane);
    }));
    return button;
  }

  private toggleAuxiliaryPane(pane: ChartAuxiliaryPane): void {
    const isVisible = this.visibleAuxiliaryPanes.includes(pane);
    const next = this.paneVisibilityMode === "single"
      ? (isVisible ? [] : [pane])
      : togglePane(this.visibleAuxiliaryPanes, pane);

    if (samePanes(next, this.visibleAuxiliaryPanes)) {
      return;
    }

    this.visibleAuxiliaryPanes = next;
    this.renderHeader(this.props);
    this.updateAnalysisPanel(this.props);
  }
}

const resolveActiveFile = ({
  activeFileId,
  cleanedData = [],
}: AnalysisPanelProps): CleanedEntry | null => {
  const normalizedActiveFileId = String(activeFileId ?? "").trim();
  return (
    cleanedData.find((file) => String(file?.fileId ?? "") === normalizedActiveFileId) ??
    cleanedData[0] ??
    null
  );
};

const createFileSelect = (
  props: AnalysisPanelProps,
  activeFile: CleanedEntry,
  store: DisposableStore,
): HTMLSelectElement => {
  const select = document.createElement("select");
  select.className = "chart_view_file_select dropdown-field dropdown-field--sm";
  select.value = String(activeFile.fileId ?? "");
  for (const file of props.cleanedData) {
    const fileId = String(file?.fileId ?? "");
    if (!fileId) {
      continue;
    }

    const option = document.createElement("option");
    option.value = fileId;
    option.textContent = String(file?.fileName ?? fileId).replace(/\.csv$/i, "");
    select.append(option);
  }
  store.add(addDisposableListener(select, EventType.CHANGE, () => {
    props.onActiveFileIdChange?.(select.value || null);
  }));
  return select;
};

const createPlotTabs = ({
  activePlotType,
  onDidChangePlotType,
  props,
  store,
}: {
  readonly activePlotType: PlotType;
  readonly onDidChangePlotType: (plotType: PlotType) => void;
  readonly props: AnalysisPanelProps;
  readonly store: DisposableStore;
}): HTMLElement => {
  const tabs = document.createElement("div");
  tabs.className = getTabsMenuClassName("chart_view_tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", localize("analysis.visualization", "Analysis & Visualization"));

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
    tabs.append(button);
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

const getPlotTabId = (plotType: PlotType): string =>
  `${CHART_PLOT_ID_BASE}-tab-${plotType}`;

const getPlotPanelId = (plotType: PlotType): string =>
  `${CHART_PLOT_PANEL_ID_BASE}-${plotType}`;

const togglePane = (
  panes: readonly ChartAuxiliaryPane[],
  pane: ChartAuxiliaryPane,
): readonly ChartAuxiliaryPane[] =>
  panes.includes(pane)
    ? panes.filter((item) => item !== pane)
    : [...panes, pane];

const samePanes = (
  left: readonly ChartAuxiliaryPane[],
  right: readonly ChartAuxiliaryPane[],
): boolean =>
  left.length === right.length && left.every((pane) => right.includes(pane));

const toVisiblePanes = (
  visibleAuxiliaryPanes: readonly ChartAuxiliaryPane[],
): readonly ChartPane[] => [
  "chart",
  ...visibleAuxiliaryPanes,
];

const toAnalysisPanelProps = (
  props: AnalysisPanelProps,
  activePlotType: PlotType,
  visibleAuxiliaryPanes: readonly ChartAuxiliaryPane[],
): AnalysisPanelProps => ({
  ...props,
  activePlotType,
  visiblePanes: toVisiblePanes(visibleAuxiliaryPanes),
});

export default ChartViewPane;
