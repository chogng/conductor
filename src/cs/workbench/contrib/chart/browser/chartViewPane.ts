import AnalysisPanel, {
  type AnalysisPanelProps,
} from "src/cs/workbench/contrib/chart/browser/analysisPanel";
import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { ActionBar } from "src/cs/base/browser/ui/actionbar/actionbar";
import { ActionViewItem, type IActionViewItemOptions } from "src/cs/base/browser/ui/actionbar/actionViewItem";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import {
  getTabsButtonClassName,
  getTabsInstanceId,
  getTabsMenuClassName,
  normalizeTabsOptions,
  type NormalizedTabOption,
  type TabOptionBase,
} from "src/cs/base/browser/ui/tab/tab";
import { Action, toAction, type IAction } from "src/cs/base/common/actions";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { createPreviewPart } from "src/cs/workbench/browser/parts/previewArea/previewPart";
import type { LxIconDefinition } from "src/cs/base/browser/ui/lxicon/lxicon";
import { ChartViewId } from "src/cs/workbench/contrib/chart/common/chart";
import type { ChartPane } from "src/cs/workbench/contrib/chart/browser/views/chartView";
import { getCalculatedData } from "src/cs/workbench/contrib/calculation/common/calculatedData";
import { createMainPlotLegend } from "src/cs/workbench/contrib/plot/browser/mainPlotCanvas";
import {
  DEFAULT_PLOT_AXIS_SETTINGS,
  normalizePlotAxisSettings,
} from "src/cs/workbench/contrib/plot/common/plotAxisSettings";
import { isPlotType, PlotTypes, type PlotType } from "src/cs/workbench/contrib/plot/common/plot";
import type { CleanedEntry } from "src/cs/workbench/contrib/session/common/sessionTypes";

import "src/cs/workbench/contrib/chart/browser/media/chart.css";

type ChartPlotTabOption = TabOptionBase & {
  readonly label: string;
  readonly plotType: PlotType;
};

const CHART_PLOT_ID_BASE = "chart-view-plot";
const CHART_PLOT_PANEL_ID_BASE = "chart-view-plot-panel";
const CHART_LEGEND_ACTION_ID = "chart.header.legend";
const CHART_INSPECTOR_ACTION_ID = "chart.header.inspector";
type ChartDetailPane = "inspector";
type PaneVisibilityMode = "single" | "multiple";

export class ChartViewPane extends ViewPane {
  private readonly previewPart: HTMLElement;
  private readonly headerTabs = document.createElement("div");
  private readonly headerActions = document.createElement("div");
  private readonly paneStore = new DisposableStore();
  private readonly headerStore = new DisposableStore();
  private readonly content = document.createElement("div");
  private readonly analysisPanel: AnalysisPanel;
  private legendAction: Action | null = null;
  private legendPopover: HTMLElement | null = null;
  private fallbackActivePlotType: PlotType = "iv";
  private visibleDetailPanes: readonly ChartDetailPane[] = ["inspector"];
  private readonly paneVisibilityMode: PaneVisibilityMode = "multiple";
  private props: AnalysisPanelProps;

  constructor(props: AnalysisPanelProps) {
    super({
      id: ChartViewId,
      title: localize("analysis.visualization", "Analysis & Visualization"),
      className: "chart-view-pane-root",
      bodyClassName: "workbench-part-view-pane__body",
      headerVisible: false,
    });
    this.props = props;
    this.analysisPanel = new AnalysisPanel(toAnalysisPanelProps(
      props,
      this.getActivePlotType(),
      this.visibleDetailPanes,
    ));
    this.updateAnalysisPanelTabState();
    this.headerTabs.className = "chart_view_header_tabs";
    this.headerActions.className = "chart_view_header_actions";
    this.content.className = "chart_view_pane_content";
    this.content.append(this.analysisPanel.element);
    this.previewPart = createPreviewPart({
      id: ChartViewId,
      ariaLabel: localize("analysis.visualization", "Analysis & Visualization"),
      actionbarContent: this.headerActions,
      className: "chart_view_pane",
      children: this.content,
      titleContent: this.headerTabs,
    });
    this.paneStore.add(addDisposableListener(document, EventType.POINTER_DOWN, (event) => {
      if (!this.legendPopover || this.previewPart.contains(event.target as Node | null)) {
        return;
      }
      this.closeLegendPopover();
    }));
    this.paneStore.add(addDisposableListener(document, EventType.KEY_DOWN, (event) => {
      if (event.key !== "Escape" || !this.legendPopover) {
        return;
      }
      this.closeLegendPopover();
      this.headerActions.querySelector<HTMLButtonElement>(`[data-action-id="${CHART_LEGEND_ACTION_ID}"]`)?.focus();
    }));
    this.body.append(this.previewPart);
    this.update(props);
  }

  public update(props: AnalysisPanelProps): void {
    this.props = props;
    this.renderHeader(props);
    this.updateAnalysisPanel(props);
  }

  public dispose(): void {
    this.paneStore.dispose();
    this.headerStore.dispose();
    this.analysisPanel.dispose();
    this.content.replaceChildren();
    this.previewPart.remove();
    super.dispose();
  }

  private renderHeader(props: AnalysisPanelProps): void {
    this.closeLegendPopover();
    this.headerStore.clear();
    this.legendAction = null;
    const activeFile = resolveActiveFile(props);
    const isEmpty = !props.cleanedData.length;
    this.previewPart.dataset.headerVisible = isEmpty ? "false" : "true";
    this.headerTabs.replaceChildren();
    this.headerActions.replaceChildren();

    if (isEmpty) {
      return;
    }

    this.headerTabs.append(createPlotTabs({
      activePlotType: this.getActivePlotType(),
      onDidChangePlotType: (plotType) => this.setActivePlotType(plotType),
      props,
      store: this.headerStore,
    }));

    this.headerActions.append(this.createHeaderActions(props));

    if (activeFile && props.showFileSelect !== false) {
      this.headerActions.append(createFileSelect(props, activeFile, this.headerStore));
    }
  }

  private setActivePlotType(plotType: PlotType): void {
    if (plotType === this.getActivePlotType()) {
      return;
    }

    this.fallbackActivePlotType = plotType;
    this.props.onActivePlotTypeChange?.(plotType);
    this.renderHeader(this.props);
    this.updateAnalysisPanel(this.props);
  }

  private updateAnalysisPanel(props: AnalysisPanelProps): void {
    this.updateAnalysisPanelTabState();
    this.analysisPanel.update(toAnalysisPanelProps(
      props,
      this.getActivePlotType(),
      this.visibleDetailPanes,
    ));
  }

  private updateAnalysisPanelTabState(): void {
    this.analysisPanel.element.id = getPlotPanelId(this.getActivePlotType());
    this.analysisPanel.element.setAttribute("role", "tabpanel");
    this.analysisPanel.element.setAttribute("aria-labelledby", getPlotTabId(this.getActivePlotType()));
  }

  private createHeaderActions(props: AnalysisPanelProps): HTMLElement {
    const actionBar = new ActionBar({
      ariaLabel: localize("chart_header_actions", "Chart actions"),
      actionViewItemProvider: (action, options) => new ChartHeaderActionViewItem(
        action,
        getHeaderActionIcon(action.id),
        options,
      ),
      className: "chart_view_auxiliary_actions",
      contentClassName: "chart_view_auxiliary_action_items",
    });
    this.headerStore.add(actionBar);
    const actions = [
      this.createLegendAction(props),
      this.createAuxiliaryPaneAction({
        id: CHART_INSPECTOR_ACTION_ID,
        label: localize("chart_inspector_heading", "Inspector"),
        pane: "inspector",
      }),
    ].filter((action): action is IAction => Boolean(action));
    actionBar.push(actions, {
      className: "chart_view_header_icon_btn",
      label: false,
    });
    return actionBar.domNode;
  }

  private createAuxiliaryPaneAction({
    id,
    label,
    pane,
  }: {
    readonly id: string;
    readonly label: string;
    readonly pane: ChartDetailPane;
  }): IAction {
    const isActive = this.visibleDetailPanes.includes(pane);
    return toAction({
      checked: isActive,
      id,
      label,
      tooltip: label,
      run: () => {
        this.toggleAuxiliaryPane(pane);
      },
    });
  }

  private createLegendAction(props: AnalysisPanelProps): IAction | null {
    const calculatedData = getCalculatedData(
      props.calculatedDataByKey,
      this.getActivePlotType(),
      props.activeFileId,
    );
    if (!calculatedData?.seriesList.length) {
      return null;
    }

    const axisSettings = normalizePlotAxisSettings(
      props.plotAxisSettings,
      DEFAULT_PLOT_AXIS_SETTINGS,
    );
    const legendAction = new Action(
      CHART_LEGEND_ACTION_ID,
      localize("chart_legend_heading", "Legend"),
      "",
      true,
      (): void => {
        if (this.legendPopover) {
          this.closeLegendPopover();
          return;
        }
        const legend = createMainPlotLegend({
          legendFontSize: axisSettings.legendFontSize === "" ? undefined : axisSettings.legendFontSize,
          seriesList: calculatedData.seriesList,
        });
        legend.setAttribute("role", "dialog");
        legend.setAttribute("aria-label", localize("chart_legend_heading", "Legend"));
        this.legendPopover = legend;
        this.previewPart.append(legend);
        legendAction.checked = true;
      },
    );
    legendAction.tooltip = localize("chart_legend_tooltip", "Show chart legend");
    this.headerStore.add(legendAction);
    this.legendAction = legendAction;
    return legendAction;
  }

  private closeLegendPopover(): void {
    this.legendPopover?.remove();
    this.legendPopover = null;
    if (this.legendAction) {
      this.legendAction.checked = false;
    }
  }

  private toggleAuxiliaryPane(pane: ChartDetailPane): void {
    const isVisible = this.visibleDetailPanes.includes(pane);
    const next = this.paneVisibilityMode === "single"
      ? (isVisible ? [] : [pane])
      : togglePane(this.visibleDetailPanes, pane);

    if (samePanes(next, this.visibleDetailPanes)) {
      return;
    }

    this.visibleDetailPanes = next;
    this.renderHeader(this.props);
    this.updateAnalysisPanel(this.props);
  }

  private getActivePlotType(): PlotType {
    return this.props.activePlotType ?? this.fallbackActivePlotType;
  }
}

class ChartHeaderActionViewItem extends ActionViewItem {
  constructor(
    action: IAction,
    private readonly icon: LxIconDefinition,
    options: IActionViewItemOptions,
  ) {
    super(undefined, action, options);
  }

  protected override updateLabel(): void {
    if (!this.label) {
      return;
    }

    this.label.replaceChildren(createLxIcon({ icon: this.icon, size: 16 }));
  }

  protected override updateChecked(): void {
    super.updateChecked();
    if (!this.label || this.action.id !== CHART_LEGEND_ACTION_ID) {
      return;
    }
    this.label.dataset.actionId = CHART_LEGEND_ACTION_ID;
    this.label.setAttribute("aria-haspopup", "dialog");
    this.label.setAttribute("aria-expanded", String(Boolean(this.action.checked)));
  }
}

const getHeaderActionIcon = (actionId: string): LxIconDefinition => {
  if (actionId === CHART_LEGEND_ACTION_ID) {
    return LxIcon.summary;
  }
  if (actionId === CHART_INSPECTOR_ACTION_ID) {
    return LxIcon.analysis;
  }
  return LxIcon.search;
};

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
  panes: readonly ChartDetailPane[],
  pane: ChartDetailPane,
): readonly ChartDetailPane[] =>
  panes.includes(pane)
    ? panes.filter((item) => item !== pane)
    : [...panes, pane];

const samePanes = (
  left: readonly ChartDetailPane[],
  right: readonly ChartDetailPane[],
): boolean =>
  left.length === right.length && left.every((pane) => right.includes(pane));

const toVisiblePanes = (
  visibleDetailPanes: readonly ChartDetailPane[],
): readonly ChartPane[] => [
  "chart",
  ...visibleDetailPanes,
];

const toAnalysisPanelProps = (
  props: AnalysisPanelProps,
  activePlotType: PlotType,
  visibleDetailPanes: readonly ChartDetailPane[],
): AnalysisPanelProps => ({
  ...props,
  activePlotType,
  visiblePanes: toVisiblePanes(visibleDetailPanes),
});

export default ChartViewPane;
