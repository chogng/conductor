/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import ChartPanel from "src/cs/workbench/contrib/chart/browser/chartPanel";
import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { ActionBar } from "src/cs/base/browser/ui/actionbar/actionbar";
import { Action, toAction, type IAction } from "src/cs/base/common/actions";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { ICommandService } from "src/cs/platform/commands/common/commands";
import { localize } from "src/cs/nls";
import { logPerf } from "src/cs/workbench/common/perf";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { createPreviewPart } from "src/cs/workbench/browser/parts/previewArea/previewPart";
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
  private readonly previewPart: HTMLElement;
  private readonly headerTabs = document.createElement("div");
  private readonly headerActions = document.createElement("div");
  private readonly paneStore = new DisposableStore();
  private readonly headerStore = new DisposableStore();
  private readonly content = document.createElement("div");
  private readonly chartPanel: ChartPanel;
  private legendAction: Action | null = null;
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
    this.content.className = "chart_view_pane_content";
    this.content.append(this.chartPanel.element);
    this.previewPart = createPreviewPart({
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
    this.body.append(this.previewPart);
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
    this.previewPart.remove();
    super.dispose();
  }

  private editAxisTitleRequest(request: ChartAxisTitleEditRequest): void {
    this.chartPanel.editAxisTitle(request.pane, request.axis);
  }

  private renderHeader(props: ChartViewInput): void {
    this.headerStore.clear();
    this.legendAction = null;
    const activeFile = resolveActiveChartFileOption(props);
    const isEmpty = props.hasChartData !== true;
    this.previewPart.dataset.headerVisible = isEmpty ? "false" : "true";
    this.headerTabs.replaceChildren();
    this.headerActions.replaceChildren();

    if (isEmpty) {
      return;
    }

    this.headerTabs.append(createPlotTabs({
      activePlotType: this.getActivePlotType(),
      onDidChangePlotType: (plotType) => this.setActivePlotType(plotType),
      store: this.headerStore,
    }));

    const unitState = this.getUnitControlState(props);
    if (unitState) {
      this.headerActions.append(createChartUnitControls({
        onDidChangeScale: (fileId, scale) => this.updatePlotYScale(fileId, scale),
        onDidChangeUnit: (fileId, axis, unit) => this.updatePlotUnit(fileId, axis, unit),
        state: unitState,
        store: this.headerStore,
      }));
    }

    this.headerActions.append(this.createHeaderActions(props));

    if (activeFile && props.showFileSelect !== false) {
      this.headerActions.append(createFileSelect(
        props,
        activeFile,
        this.headerStore,
        fileId => this.selectChartFile(fileId, props),
      ));
    }
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
    const legendContext = this.getCurrentLegendContext(props);
    const hiddenLegendKeys = this.getHiddenLegendKeys(legendContext);
    const legendLabels = this.getLegendLabels(legendContext);
    const baseProps = toChartPanelProps(
      props,
      this.getActivePlotType(),
      this.chartService.getState().visibleDetailPanes,
    );
    const plotDisplayModel = this.getPlotDisplayModel(
      props,
      hiddenLegendKeys,
      legendLabels,
    );
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
    hiddenLegendKeys: readonly string[] = [],
    legendLabels: Readonly<Record<string, string>> = {},
  ): PlotDisplayModel | null {
    const fileId = normalizeChartFileId(props.activeFileId);
    const plotType = this.getActivePlotType();
    const isInspectorVisible = this.chartService.getState().visibleDetailPanes.includes("inspector");
    const model = this.plotService.getCachedPlotDisplayModel({
      fileId,
      hiddenLegendKeys,
      legendLabels,
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
        hiddenLegendKeys,
        legendLabels,
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
        hiddenLegendKeys,
        legendLabels,
        plotType,
      });
    } else {
      this.cancelPendingInspectorPrefetch();
    }
    return model;
  }

  private scheduleInspectorPrefetch(input: {
    readonly fileId: string;
    readonly hiddenLegendKeys: readonly string[];
    readonly legendLabels: Readonly<Record<string, string>>;
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
      if (!this.isInspectorPrefetchTargetCurrent(input, key)) {
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
        hiddenLegendKeys: input.hiddenLegendKeys,
        legendLabels: input.legendLabels,
        plotType: input.plotType,
      }, "active");
    }, INSPECTOR_PREFETCH_STABLE_DELAY_MS);
  }

  private createInspectorPrefetchKey(input: {
    readonly fileId: string;
    readonly hiddenLegendKeys: readonly string[];
    readonly legendLabels: Readonly<Record<string, string>>;
    readonly plotType: PlotType;
  }): string {
    return [
      input.fileId,
      input.plotType,
      [...input.hiddenLegendKeys].join(","),
      Object.entries(input.legendLabels)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([labelKey, label]) => `${labelKey}:${label}`)
        .join(","),
    ].join("|");
  }

  private isInspectorPrefetchTargetCurrent(input: {
    readonly fileId: string;
    readonly hiddenLegendKeys: readonly string[];
    readonly legendLabels: Readonly<Record<string, string>>;
    readonly plotType: PlotType;
  }, key: string): boolean {
    if (
      normalizeChartFileId(this.props.activeFileId) !== input.fileId ||
      this.getActivePlotType() !== input.plotType ||
      !this.chartService.getState().visibleDetailPanes.includes("inspector")
    ) {
      return false;
    }

    const legendContext = this.getCurrentLegendContext(this.props);
    return key === this.createInspectorPrefetchKey({
      fileId: input.fileId,
      hiddenLegendKeys: this.getHiddenLegendKeys(legendContext),
      legendLabels: this.getLegendLabels(legendContext),
      plotType: input.plotType,
    });
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

  private createHeaderActions(props: ChartViewInput): HTMLElement {
    const actionBar = new ActionBar({
      ariaLabel: localize("chart.header.actions", "Chart actions"),
      actionViewItemProvider: (action, options) => new ChartHeaderActionViewItem(
        action,
        getHeaderActionIcon(action.id),
        options,
      ),
      className: "chart_view_detail_actions",
      contentClassName: "chart_view_detail_action_items",
    });
    this.headerStore.add(actionBar);
    const actions = [
      this.createLegendAction(props),
      this.createDetailPaneAction({
        id: CHART_INSPECTOR_ACTION_ID,
        label: localize("chart.inspector.heading", "Inspector"),
        pane: "inspector",
      }),
    ].filter((action): action is IAction => Boolean(action));
    actionBar.push(actions, {
      className: "chart_view_header_icon_btn",
      label: false,
    });
    return actionBar.domNode;
  }

  private createDetailPaneAction({
    id,
    label,
    pane,
  }: {
    readonly id: string;
    readonly label: string;
    readonly pane: ChartDetailPane;
  }): IAction {
    const isActive = this.chartService.getState().visibleDetailPanes.includes(pane);
    return toAction({
      checked: isActive,
      id,
      label,
      tooltip: label,
      run: () => {
        this.toggleVisibleDetailPane(pane);
      },
    });
  }

  private createLegendAction(props: ChartViewInput): IAction | null {
    const legendContext = this.getCurrentLegendContext(props);
    if (!legendContext) {
      return null;
    }

    const legendAction = new Action(
      CHART_LEGEND_ACTION_ID,
      localize("chart.legend.heading", "Legend"),
      "",
      true,
      (): void => {
        const contextKey = this.getLegendStateKey(legendContext);
        const currentContextKey = this.chartService.getState().legendPopoverContextKey;
        this.chartService.setLegendPopoverContextKey(
          currentContextKey === contextKey ? null : contextKey,
        );
      },
    );
    legendAction.checked = this.isLegendPopoverCurrent(props);
    legendAction.tooltip = localize("chart.legend.tooltip", "Show chart legend");
    this.headerStore.add(legendAction);
    this.legendAction = legendAction;
    return legendAction;
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
    if (this.legendAction) {
      this.legendAction.checked = false;
    }
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
    this.previewPart.append(legend);
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
    this.plotService.setLegendLabel(
      context.fileId,
      legendKey,
      resolveLegendLabelOverride(nextLabel, defaultLabel),
    );
    this.updateChartPanel(this.props);
    this.refreshLegendPopover();
  }

  private toggleLegendItem(context: LegendContext, legendKey: string): void {
    const key = this.getLegendStateKey(context);
    this.chartService.toggleHiddenLegendKey(
      key,
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
    if (!legendModel && fileId) {
      this.plotService.prefetchCalculatedData([fileId], "active", plotType);
    }
    return getLegendContext(
      legendModel,
      plotType,
    );
  }

  private getHiddenLegendKeys(context: LegendContext | null): readonly string[] {
    if (!context) {
      return [];
    }

    const key = this.getLegendStateKey(context);
    return this.chartService.getHiddenLegendKeys(
      key,
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
