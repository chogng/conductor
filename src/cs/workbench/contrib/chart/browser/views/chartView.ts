/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import {
  createPlotMainView,
  type PlotMainView,
  type PlotMainViewProps,
} from "src/cs/workbench/contrib/plot/browser/plotView";
import { replaceChildrenIfChanged } from "src/cs/base/browser/dom";
import type {
  ChartPane,
  ChartViewInput,
} from "src/cs/workbench/services/chart/common/chartViewInput";
import type { OriginPlotOptions } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type { PlotDisplayModel } from "src/cs/workbench/services/plot/common/plot";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import { createEmptyView } from "src/cs/workbench/contrib/chart/browser/views/emptyView";

import "src/cs/workbench/contrib/chart/browser/views/media/chartView.css";

export type { ChartPane };
export type ChartViewProps = ChartViewInput & {
  readonly inspectorXAxisLabelOverride?: string;
  readonly inspectorYAxisLabelOverride?: string;
  readonly onInspectorXAxisLabelChange?: (nextLabel: string) => void;
  readonly onInspectorYAxisLabelChange?: (nextLabel: string) => void;
  readonly onXAxisLabelChange?: (nextLabel: string) => void;
  readonly onYAxisLabelChange?: (nextLabel: string) => void;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly plotDisplayModel?: PlotDisplayModel | null;
  readonly visiblePanes?: readonly ChartPane[];
  readonly xAxisLabelOverride?: string;
  readonly yAxisLabelOverride?: string;
};

export type ChartViewElement = HTMLElement & {
  readonly dispose?: () => void;
  readonly editAxisTitle?: (pane: ChartPane, axis: "x" | "y") => boolean;
  readonly mainPlotOverlayHost?: HTMLElement;
  readonly update?: (props: ChartViewProps) => boolean;
};

export const createChartView = (props: ChartViewProps): ChartViewElement => {
  const {
    activeFileId,
    hasChartData = false,
    plotDisplayModel = null,
    processingStatus,
  } = props;
  const visiblePanes = normalizeVisiblePanes(props.visiblePanes);
  const root = document.createElement("section") as ChartViewElement;
  root.className = "chart_view";
  root.setAttribute("aria-label", localize("chart.title", "Chart"));

  if (!hasChartData) {
    if (isFastPendingDisplayTarget(props)) {
      return createPendingChartView(root, props, visiblePanes);
    }

    root.append(createEmptyView({
      hint: processingStatus?.state === "processing"
        ? localize("chart.processing.hint", "Extracting and preparing chart data, please wait.")
        : localize("chart.empty.hint", "Apply a template to generate chart data."),
      title: processingStatus?.state === "processing"
        ? localize("chart.processing.title", "Processing chart data...")
        : localize("chart.empty.title", "No chart data"),
    }));
    return root;
  }

  if (!plotDisplayModel) {
    return createPendingChartView(root, props, visiblePanes);
  }

  root.dataset.chartDisplayState = "ready";
  if (activeFileId) {
    root.dataset.chartFileId = activeFileId;
  }

  let currentProps = props;
  let currentVisiblePanes = visiblePanes;
  const chartPlotView = createPlotMainView(createChartPlotMainViewProps(props, plotDisplayModel));
  let inspectorPlotView: PlotMainView | null = null;
  let inspectorPendingView: HTMLElement | null = null;

  const chartHost = document.createElement("div");
  chartHost.className = "chart_view_host";
  chartHost.append(chartPlotView.element);

  const inspectorHost = document.createElement("div");
  inspectorHost.className = "chart_view_host";

  const main = document.createElement("div");
  main.className = "chart_view_main";
  main.dataset.paneCount = String(visiblePanes.length);

  const mainPane = document.createElement("div");
  mainPane.className = "chart_view_main_pane";
  mainPane.append(chartHost);

  const inspectorPane = document.createElement("div");
  inspectorPane.className = "chart_view_main_pane chart_view_inspector_pane";
  inspectorPane.append(inspectorHost);

  syncInspectorHost(props, plotDisplayModel, visiblePanes);
  syncVisiblePanes(main, mainPane, inspectorPane, visiblePanes);
  root.append(main);
  Object.defineProperty(root, "mainPlotOverlayHost", {
    value: chartPlotView.overlayHost,
  });
  Object.defineProperty(root, "dispose", {
    value: (): void => {
      chartPlotView.dispose();
      inspectorPlotView?.dispose();
      root.replaceChildren();
    },
  });
  Object.defineProperty(root, "editAxisTitle", {
    value: (pane: ChartPane, axis: "x" | "y"): boolean => {
      if (pane === "inspector") {
        return inspectorPlotView?.editAxisTitle(axis) ?? false;
      }

      return chartPlotView.editAxisTitle(axis);
    },
  });
  Object.defineProperty(root, "update", {
    value: (nextProps: ChartViewProps): boolean => {
      if (!canUpdateChartViewInPlace(currentProps, nextProps)) {
        return false;
      }

      const nextDisplayModel = nextProps.plotDisplayModel;
      if (!nextDisplayModel) {
        return false;
      }

      chartPlotView.update(createChartPlotMainViewProps(nextProps, nextDisplayModel));

      currentProps = nextProps;
      currentVisiblePanes = normalizeVisiblePanes(nextProps.visiblePanes);
      syncInspectorHost(nextProps, nextDisplayModel, currentVisiblePanes);
      main.dataset.paneCount = String(currentVisiblePanes.length);
      syncVisiblePanes(main, mainPane, inspectorPane, currentVisiblePanes);
      return true;
    },
  });

  return root;

  function syncInspectorHost(
    nextProps: ChartViewProps,
    nextDisplayModel: PlotDisplayModel,
    nextVisiblePanes: readonly ChartPane[],
  ): void {
    if (!nextVisiblePanes.includes("inspector")) {
      inspectorPlotView?.dispose();
      inspectorPlotView = null;
      inspectorPendingView = null;
      replaceChildrenIfChanged(inspectorHost);
      return;
    }

    if (nextDisplayModel.inspector) {
      inspectorPendingView = null;
      if (inspectorPlotView) {
        inspectorPlotView.update(createInspectorPlotMainViewProps(nextProps, nextDisplayModel));
        return;
      }

      inspectorPlotView = createPlotMainView(createInspectorPlotMainViewProps(nextProps, nextDisplayModel));
      replaceChildrenIfChanged(inspectorHost, inspectorPlotView.element);
      return;
    }

    inspectorPlotView?.dispose();
    inspectorPlotView = null;
    inspectorPendingView ??= createInspectorPendingView();
    replaceChildrenIfChanged(inspectorHost, inspectorPendingView);
  }
};

const isFastPendingDisplayTarget = (props: ChartViewProps): boolean =>
  Boolean(props.activeFileId) && props.processingStatus?.state === "processing";

const createPendingChartView = (
  root: ChartViewElement,
  props: ChartViewProps,
  visiblePanes: readonly ChartPane[],
): ChartViewElement => {
  const pending = createPendingDisplay();
  syncPendingChartView(root, pending, props, visiblePanes);
  root.append(pending.main);
  Object.defineProperty(root, "update", {
    value: (nextProps: ChartViewProps): boolean => {
      if (!isPendingChartViewProps(nextProps)) {
        return false;
      }

      syncPendingChartView(root, pending, nextProps, normalizeVisiblePanes(nextProps.visiblePanes));
      return true;
    },
  });
  return root;
};

const isPendingChartViewProps = (props: ChartViewProps): boolean =>
  props.hasChartData === true
    ? !props.plotDisplayModel
    : isFastPendingDisplayTarget(props);

type PendingDisplayParts = {
  readonly hint: HTMLElement;
  readonly main: HTMLElement;
  readonly status: HTMLElement;
  readonly title: HTMLElement;
};

const createPendingDisplay = (): PendingDisplayParts => {
  const main = document.createElement("div");
  main.className = "chart_view_main chart_view_pending_main";

  const pane = document.createElement("div");
  pane.className = "chart_view_main_pane";

  const host = document.createElement("div");
  host.className = "chart_view_host chart_view_pending_host";

  const surface = document.createElement("div");
  surface.className = "chart_view_pending_surface";
  surface.setAttribute("aria-live", "polite");

  const plotArea = document.createElement("div");
  plotArea.className = "chart_view_pending_plot";
  plotArea.append(
    createPendingRule("x"),
    createPendingRule("y"),
    createPendingLine(),
  );

  const status = document.createElement("p");
  status.className = "chart_view_pending_status";

  const title = document.createElement("p");
  title.className = "chart_view_pending_title";

  const hint = document.createElement("p");
  hint.className = "chart_view_pending_hint";

  surface.append(plotArea, status, title, hint);
  host.append(surface);
  pane.append(host);
  main.append(pane);

  return {
    hint,
    main,
    status,
    title,
  };
};

const syncPendingChartView = (
  root: ChartViewElement,
  pending: PendingDisplayParts,
  props: ChartViewProps,
  visiblePanes: readonly ChartPane[],
): void => {
  const fileId = String(props.activeFileId ?? "").trim();
  const plotType = props.activePlotType ?? "iv";
  root.dataset.chartDisplayState = "pending";
  root.dataset.chartFileId = fileId;
  root.dataset.pendingFileId = fileId;
  root.dataset.pendingPlotType = plotType;
  pending.main.dataset.paneCount = visiblePanes.includes("chart") ? "1" : "0";
  pending.status.textContent = localize("chart.pending.status", "Preparing chart");
  pending.title.textContent = fileId || localize("chart.pending.target", "Selected file");
  pending.hint.textContent = props.hasChartData === true
    ? localize("chart.pending.display.hint", "Building the first drawable chart frame.")
    : localize("chart.pending.data.hint", "Waiting for this file's chart data.");
};

const createPendingRule = (axis: "x" | "y"): HTMLElement => {
  const rule = document.createElement("div");
  rule.className = `chart_view_pending_axis chart_view_pending_axis_${axis}`;
  return rule;
};

const createPendingLine = (): HTMLElement => {
  const line = document.createElement("div");
  line.className = "chart_view_pending_line";
  return line;
};

const normalizeVisiblePanes = (
  visiblePanes: readonly ChartPane[] | undefined,
): readonly ChartPane[] => {
  if (!visiblePanes?.length) {
    return ["chart", "inspector"];
  }

  const next: ChartPane[] = [];
  for (const pane of visiblePanes) {
    if (!next.includes(pane)) {
      next.push(pane);
    }
  }
  return next.length ? next : ["chart"];
};

const syncVisiblePanes = (
  main: HTMLElement,
  mainPane: HTMLElement,
  inspectorPane: HTMLElement,
  visiblePanes: readonly ChartPane[],
): void => {
  const panes: HTMLElement[] = [];
  if (visiblePanes.includes("chart")) {
    panes.push(mainPane);
  }
  if (visiblePanes.includes("inspector")) {
    panes.push(inspectorPane);
  }
  replaceChildrenIfChanged(main, ...panes);
};

const canUpdateChartViewInPlace = (
  currentProps: ChartViewProps,
  nextProps: ChartViewProps,
): boolean =>
  currentProps.hasChartData === true &&
  nextProps.hasChartData === true &&
  Boolean(currentProps.plotDisplayModel) &&
  Boolean(nextProps.plotDisplayModel);

const createChartPlotMainViewProps = (
  props: ChartViewProps,
  plotDisplayModel: PlotDisplayModel,
): PlotMainViewProps => {
  const activePlotType = props.activePlotType ?? "iv";
  return {
    drawStrategy: "eager",
    model: plotDisplayModel.chart.model,
    onXAxisLabelChange: props.onXAxisLabelChange,
    onYAxisLabelChange: props.onYAxisLabelChange,
    originOpenPlotOptions: props.originOpenPlotOptions,
    plotAxisSettings: props.plotAxisSettings,
    plotType: activePlotType,
    plotXFactor: plotDisplayModel.chart.plotXFactor,
    plotXUnitLabel: plotDisplayModel.chart.plotXUnitLabel,
    plotYFactor: plotDisplayModel.chart.plotYFactor,
    plotYUnitLabel: plotDisplayModel.chart.plotYUnitLabel,
    renderSignature: createChartPaneRenderSignature(plotDisplayModel, "chart", activePlotType),
    xAxisLabelOverride: props.xAxisLabelOverride,
    yAxisLabelOverride: props.yAxisLabelOverride,
    yScaleMode: plotDisplayModel.chart.yScaleMode,
  };
};

const createInspectorPlotMainViewProps = (
  props: ChartViewProps,
  plotDisplayModel: PlotDisplayModel,
): PlotMainViewProps => {
  const activePlotType = props.activePlotType ?? "iv";
  const inspectorDisplayModel = plotDisplayModel.inspector;
  if (!inspectorDisplayModel) {
    throw new Error("Cannot create inspector plot view without inspector display model.");
  }

  return {
    drawStrategy: "eager",
    model: inspectorDisplayModel.model,
    onXAxisLabelChange: props.onInspectorXAxisLabelChange,
    onYAxisLabelChange: props.onInspectorYAxisLabelChange,
    originOpenPlotOptions: props.originOpenPlotOptions,
    plotAxisSettings: props.plotAxisSettings,
    plotType: activePlotType,
    plotXFactor: inspectorDisplayModel.plotXFactor,
    plotXUnitLabel: inspectorDisplayModel.plotXUnitLabel,
    plotYFactor: inspectorDisplayModel.plotYFactor,
    plotYUnitLabel: inspectorDisplayModel.plotYUnitLabel,
    renderSignature: createChartPaneRenderSignature(plotDisplayModel, "inspector", activePlotType),
    xAxisLabelOverride: props.inspectorXAxisLabelOverride,
    yAxisLabelOverride: props.inspectorYAxisLabelOverride,
    yScaleMode: inspectorDisplayModel.yScaleMode,
  };
};

const createInspectorPendingView = (): HTMLElement =>
  createEmptyView({
    hint: localize("chart.inspector.calculation.hint", "Preparing inspector calculations, please wait."),
    title: localize("chart.inspector.calculation.title", "Calculating inspector data..."),
  });

const ChartView = (props: ChartViewProps): ChartViewElement =>
  createChartView(props);

export default ChartView;

const createChartPaneRenderSignature = (
  displayModel: PlotDisplayModel,
  pane: "chart" | "inspector",
  activePlotType: string,
): string => {
  const paneDisplayModel = pane === "chart"
    ? displayModel.chart
    : displayModel.inspector;
  const model = paneDisplayModel?.model;
  const seriesSignature = model?.seriesList
    .map(series => `${series.id}:${series.data.length}`)
    .join(",") ?? "";

  return [
    displayModel.fileId,
    displayModel.plotType || activePlotType,
    pane,
    model?.pointsCount ?? 0,
    seriesSignature,
    model?.xDomain.join(",") ?? "",
    model?.yDomain.join(",") ?? "",
  ].join("|");
};
