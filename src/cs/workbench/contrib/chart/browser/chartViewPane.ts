import AnalysisPanel, {
  type AnalysisPanelProps,
} from "src/cs/workbench/contrib/chart/browser/analysisPanel";
import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { ActionBar } from "src/cs/base/browser/ui/actionbar/actionbar";
import { Action, toAction, type IAction } from "src/cs/base/common/actions";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { createPreviewPart } from "src/cs/workbench/browser/parts/previewArea/previewPart";
import { ChartViewId } from "src/cs/workbench/contrib/chart/common/chart";
import { createPlotTabs, getPlotPanelId, getPlotTabId } from "src/cs/workbench/contrib/chart/browser/chartPlotTabs";
import {
  CHART_INSPECTOR_ACTION_ID,
  CHART_LEGEND_ACTION_ID,
  ChartHeaderActionViewItem,
  getHeaderActionIcon,
} from "src/cs/workbench/contrib/chart/browser/chartActions";
import { createFileSelect, resolveActiveFile } from "src/cs/workbench/contrib/chart/browser/chartFileSelect";
import { createLegendPopover, getLegendContext, isSameLegendContext, type LegendContext } from "src/cs/workbench/contrib/chart/browser/chartLegend";
import { sameDetailPanes, toAnalysisPanelProps, toggleDetailPane, type ChartDetailPane } from "src/cs/workbench/contrib/chart/browser/chartPaneState";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";

import "src/cs/workbench/contrib/chart/browser/media/chart.css";

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
  private legendContext: LegendContext | null = null;
  private readonly hiddenLegendKeysByContext = new Map<string, readonly string[]>();
  private fallbackActivePlotType: PlotType = "iv";
  private visibleDetailPanes: readonly ChartDetailPane[] = ["inspector"];
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
      this.getHiddenLegendKeys(this.getCurrentLegendContext(props)),
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
    this.closeStaleLegendPopover(props);
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
    this.closeLegendPopover();
    this.renderHeader(this.props);
    this.updateAnalysisPanel(this.props);
  }

  private updateAnalysisPanel(props: AnalysisPanelProps): void {
    this.updateAnalysisPanelTabState();
    this.analysisPanel.update(toAnalysisPanelProps(
      props,
      this.getActivePlotType(),
      this.visibleDetailPanes,
      this.getHiddenLegendKeys(this.getCurrentLegendContext(props)),
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
      className: "chart_view_detail_actions",
      contentClassName: "chart_view_detail_action_items",
    });
    this.headerStore.add(actionBar);
    const actions = [
      this.createLegendAction(props),
      this.createDetailPaneAction({
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

  private createDetailPaneAction({
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
        this.toggleVisibleDetailPane(pane);
      },
    });
  }

  private createLegendAction(props: AnalysisPanelProps): IAction | null {
    const legendContext = this.getCurrentLegendContext(props);
    if (!legendContext) {
      return null;
    }

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
        const legend = createLegendPopover(props, legendContext, {
          hiddenLegendKeys: this.getHiddenLegendKeys(legendContext),
          onToggleLegendItem: (legendKey) => this.toggleLegendItem(legendContext, legendKey),
        });
        this.legendPopover = legend;
        this.legendContext = legendContext;
        this.previewPart.append(legend);
        legendAction.checked = true;
      },
    );
    legendAction.checked = this.isLegendPopoverCurrent(props);
    legendAction.tooltip = localize("chart_legend_tooltip", "Show chart legend");
    this.headerStore.add(legendAction);
    this.legendAction = legendAction;
    return legendAction;
  }

  private closeLegendPopover(): void {
    this.legendPopover?.remove();
    this.legendPopover = null;
    this.legendContext = null;
    if (this.legendAction) {
      this.legendAction.checked = false;
    }
  }

  private closeStaleLegendPopover(props: AnalysisPanelProps): void {
    if (this.legendPopover && !this.isLegendPopoverCurrent(props)) {
      this.closeLegendPopover();
    }
  }

  private isLegendPopoverCurrent(props: AnalysisPanelProps): boolean {
    const currentContext = this.getCurrentLegendContext(props);
    const legendContext = this.legendContext;
    if (!this.legendPopover || !legendContext || !currentContext) {
      return false;
    }
    return isSameLegendContext(legendContext, currentContext);
  }

  private refreshLegendPopover(): void {
    const context = this.getCurrentLegendContext(this.props);
    if (!this.legendPopover || !context) {
      this.closeLegendPopover();
      return;
    }

    const legend = createLegendPopover(this.props, context, {
      hiddenLegendKeys: this.getHiddenLegendKeys(context),
      onToggleLegendItem: (legendKey) => this.toggleLegendItem(context, legendKey),
    });
    this.legendPopover.remove();
    this.legendPopover = legend;
    this.legendContext = context;
    this.previewPart.append(legend);
  }

  private toggleLegendItem(context: LegendContext, legendKey: string): void {
    const key = this.getLegendStateKey(context);
    if (!context.seriesList.some((series) => series.id === legendKey)) {
      return;
    }

    const current = this.getHiddenLegendKeys(context);
    const next = current.includes(legendKey)
      ? current.filter((item) => item !== legendKey)
      : [...current, legendKey];
    if (next.length) {
      this.hiddenLegendKeysByContext.set(key, next);
    } else {
      this.hiddenLegendKeysByContext.delete(key);
    }

    this.renderHeader(this.props);
    this.updateAnalysisPanel(this.props);
    this.refreshLegendPopover();
  }

  private toggleVisibleDetailPane(pane: ChartDetailPane): void {
    const next = toggleDetailPane(this.visibleDetailPanes, pane);

    if (sameDetailPanes(next, this.visibleDetailPanes)) {
      return;
    }

    this.visibleDetailPanes = next;
    this.renderHeader(this.props);
    this.updateAnalysisPanel(this.props);
  }

  private getActivePlotType(): PlotType {
    return this.props.activePlotType ?? this.fallbackActivePlotType;
  }

  private getCurrentLegendContext(props: AnalysisPanelProps): LegendContext | null {
    return getLegendContext(props, this.getActivePlotType());
  }

  private getHiddenLegendKeys(context: LegendContext | null): readonly string[] {
    if (!context) {
      return [];
    }

    const key = this.getLegendStateKey(context);
    const liveLegendKeys = new Set(context.seriesList.map((series) => series.id));
    const hidden = (this.hiddenLegendKeysByContext.get(key) ?? [])
      .filter((legendKey) => liveLegendKeys.has(legendKey));
    if (!hidden.length) {
      this.hiddenLegendKeysByContext.delete(key);
      return [];
    }

    this.hiddenLegendKeysByContext.set(key, hidden);
    return hidden;
  }

  private getLegendStateKey(context: LegendContext): string {
    return `${context.fileId}:${context.plotType}`;
  }
}

export default ChartViewPane;
