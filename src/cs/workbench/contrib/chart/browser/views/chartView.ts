/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { createPlotMainView } from "src/cs/workbench/contrib/plot/browser/plotView";
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
};

export const createChartView = (props: ChartViewProps): ChartViewElement => {
  const {
    activePlotType = "iv",
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

  const chartPlotView = createPlotMainView({
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
    xAxisLabelOverride: props.xAxisLabelOverride,
    yAxisLabelOverride: props.yAxisLabelOverride,
    yScaleMode: plotDisplayModel.chart.yScaleMode,
  });
  const inspectorPlotView = createPlotMainView({
    model: plotDisplayModel.inspector.model,
    onXAxisLabelChange: props.onInspectorXAxisLabelChange,
    onYAxisLabelChange: props.onInspectorYAxisLabelChange,
    originOpenPlotOptions: props.originOpenPlotOptions,
    plotAxisSettings: props.plotAxisSettings,
    plotType: activePlotType,
    plotXFactor: plotDisplayModel.inspector.plotXFactor,
    plotXUnitLabel: plotDisplayModel.inspector.plotXUnitLabel,
    plotYFactor: plotDisplayModel.inspector.plotYFactor,
    plotYUnitLabel: plotDisplayModel.inspector.plotYUnitLabel,
    xAxisLabelOverride: props.inspectorXAxisLabelOverride,
    yAxisLabelOverride: props.inspectorYAxisLabelOverride,
    yScaleMode: plotDisplayModel.inspector.yScaleMode,
  });

  const chartHost = document.createElement("div");
  chartHost.className = "chart_view_host";
  chartHost.append(chartPlotView.element);

  const inspectorHost = document.createElement("div");
  inspectorHost.className = "chart_view_host";
  inspectorHost.append(inspectorPlotView.element);

  const main = document.createElement("div");
  main.className = "chart_view_main";
  main.dataset.paneCount = String(visiblePanes.length);

  const mainPane = document.createElement("div");
  mainPane.className = "chart_view_main_pane";
  mainPane.append(chartHost);

  const inspectorPane = document.createElement("div");
  inspectorPane.className = "chart_view_main_pane chart_view_inspector_pane";
  inspectorPane.append(inspectorHost);

  if (visiblePanes.includes("chart")) {
    main.append(mainPane);
  }
  if (visiblePanes.includes("inspector")) {
    main.append(inspectorPane);
  }
  root.append(main);
  Object.defineProperty(root, "dispose", {
    value: (): void => {
      chartPlotView.dispose();
      inspectorPlotView.dispose();
      root.replaceChildren();
    },
  });
  Object.defineProperty(root, "editAxisTitle", {
    value: (pane: ChartPane, axis: "x" | "y"): boolean => {
      if (pane === "inspector") {
        return inspectorPlotView.editAxisTitle(axis);
      }

      return chartPlotView.editAxisTitle(axis);
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

const ChartView = (props: ChartViewProps): ChartViewElement =>
  createChartView(props);

export default ChartView;
