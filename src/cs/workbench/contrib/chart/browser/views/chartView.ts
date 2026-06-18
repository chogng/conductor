/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import {
  createPlotMainView,
  type PlotMainView,
  type PlotMainViewProps,
} from "src/cs/workbench/contrib/plot/browser/plotView";
import type {
  ChartPane,
  ChartViewInput,
} from "src/cs/workbench/services/chart/common/chartViewInput";
import type { OriginPlotOptions } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type { PlotDisplayModel } from "src/cs/workbench/services/plot/common/plot";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import { createEmptyView } from "src/cs/workbench/contrib/chart/browser/views/emptyView";
import type {
  ProcessingStatus,
} from "src/cs/workbench/services/session/common/sessionTypes";

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
  readonly update?: (props: ChartViewProps) => boolean;
};

export const createChartView = (props: ChartViewProps): ChartViewElement => {
  const {
    hasChartData = false,
    plotDisplayModel = null,
    processingStatus,
  } = props;
  const visiblePanes = normalizeVisiblePanes(props.visiblePanes);
  const root = document.createElement("section") as ChartViewElement;
  root.className = "chart_view";
  root.setAttribute("aria-label", localize("chart.title", "Chart"));

  if (!hasChartData) {
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
    root.append(createEmptyView({
      hint: localize("chart.calculation.hint", "Preparing chart calculations, please wait."),
      title: localize("chart.calculation.title", "Calculating chart data..."),
    }));
    return root;
  }

  let currentProps = props;
  let currentVisiblePanes = visiblePanes;
  const chartPlotView = createPlotMainView(createChartPlotMainViewProps(props, plotDisplayModel));
  const inspectorDisplayModel = plotDisplayModel.inspector;
  let inspectorPlotView: PlotMainView | null = inspectorDisplayModel
    ? createPlotMainView(createInspectorPlotMainViewProps(props, plotDisplayModel))
    : null;

  const chartHost = document.createElement("div");
  chartHost.className = "chart_view_host";
  chartHost.append(chartPlotView.element);

  const inspectorHost = document.createElement("div");
  inspectorHost.className = "chart_view_host";
  inspectorHost.append(inspectorPlotView?.element ?? createInspectorPendingView());

  const main = document.createElement("div");
  main.className = "chart_view_main";
  main.dataset.paneCount = String(visiblePanes.length);

  const mainPane = document.createElement("div");
  mainPane.className = "chart_view_main_pane";
  mainPane.append(chartHost);

  const inspectorPane = document.createElement("div");
  inspectorPane.className = "chart_view_main_pane chart_view_inspector_pane";
  inspectorPane.append(inspectorHost);

  syncVisiblePanes(main, mainPane, inspectorPane, visiblePanes);
  root.append(main);
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

      const nextInspectorDisplayModel = nextDisplayModel.inspector;
      if (nextInspectorDisplayModel) {
        if (inspectorPlotView) {
          inspectorPlotView.update(createInspectorPlotMainViewProps(nextProps, nextDisplayModel));
        } else {
          inspectorPlotView = createPlotMainView(createInspectorPlotMainViewProps(nextProps, nextDisplayModel));
          inspectorHost.replaceChildren(inspectorPlotView.element);
        }
      } else if (inspectorPlotView) {
        inspectorPlotView.dispose();
        inspectorPlotView = null;
        inspectorHost.replaceChildren(createInspectorPendingView());
      }

      currentProps = nextProps;
      currentVisiblePanes = normalizeVisiblePanes(nextProps.visiblePanes);
      main.dataset.paneCount = String(currentVisiblePanes.length);
      syncVisiblePanes(main, mainPane, inspectorPane, currentVisiblePanes);
      return true;
    },
  });

  return root;
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
  if (
    panes.length === main.children.length &&
    panes.every((pane, index) => main.children[index] === pane)
  ) {
    return;
  }
  main.replaceChildren(...panes);
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
    drawStrategy: "stable",
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
