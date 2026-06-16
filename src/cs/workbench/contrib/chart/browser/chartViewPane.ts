/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import ChartPanel from "src/cs/workbench/contrib/chart/browser/chartPanel";
import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { ActionBar } from "src/cs/base/browser/ui/actionbar/actionbar";
import { Action, toAction, type IAction } from "src/cs/base/common/actions";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
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
import { createLegendPopover, getLegendContext, type LegendContext, type LegendPopover } from "src/cs/workbench/contrib/chart/browser/chartLegend";
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
  type ChartAxisTitleEditRequest,
  type ChartDetailPane,
} from "src/cs/workbench/services/chart/common/chart";
import { IChartTitleEditService } from "src/cs/workbench/contrib/chart/browser/chartTitleEditService";
import { IExplorerService } from "src/cs/workbench/contrib/files/browser/files";
import type { ChartViewInput } from "src/cs/workbench/services/chart/common/chartViewInput";
import type { ChartViewProps } from "src/cs/workbench/contrib/chart/browser/views/chartView";

import "src/cs/workbench/contrib/chart/browser/media/chart.css";

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
  private props: ChartViewInput = EMPTY_CHART_VIEW_INPUT;

  constructor(
    @IChartService private readonly chartService: IChartService,
    @IChartTitleEditService private readonly chartTitleEditService: IChartTitleEditService,
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
    return {
      ...displayProps,
      inspectorXAxisLabelOverride: plotDisplayModel?.inspector.xAxisTitle,
      inspectorYAxisLabelOverride: plotDisplayModel?.inspector.yAxisTitle,
      onInspectorXAxisLabelChange: plotDisplayModel
        ? (nextTitle) => this.updateAxisTitle(
            plotDisplayModel.inspector.xAxisTitleContext,
            nextTitle,
            plotDisplayModel.inspector.defaultXAxisTitle,
          )
        : undefined,
      onInspectorYAxisLabelChange: plotDisplayModel
        ? (nextTitle) => this.updateAxisTitle(
            plotDisplayModel.inspector.yAxisTitleContext,
            nextTitle,
            plotDisplayModel.inspector.defaultYAxisTitle,
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
    return this.plotService.getPlotDisplayModel({
      fileId: props.activeFileId ?? null,
      hiddenLegendKeys,
      legendLabels,
      plotType: this.getActivePlotType(),
    });
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
    const series = context.seriesList.find((item) => item.id === legendKey);
    if (!series) {
      this.refreshLegendPopover();
      return;
    }

    this.updateLegendLabel(context, legendKey, String(series.name ?? ""), nextLabel.trim());
  }

  private cancelLegendItemEdit(): void {
    this.editingLegendKey = null;
    this.refreshLegendPopover();
  }

  private updateLegendLabel(context: LegendContext, legendKey: string, defaultLabel: string, nextLabel: string): void {
    if (nextLabel) {
      this.plotService.setLegendLabel(
        context.fileId,
        legendKey,
        nextLabel === defaultLabel ? null : nextLabel,
      );
    }
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
    this.chartService.toggleDetailPane(pane);
  }

  private getActivePlotType(): PlotType {
    return this.props.activePlotType ?? this.fallbackActivePlotType;
  }

  private getCurrentLegendContext(props: ChartViewInput): LegendContext | null {
    const plotType = this.getActivePlotType();
    return getLegendContext(
      this.plotService.getPlotLegendModel({
        fileId: props.activeFileId ?? null,
        plotType,
      }),
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
