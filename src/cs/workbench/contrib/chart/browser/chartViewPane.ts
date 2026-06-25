/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import ChartPanel from "src/cs/workbench/contrib/chart/browser/chartPanel";
import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { ActionBar } from "src/cs/base/browser/ui/actionbar/actionbar";
import { Action } from "src/cs/base/common/actions";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { ICommandService } from "src/cs/platform/commands/common/commands";
import { localize } from "src/cs/nls";
import { logPerf } from "src/cs/workbench/common/perf";
import { createCenterAreaShell } from "src/cs/workbench/browser/parts/centerArea/centerArea";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { ChartViewId } from "src/cs/workbench/services/chart/common/chart";
import { createPlotTabs, getPlotPanelId, getPlotTabId } from "src/cs/workbench/contrib/chart/browser/chartPlotTabs";
import {
  CHART_INSPECTOR_ACTION_ID,
  CHART_LEGEND_ACTION_ID,
  ChartHeaderActionViewItem,
  getHeaderActionIcon,
} from "src/cs/workbench/contrib/chart/browser/chartActions";
import {
  createFileSelect,
} from "src/cs/workbench/contrib/chart/browser/chartFileSelect";
import {
  resolveActiveChartFileOption,
  resolveChartFileOptions,
} from "src/cs/workbench/services/chart/common/chartFileOptions";
import {
  createLegendPopover,
  getLegendContext,
  getLegendDefaultLabel,
  resolveLegendLabelOverride,
  type LegendContext,
  type LegendPopover,
} from "src/cs/workbench/contrib/chart/browser/chartLegend";
import { toChartPanelProps } from "src/cs/workbench/contrib/chart/browser/chartPaneState";
import { createChartUnitControls, type ChartUnitAxis, type ChartUnitControlState, type ChartYScale } from "src/cs/workbench/contrib/chart/browser/chartUnitControls";
import {
  IPlotService,
  type PlotAxisTitleContext,
  type PlotDisplayModel,
  type PlotType,
} from "src/cs/workbench/services/plot/common/plot";
import type { XUnit, YUnit } from "src/cs/workbench/services/plot/common/units";
import {
  getOriginOpenPlotOptions,
  ISettingsService,
} from "src/cs/workbench/services/settings/common/settings";
import {
  IChartService,
  TOGGLE_CHART_INSPECTOR_COMMAND_ID,
  type ChartAxisTitleEditRequest,
  type ChartDetailPane,
} from "src/cs/workbench/services/chart/common/chart";
import { IChartTitleEditService } from "src/cs/workbench/contrib/chart/browser/chartTitleEditService";
import { IExplorerService } from "src/cs/workbench/contrib/files/browser/files";
import type { ChartViewInput } from "src/cs/workbench/services/chart/common/chartViewInput";
import type { ChartViewProps } from "src/cs/workbench/contrib/chart/browser/views/chartView";

import "src/cs/workbench/contrib/chart/browser/media/chart.css";

const INSPECTOR_PREFETCH_STABLE_DELAY_MS = 320;

export class ChartViewPane extends ViewPane {
  private readonly centerArea: HTMLElement;
  private readonly headerTabs = document.createElement("div");
  private readonly headerActions = document.createElement("div");
  private readonly headerActionBar: ActionBar;
  private headerUnitControls: HTMLElement | null = null;
  private headerFileSelect: HTMLElement | null = null;
  private readonly paneStore = new DisposableStore();
  private readonly headerStore = new DisposableStore();
  private readonly content = document.createElement("div");
  private readonly chartPanel: ChartPanel;
  private readonly legendAction: Action;
  private readonly inspectorAction: Action;
  private legendPopover: LegendPopover | null = null;
  private legendContext: LegendContext | null = null;
  private editingLegendKey: string | null = null;
  private fallbackActivePlotType: PlotType = "iv";
  private pendingInspectorPrefetchHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
  private pendingInspectorPrefetchKey: string | null = null;
  private props: ChartViewInput = EMPTY_CHART_VIEW_INPUT;

  constructor(
    @IChartService private readonly chartService: IChartService,
    @IChartTitleEditService private readonly chartTitleEditService: IChartTitleEditService,
    @ICommandService private readonly commandService: ICommandService,
    @IExplorerService private readonly explorerService: IExplorerService,
    @IPlotService private readonly plotService: IPlotService,
    @ISettingsService private readonly settingsService: ISettingsService,
  ) {
    super({
      id: ChartViewId,
      title: localize("chart.title", "Chart"),
      className: "chart-view-pane-root",
      bodyClassName: "workbench-part-view-pane__body",
    });
    this.chartPanel = new ChartPanel(this.getChartPanelProps(this.props));
    this.updateChartPanelTabState();
    this.headerTabs.className = "chart_view_header_tabs";
    this.headerActions.className = "chart_view_header_actions";
    this.headerActionBar = this.paneStore.add(new ActionBar({
      ariaLabel: localize("chart.header.actions", "Chart actions"),
      actionViewItemProvider: (action, options) => new ChartHeaderActionViewItem(
        action,
        getHeaderActionIcon(action.id),
        options,
      ),
      className: "chart_view_detail_actions",
      contentClassName: "chart_view_detail_action_items",
    }));
    this.legendAction = this.paneStore.add(new Action(
      CHART_LEGEND_ACTION_ID,
      localize("chart.legend.heading", "Legend"),
      "",
      false,
      (): void => this.toggleLegendPopover(),
    ));
    this.legendAction.tooltip = localize("chart.legend.tooltip", "Show chart legend");
    this.legendAction.checked = false;
    this.inspectorAction = this.paneStore.add(new Action(
      CHART_INSPECTOR_ACTION_ID,
      localize("chart.inspector.heading", "Inspector"),
      "",
      true,
      (): void => this.toggleVisibleDetailPane("inspector"),
    ));
    this.inspectorAction.tooltip = localize("chart.inspector.heading", "Inspector");
    this.inspectorAction.checked = false;
    this.headerActionBar.push([
      this.legendAction,
      this.inspectorAction,
    ], {
      className: "chart_view_header_icon_btn",
      label: false,
    });
    this.headerActionBar.domNode.hidden = true;
    this.headerActions.append(this.headerActionBar.domNode);
    this.content.className = "chart_view_pane_content";
    this.content.append(this.chartPanel.element);
    this.centerArea = createCenterAreaShell({
      id: ChartViewId,
      ariaLabel: localize("chart.title", "Chart"),
      actionbarContent: this.headerActions,
      className: "chart_view_pane",
      children: this.content,
      titleContent: this.headerTabs,
    });
    this.paneStore.add(addDisposableListener(document, EventType.KEY_DOWN, (event) => {
      if (event.key !== "Escape" || !this.legendPopover) {
        return;
      }
      this.closeLegendPopover();
      this.headerActions.querySelector<HTMLButtonElement>(`[data-action-id="${CHART_LEGEND_ACTION_ID}"]`)?.focus();
    }));
    this.paneStore.add(this.chartService.onDidChangeChartState(() => {
      this.renderHeader(this.props);
      this.updateChartPanel(this.props);
      this.refreshLegendPopover();
    }));
    this.paneStore.add(this.plotService.onDidChangePlotState(() => {
      this.renderHeader(this.props);
      this.updateChartPanel(this.props);
      this.refreshLegendPopover();
    }));
    this.paneStore.add(this.plotService.onDidChangeCalculatedDataCache(event => {
      if (
        event.fileId !== normalizeChartFileId(this.props.activeFileId) ||
        event.plotType !== this.getActivePlotType()
      ) {
        return;
      }

      this.renderHeader(this.props);
      this.updateChartPanel(this.props);
      this.refreshLegendPopover();
    }));
    this.paneStore.add(this.plotService.onDidChangePlotDisplayModelCache(event => {
      if (
        event.fileId !== normalizeChartFileId(this.props.activeFileId) ||
        event.plotType !== this.getActivePlotType()
      ) {
        return;
      }

      this.renderHeader(this.props);
      this.updateChartPanel(this.props);
      this.refreshLegendPopover();
    }));
    this.paneStore.add(this.settingsService.onDidChangeConductorSettings(() => {
      this.renderHeader(this.props);
      this.updateChartPanel(this.props);
      this.refreshLegendPopover();
    }));
    this.paneStore.add(this.chartService.onDidChangeChartViewInput(() => {
      const input = this.chartService.getViewInput();
      if (input) {
        this.update(input);
      }
    }));
    this.paneStore.add(this.chartTitleEditService.registerHandler({
      editAxisTitle: request => this.editAxisTitleRequest(request),
    }));
    this.body.append(this.centerArea);
    this.update(this.chartService.getViewInput() ?? this.props);
  }

  public update(props: ChartViewInput): void {
    this.props = props;
    this.closeStaleLegendPopover(props);
    this.renderHeader(props);
    this.updateChartPanel(props);
  }

  public dispose(): void {
    this.paneStore.dispose();
    this.headerStore.dispose();
    this.chartPanel.dispose();
    this.cancelPendingInspectorPrefetch();
    this.disposeLegendPopover();
    this.content.replaceChildren();
    this.centerArea.remove();
    super.dispose();
  }

  private editAxisTitleRequest(request: ChartAxisTitleEditRequest): void {
    this.chartPanel.editAxisTitle(request.pane, request.axis);
  }

  private renderHeader(props: ChartViewInput): void {
    this.headerStore.clear();
    const activeFile = resolveActiveChartFileOption(props);
    const isEmpty = props.hasChartData !== true;
    this.centerArea.dataset.headerVisible = isEmpty ? "false" : "true";
    this.headerTabs.replaceChildren();
    this.removeHeaderUnitControls();
    this.removeHeaderFileSelect();

    if (isEmpty) {
      this.syncHeaderActions(null, false);
      return;
    }

    this.headerTabs.append(createPlotTabs({
      activePlotType: this.getActivePlotType(),
      onDidChangePlotType: (plotType) => this.setActivePlotType(plotType),
      store: this.headerStore,
    }));

    const unitState = this.getUnitControlState(props);
    if (unitState) {
      this.setHeaderUnitControls(createChartUnitControls({
        onDidChangeScale: (fileId, scale) => this.updatePlotYScale(fileId, scale),
        onDidChangeUnit: (fileId, axis, unit) => this.updatePlotUnit(fileId, axis, unit),
        state: unitState,
        store: this.headerStore,
      }));
    }

    this.syncHeaderActions(this.getCurrentLegendContext(props), true);

    if (activeFile && props.showFileSelect !== false) {
      this.setHeaderFileSelect(createFileSelect(
        props,
        activeFile,
        this.headerStore,
        fileId => this.selectChartFile(fileId, props),
      ));
    }
  }

  private setHeaderUnitControls(element: HTMLElement): void {
    if (this.headerUnitControls) {
      this.headerUnitControls.replaceWith(element);
    } else {
      this.headerActions.insertBefore(element, this.headerActionBar.domNode);
    }
    this.headerUnitControls = element;
  }

  private removeHeaderUnitControls(): void {
    this.headerUnitControls?.remove();
    this.headerUnitControls = null;
  }

  private setHeaderFileSelect(element: HTMLElement): void {
    if (this.headerFileSelect) {
      this.headerFileSelect.replaceWith(element);
    } else {
      this.headerActions.append(element);
    }
    this.headerFileSelect = element;
  }

  private removeHeaderFileSelect(): void {
    this.headerFileSelect?.remove();
    this.headerFileSelect = null;
  }

  private selectChartFile(fileId: string | null, props: ChartViewInput): void {
    this.explorerService.select({
      candidateFileIds: resolveChartFileOptions(props).map(option => option.fileId),
      fileId: normalizeChartFileId(fileId),
      kind: "chart",
    }, "force");
  }

  private setActivePlotType(plotType: PlotType): void {
    if (plotType === this.getActivePlotType()) {
      return;
    }

    this.fallbackActivePlotType = plotType;
    this.plotService.setActivePlotType(plotType);
    this.closeLegendPopover();
    this.renderHeader(this.props);
    this.updateChartPanel(this.props);
  }

  private updateChartPanel(props: ChartViewInput): void {
    this.updateChartPanelTabState();
    this.chartPanel.update(this.getChartPanelProps(props));
  }

  private getChartPanelProps(props: ChartViewInput): ChartViewProps {
    const baseProps = toChartPanelProps(
      props,
      this.getActivePlotType(),
      this.chartService.getState().visibleDetailPanes,
    );
    const plotDisplayModel = this.getPlotDisplayModel(props);
    const displayProps = {
      ...baseProps,
      originOpenPlotOptions: getOriginOpenPlotOptions(this.settingsService.getConductorSettings()),
      plotAxisSettings: this.settingsService.getConductorSettings()?.plotAxisSettings,
      plotDisplayModel,
    };
    const inspectorDisplayModel = plotDisplayModel?.inspector ?? null;
    return {
      ...displayProps,
      inspectorXAxisLabelOverride: inspectorDisplayModel?.xAxisTitle,
      inspectorYAxisLabelOverride: inspectorDisplayModel?.yAxisTitle,
      onInspectorXAxisLabelChange: inspectorDisplayModel
        ? (nextTitle) => this.updateAxisTitle(
            inspectorDisplayModel.xAxisTitleContext,
            nextTitle,
            inspectorDisplayModel.defaultXAxisTitle,
          )
        : undefined,
      onInspectorYAxisLabelChange: inspectorDisplayModel
        ? (nextTitle) => this.updateAxisTitle(
            inspectorDisplayModel.yAxisTitleContext,
            nextTitle,
            inspectorDisplayModel.defaultYAxisTitle,
          )
        : undefined,
      onXAxisLabelChange: plotDisplayModel
        ? (nextTitle) => this.updateAxisTitle(
            plotDisplayModel.chart.xAxisTitleContext,
            nextTitle,
            plotDisplayModel.chart.defaultXAxisTitle,
          )
        : undefined,
      onYAxisLabelChange: plotDisplayModel
        ? (nextTitle) => this.updateAxisTitle(
            plotDisplayModel.chart.yAxisTitleContext,
            nextTitle,
            plotDisplayModel.chart.defaultYAxisTitle,
          )
        : undefined,
      xAxisLabelOverride: plotDisplayModel?.chart.xAxisTitle,
      yAxisLabelOverride: plotDisplayModel?.chart.yAxisTitle,
    };
  }

  private updateAxisTitle(
    context: PlotAxisTitleContext,
    nextTitle: string,
    defaultTitle: string,
  ): void {
    this.plotService.setAxisTitleOverride(context, nextTitle, defaultTitle);
  }

  private updatePlotUnit(
    fileId: string,
    axis: ChartUnitAxis,
    unit: XUnit | YUnit,
  ): void {
    void this.plotService.setAxisUnit(fileId, axis, unit);
  }

  private updatePlotYScale(fileId: string, scale: ChartYScale): void {
    void this.plotService.setYScale(fileId, scale);
  }

  private getUnitControlState(props: ChartViewInput): ChartUnitControlState | null {
    return this.getPlotDisplayModel(props)?.unitControl ?? null;
  }

  private getPlotDisplayModel(
    props: ChartViewInput,
  ): PlotDisplayModel | null {
    const fileId = normalizeChartFileId(props.activeFileId);
    const plotType = this.getActivePlotType();
    const isInspectorVisible = this.chartService.getState().visibleDetailPanes.includes("inspector");
    const model = this.plotService.getCachedPlotDisplayModel({
      fileId,
      plotType,
    });
    if (!isInspectorVisible) {
      this.cancelPendingInspectorPrefetch();
      this.plotService.cancelQueuedPlotInspectorDisplayModelPrefetch();
    }
    if (!model && fileId) {
      this.cancelPendingInspectorPrefetch();
      this.plotService.prefetchPlotDisplayModel({
        fileId,
        plotType,
      }, "active");
    } else if (
      model &&
      !model.inspector &&
      fileId &&
      isInspectorVisible
    ) {
      this.scheduleInspectorPrefetch({
        fileId,
        plotType,
      });
    } else {
      this.cancelPendingInspectorPrefetch();
    }
    return model;
  }

  private scheduleInspectorPrefetch(input: {
    readonly fileId: string;
    readonly plotType: PlotType;
  }): void {
    const key = this.createInspectorPrefetchKey(input);
    if (this.pendingInspectorPrefetchKey === key) {
      return;
    }

    this.cancelPendingInspectorPrefetch("superseded");
    this.pendingInspectorPrefetchKey = key;
    logPerf("chartViewPane.scheduleInspectorPrefetch", {
      delayMs: INSPECTOR_PREFETCH_STABLE_DELAY_MS,
      fileId: input.fileId,
      plotType: input.plotType,
    }, { silent: true });
    this.pendingInspectorPrefetchHandle = globalThis.setTimeout(() => {
      this.pendingInspectorPrefetchHandle = null;
      this.pendingInspectorPrefetchKey = null;
      if (!this.isInspectorPrefetchTargetCurrent(input)) {
        logPerf("chartViewPane.skipInspectorPrefetch", {
          fileId: input.fileId,
          plotType: input.plotType,
          reason: "stale-target",
        }, { silent: true });
        return;
      }

      logPerf("chartViewPane.fireInspectorPrefetch", {
        fileId: input.fileId,
        plotType: input.plotType,
      }, { silent: true });
      this.plotService.prefetchPlotInspectorDisplayModel({
        fileId: input.fileId,
        plotType: input.plotType,
      }, "active");
    }, INSPECTOR_PREFETCH_STABLE_DELAY_MS);
  }

  private createInspectorPrefetchKey(input: {
    readonly fileId: string;
    readonly plotType: PlotType;
  }): string {
    return [
      input.fileId,
      input.plotType,
    ].join("|");
  }

  private isInspectorPrefetchTargetCurrent(input: {
    readonly fileId: string;
    readonly plotType: PlotType;
  }): boolean {
    return !(
      normalizeChartFileId(this.props.activeFileId) !== input.fileId ||
      this.getActivePlotType() !== input.plotType ||
      !this.chartService.getState().visibleDetailPanes.includes("inspector")
    );
  }

  private cancelPendingInspectorPrefetch(reason: string = "cancelled"): void {
    if (this.pendingInspectorPrefetchHandle == null) {
      this.pendingInspectorPrefetchKey = null;
      return;
    }

    globalThis.clearTimeout(this.pendingInspectorPrefetchHandle);
    logPerf("chartViewPane.cancelInspectorPrefetch", {
      key: this.pendingInspectorPrefetchKey,
      reason,
    }, { silent: true });
    this.pendingInspectorPrefetchHandle = null;
    this.pendingInspectorPrefetchKey = null;
  }

  private updateChartPanelTabState(): void {
    this.chartPanel.element.id = getPlotPanelId(this.getActivePlotType());
    this.chartPanel.element.setAttribute("role", "tabpanel");
    this.chartPanel.element.setAttribute("aria-labelledby", getPlotTabId(this.getActivePlotType()));
  }

  private syncHeaderActions(legendContext: LegendContext | null, visible: boolean): void {
    const legendContextKey = legendContext ? this.getLegendStateKey(legendContext) : null;
    this.headerActionBar.domNode.hidden = !visible;
    this.legendAction.enabled = visible && Boolean(legendContext);
    this.legendAction.class = undefined;
    this.legendAction.checked = visible &&
      legendContextKey !== null &&
      this.chartService.getState().legendPopoverContextKey === legendContextKey;
    this.inspectorAction.enabled = visible;
    this.inspectorAction.checked = visible && this.chartService.getState().visibleDetailPanes.includes("inspector");
  }

  private toggleLegendPopover(): void {
    const legendContext = this.getCurrentLegendContext(this.props);
    if (!legendContext) {
      return;
    }

    const contextKey = this.getLegendStateKey(legendContext);
    const currentContextKey = this.chartService.getState().legendPopoverContextKey;
    this.chartService.setLegendPopoverContextKey(
      currentContextKey === contextKey ? null : contextKey,
    );
  }

  private closeLegendPopover(): void {
    this.chartService.setLegendPopoverContextKey(null);
    this.disposeLegendPopover();
  }

  private disposeLegendPopover(): void {
    this.legendPopover?.dispose();
    this.legendPopover?.remove();
    this.legendPopover = null;
    this.legendContext = null;
    this.editingLegendKey = null;
    this.legendAction.checked = false;
  }

  private closeStaleLegendPopover(props: ChartViewInput): void {
    const currentContext = this.getCurrentLegendContext(props);
    const currentContextKey = currentContext ? this.getLegendStateKey(currentContext) : null;
    const openContextKey = this.chartService.getState().legendPopoverContextKey;
    if (openContextKey && openContextKey !== currentContextKey) {
      this.closeLegendPopover();
      return;
    }

    if (!openContextKey) {
      this.disposeLegendPopover();
    }
  }

  private isLegendPopoverCurrent(props: ChartViewInput): boolean {
    const currentContext = this.getCurrentLegendContext(props);
    if (!currentContext) {
      return false;
    }
    return this.chartService.getState().legendPopoverContextKey ===
      this.getLegendStateKey(currentContext);
  }

  private refreshLegendPopover(): void {
    const context = this.getCurrentLegendContext(this.props);
    const openContextKey = this.chartService.getState().legendPopoverContextKey;
    if (!context || openContextKey !== this.getLegendStateKey(context)) {
      this.disposeLegendPopover();
      return;
    }

    const legend = createLegendPopover(context, {
      editingLegendKey: this.editingLegendKey,
      hiddenLegendKeys: this.getHiddenLegendKeys(context),
      legendLabels: this.getLegendLabels(context),
      onCancelLegendItemEdit: () => this.cancelLegendItemEdit(),
      onCommitLegendItemEdit: (legendKey, nextLabel) => this.commitLegendItemEdit(context, legendKey, nextLabel),
      onToggleLegendItem: (legendKey) => this.toggleLegendItem(context, legendKey),
      onEditLegendItem: (legendKey, currentLabel) => this.editLegendItem(context, legendKey, currentLabel),
    });
    this.legendPopover?.dispose();
    this.legendPopover?.remove();
    this.legendPopover = legend;
    this.legendContext = context;
    this.centerArea.append(legend);
  }

  private editLegendItem(context: LegendContext, legendKey: string, currentLabel: string): void {
    if (!context.seriesList.some((item) => item.id === legendKey)) {
      return;
    }

    this.editingLegendKey = legendKey;
    this.refreshLegendPopover();
  }

  private commitLegendItemEdit(context: LegendContext, legendKey: string, nextLabel: string): void {
    if (this.editingLegendKey !== legendKey) {
      return;
    }

    this.editingLegendKey = null;
    const seriesIndex = context.seriesList.findIndex(item => item.id === legendKey);
    const series = seriesIndex >= 0 ? context.seriesList[seriesIndex] : null;
    if (!series) {
      this.refreshLegendPopover();
      return;
    }

    this.updateLegendLabel(
      context,
      legendKey,
      getLegendDefaultLabel(series, seriesIndex),
      nextLabel,
    );
  }

  private cancelLegendItemEdit(): void {
    this.editingLegendKey = null;
    this.refreshLegendPopover();
  }

  private updateLegendLabel(context: LegendContext, legendKey: string, defaultLabel: string, nextLabel: string): void {
    const currentLabelOverride = this.getLegendLabels(context)[legendKey] ?? null;
    const nextLabelOverride = resolveLegendLabelOverride(nextLabel, defaultLabel);
    this.plotService.setLegendLabel(
      context.fileId,
      legendKey,
      nextLabelOverride,
    );
    if (currentLabelOverride === nextLabelOverride) {
      this.updateChartPanel(this.props);
      this.refreshLegendPopover();
    }
  }

  private toggleLegendItem(context: LegendContext, legendKey: string): void {
    this.plotService.toggleHiddenLegendKey(
      context.fileId,
      context.plotType,
      legendKey,
      context.seriesList.map(series => series.id),
    );
  }

  private toggleVisibleDetailPane(pane: ChartDetailPane): void {
    if (pane === "inspector") {
      void this.commandService.executeCommand(TOGGLE_CHART_INSPECTOR_COMMAND_ID);
    }
  }

  private getActivePlotType(): PlotType {
    return this.props.activePlotType ?? this.fallbackActivePlotType;
  }

  private getCurrentLegendContext(props: ChartViewInput): LegendContext | null {
    const plotType = this.getActivePlotType();
    const fileId = normalizeChartFileId(props.activeFileId);
    const legendModel = this.plotService.getCachedPlotLegendModel({
      fileId,
      plotType,
    });
    const legendContext = getLegendContext(
      legendModel,
      plotType,
    );
    if (legendContext) {
      return legendContext;
    }

    if (!legendModel && fileId) {
      this.plotService.prefetchCalculatedData([fileId], "active", plotType);
    }
    const displayModel = this.plotService.getCachedPlotDisplayModel({
      fileId,
      plotType,
    });
    if (
      displayModel?.fileId === fileId &&
      displayModel.plotType === plotType &&
      displayModel.chart.model.seriesList.length
    ) {
      return {
        fileId,
        plotType,
        seriesList: displayModel.chart.model.seriesList,
      };
    }

    return null;
  }

  private getHiddenLegendKeys(context: LegendContext | null): readonly string[] {
    if (!context) {
      return [];
    }

    return this.plotService.getHiddenLegendKeys(
      context.fileId,
      context.plotType,
      context.seriesList.map(series => series.id),
    );
  }

  private getLegendLabels(context: LegendContext | null): Readonly<Record<string, string>> {
    if (!context) {
      return {};
    }

    const liveLegendKeys = new Set(context.seriesList.map((series) => series.id));
    const labels = this.plotService.getLegendLabels(context.fileId);
    const next: Record<string, string> = {};
    for (const [legendKey, label] of Object.entries(labels)) {
      if (liveLegendKeys.has(legendKey)) {
        next[legendKey] = label;
      }
    }
    return next;
  }

  private getLegendStateKey(context: LegendContext): string {
    return `${context.fileId}:${context.plotType}`;
  }
}

const EMPTY_CHART_VIEW_INPUT: ChartViewInput = {
  activeFileId: null,
  activePlotType: "iv",
  chartFileOptions: [],
  hasChartData: false,
  shouldMountCharts: false,
};

const normalizeChartFileId = (fileId: unknown): string | null => {
  const normalized = String(fileId ?? "").trim();
  return normalized || null;
};

export default ChartViewPane;
