import { localize } from "src/cs/nls";
import type { OriginPlotOptions } from "src/cs/workbench/contrib/origin/common/originPlotOptions";
import { createPlotMainView } from "src/cs/workbench/contrib/plot/browser/plotMainView";
import { createPlotMainRenderModel } from "src/cs/workbench/contrib/plot/browser/plotMainRenderModel";
import {
  createSecondCalculatedData,
  getCalculatedData,
  type CalculatedData,
  type CalculatedDataByKey,
} from "src/cs/workbench/contrib/calculation/common/calculatedData";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";
import type { PlotAxisSettings } from "src/cs/workbench/contrib/plot/common/plotAxisSettings";
import {
  getXUnitMeta,
  getYUnitMeta,
  normalizeXUnit,
  normalizeYUnit,
  type XUnit,
  type YUnit,
} from "src/cs/workbench/contrib/plot/common/units";
import { createEmptyView } from "src/cs/workbench/contrib/chart/browser/views/emptyView";
import { filterCalculatedDataSeries } from "src/cs/workbench/contrib/chart/common/chartLegendVisibility";
import type {
  IonIoffManualTargetsByFileId,
  IonIoffMethod,
  SsManualRanges,
  SsMethod,
} from "src/cs/workbench/services/session/common/session";
import type {
  CleanedEntry,
  ProcessingStatus,
} from "src/cs/workbench/services/session/common/sessionTypes";

import "src/cs/workbench/contrib/chart/browser/views/media/chartView.css";

type StateSetter<T> = (next: T | ((previous: T) => T)) => void;

export type ChartPane = "chart" | "inspector";

export type ChartViewProps = {
  visiblePanes?: readonly ChartPane[];
  activePlotType?: PlotType;
  onActivePlotTypeChange?: (next: PlotType) => void;
  cleanedData: CleanedEntry[];
  calculatedDataByKey?: CalculatedDataByKey;
  processingStatus?: Partial<ProcessingStatus>;
  activeFileId?: string | null;
  ionIoffMethod?: IonIoffMethod;
  ionIoffManualTargetsByFileId?: IonIoffManualTargetsByFileId;
  onActiveFileIdChange?: (nextFileId: string | null) => void;
  showFileSelect?: boolean;
  xUnitByFileId?: Readonly<Record<string, string>>;
  yUnitByFileId?: Readonly<Record<string, string>>;
  yScaleByFileId?: Readonly<Record<string, string>>;
  onPlotUnitChange?: (
    fileId: string,
    axis: "x" | "y",
    unit: XUnit | YUnit,
  ) => Promise<unknown> | void;
  onPlotYScaleChange?: (
    fileId: string,
    scale: "linear" | "log",
  ) => Promise<unknown> | void;
  hiddenLegendKeys?: readonly string[];
  legendLabels?: Readonly<Record<string, string>>;
  inspectorXAxisLabelOverride?: string;
  inspectorYAxisLabelOverride?: string;
  onInspectorXAxisLabelChange?: (nextLabel: string) => void;
  onInspectorYAxisLabelChange?: (nextLabel: string) => void;
  onXAxisLabelChange?: (nextLabel: string) => void;
  onYAxisLabelChange?: (nextLabel: string) => void;
  xAxisLabelOverride?: string;
  yAxisLabelOverride?: string;
  setIonIoffMethod?: (next: IonIoffMethod) => void;
  setIonIoffManualTargetsByFileId?: StateSetter<IonIoffManualTargetsByFileId>;
  ssMethod?: SsMethod;
  setSsMethod?: (next: SsMethod) => void;
  ssShowFitLine?: boolean;
  setSsShowFitLine?: (next: boolean) => void;
  ssManualRanges?: SsManualRanges;
  setSsManualRanges?: (next: SsManualRanges) => void;
  originOpenPlotOptions?: OriginPlotOptions;
  onOriginOpenPlotOptionsChange?: (updates: unknown) => Promise<unknown> | void;
  plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  onPlotAxisSettingsChange?: (updates: unknown) => Promise<unknown> | void;
};

export type ChartViewElement = HTMLElement & {
  readonly dispose?: () => void;
  readonly editAxisTitle?: (pane: ChartPane, axis: "x" | "y") => boolean;
};

export const createChartView = (props: ChartViewProps): ChartViewElement => {
  const {
    activePlotType = "iv",
    calculatedDataByKey,
    cleanedData = [],
    processingStatus,
    activeFileId: controlledActiveFileId = undefined,
  } = props;
  const visiblePanes = normalizeVisiblePanes(props.visiblePanes);
  const root = document.createElement("section") as ChartViewElement;
  root.className = "chart_view";
  root.setAttribute("aria-label", localize("analysis.visualization", "Analysis & Visualization"));

  if (!cleanedData.length) {
    root.append(createEmptyView({
      hint: processingStatus?.state === "processing"
        ? localize("analysis_processing_hint", "Extracting and preparing chart data, please wait.")
        : localize("analysis.empty.hint", "Apply a template to generate chart data."),
      title: processingStatus?.state === "processing"
        ? localize("analysis_processing", "Processing analysis data...")
        : localize("analysis.empty.title", "No analysis data"),
    }));
    return root;
  }

  const calculatedData = getCalculatedData(
    calculatedDataByKey,
    activePlotType,
    controlledActiveFileId,
  );
  if (!calculatedData) {
    root.append(createEmptyView({
      hint: localize("analysis_calculation_hint", "Preparing chart calculations, please wait."),
      title: localize("analysis_calculation", "Calculating chart data..."),
    }));
    return root;
  }

  const filteredData = applyLegendLabels(
    filterCalculatedDataSeries(calculatedData, props.hiddenLegendKeys ?? []),
    props.legendLabels ?? {},
  );
  const displayUnits = resolveDisplayUnits(filteredData, props);
  const yScale = resolveYScale(filteredData, props);
  const inspectorYUnitLabel = displayUnits.yUnit
    ? `d(${displayUnits.yUnit})/dx`
    : undefined;

  const chartPlotView = createPlotMainView({
    model: createPlotMainRenderModel(filteredData),
    onXAxisLabelChange: props.onXAxisLabelChange,
    onYAxisLabelChange: props.onYAxisLabelChange,
    originOpenPlotOptions: props.originOpenPlotOptions,
    plotAxisSettings: props.plotAxisSettings,
    plotType: activePlotType,
    plotXFactor: displayUnits.xFactor,
    plotXUnitLabel: displayUnits.xUnit,
    plotYFactor: displayUnits.yFactor,
    plotYUnitLabel: displayUnits.yUnit,
    xAxisLabelOverride: props.xAxisLabelOverride,
    yAxisLabelOverride: props.yAxisLabelOverride,
    yScaleMode: yScale,
  });
  const inspectorPlotView = createPlotMainView({
    model: createPlotMainRenderModel(createSecondCalculatedData(filteredData)),
    onXAxisLabelChange: props.onInspectorXAxisLabelChange,
    onYAxisLabelChange: props.onInspectorYAxisLabelChange,
    originOpenPlotOptions: props.originOpenPlotOptions,
    plotAxisSettings: props.plotAxisSettings,
    plotType: activePlotType,
    plotXFactor: displayUnits.xFactor,
    plotXUnitLabel: displayUnits.xUnit,
    plotYFactor: displayUnits.yFactor,
    plotYUnitLabel: inspectorYUnitLabel,
    xAxisLabelOverride: props.inspectorXAxisLabelOverride,
    yAxisLabelOverride: props.inspectorYAxisLabelOverride,
    yScaleMode: yScale,
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

const resolveYScale = (
  data: CalculatedData,
  props: Pick<ChartViewProps, "yScaleByFileId">,
): "linear" | "log" => {
  const fileId = String(data.source.fileId ?? "").trim();
  return fileId && props.yScaleByFileId?.[fileId] === "log" ? "log" : "linear";
};

export const resolveDisplayUnits = (
  data: CalculatedData,
  props: Pick<ChartViewProps, "xUnitByFileId" | "yUnitByFileId">,
): {
  readonly xFactor: number;
  readonly xUnit: XUnit | undefined;
  readonly yFactor: number;
  readonly yUnit: YUnit | undefined;
} => {
  const fileId = String(data.source.fileId ?? "").trim();
  const sourceXUnit = normalizeXUnit(data.xUnitLabel, "V") || "V";
  const sourceYUnit = normalizeYUnit(data.yUnitLabel);
  const xUnit = normalizeXUnit(
    fileId ? props.xUnitByFileId?.[fileId] : undefined,
    sourceXUnit,
  ) || sourceXUnit;
  const yUnit = sourceYUnit
    ? normalizeYUnit(
        fileId ? props.yUnitByFileId?.[fileId] : undefined,
        sourceYUnit,
      ) || sourceYUnit
    : undefined;

  return {
    xFactor: getXUnitMeta(xUnit).factor,
    xUnit,
    yFactor: yUnit ? getYUnitMeta(yUnit).factor : 1,
    yUnit,
  };
};

const applyLegendLabels = (
  data: CalculatedData,
  legendLabels: Readonly<Record<string, string>>,
): CalculatedData => {
  const labels = Object.keys(legendLabels);
  if (!labels.length) {
    return data;
  }

  return {
    ...data,
    seriesList: data.seriesList.map((series) => ({
      ...series,
      name: legendLabels[series.id] ?? series.name,
    })),
  };
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
