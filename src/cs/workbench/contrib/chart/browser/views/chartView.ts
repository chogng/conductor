import { localize } from "src/cs/nls";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  type OriginPlotOptions,
} from "src/cs/workbench/contrib/origin/common/originPlotOptions";
import MainPlotChart from "src/cs/workbench/contrib/plot/browser/MainPlotChart";
import { createMainPlotModel } from "src/cs/workbench/contrib/plot/browser/mainPlotModel";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";
import {
  DEFAULT_PLOT_AXIS_SETTINGS,
  normalizePlotAxisSettings,
  type PlotAxisSettings,
} from "src/cs/workbench/contrib/plot/common/plotAxisSettings";
import { createEmptyView } from "src/cs/workbench/contrib/chart/browser/views/emptyView";
import type {
  IonIoffManualTargetsByFileId,
  IonIoffMethod,
  SsManualRanges,
  SsMethod,
} from "src/cs/workbench/contrib/session/browser/sessionContext";
import type {
  CleanedEntry,
  ProcessingStatus,
} from "src/cs/workbench/contrib/session/common/sessionTypes";
import { createInspectorView } from "src/cs/workbench/contrib/chart/browser/views/inspectorView";
import { createLocatorView } from "src/cs/workbench/contrib/chart/browser/views/locatorView";

import "src/cs/workbench/contrib/chart/browser/views/media/chartView.css";

type StateSetter<T> = (next: T | ((previous: T) => T)) => void;

export type ChartAuxiliaryPane = "locator" | "inspector";
export type ChartPane = "chart" | ChartAuxiliaryPane;

export type ChartViewProps = {
  visiblePanes?: readonly ChartPane[];
  activePlotType?: PlotType;
  cleanedData: CleanedEntry[];
  processingStatus?: Partial<ProcessingStatus>;
  activeFileId?: string | null;
  ionIoffMethod?: IonIoffMethod;
  ionIoffManualTargetsByFileId?: IonIoffManualTargetsByFileId;
  onActiveFileIdChange?: (nextFileId: string | null) => void;
  showFileSelect?: boolean;
  setIonIoffMethod?: (next: IonIoffMethod) => void;
  setIonIoffManualTargetsByFileId?: StateSetter<IonIoffManualTargetsByFileId>;
  ssMethod?: SsMethod;
  setSsMethod?: (next: SsMethod) => void;
  ssDiagnosticsEnabled?: boolean;
  setSsDiagnosticsEnabled?: (next: boolean) => void;
  vthDiagnosticsEnabled?: boolean;
  setVthDiagnosticsEnabled?: (next: boolean) => void;
  gmDiagnosticsEnabled?: boolean;
  setGmDiagnosticsEnabled?: (next: boolean) => void;
  ssShowFitLine?: boolean;
  setSsShowFitLine?: (next: boolean) => void;
  ssManualRanges?: SsManualRanges;
  setSsManualRanges?: (next: SsManualRanges) => void;
  originOpenPlotOptions?: OriginPlotOptions;
  onOriginOpenPlotOptionsChange?: (updates: unknown) => Promise<unknown> | void;
  plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  onPlotAxisSettingsChange?: (updates: unknown) => Promise<unknown> | void;
};

export const createChartView = (props: ChartViewProps): HTMLElement => {
  const {
    activePlotType = "iv",
    cleanedData = [],
    processingStatus,
    activeFileId: controlledActiveFileId = undefined,
    originOpenPlotOptions = DEFAULT_ORIGIN_PLOT_OPTIONS,
  } = props;
  const axisSettings = normalizePlotAxisSettings(
    props.plotAxisSettings,
    DEFAULT_PLOT_AXIS_SETTINGS,
  );
  const visiblePanes = normalizeVisiblePanes(props.visiblePanes);
  const root = document.createElement("section");
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

  const model = createMainPlotModel({
    activeFileId: controlledActiveFileId,
    plotType: activePlotType,
    cleanedData,
  });

  const chartHost = document.createElement("div");
  chartHost.className = "chart_view_host";
  chartHost.append(MainPlotChart({
    activeFile: model.activeFile,
    curveLineWidth: Number(originOpenPlotOptions.lineWidth) || DEFAULT_ORIGIN_PLOT_OPTIONS.lineWidth,
    curvePlotType: Number(originOpenPlotOptions?.type ?? DEFAULT_ORIGIN_PLOT_OPTIONS.type),
    effectiveYScale: "linear",
    focusedSeriesColor: "#2563eb",
    highlightOverlays: [],
    plotType: activePlotType,
    plotXFactor: 1,
    plotXUnitLabel: model.xUnitLabel,
    plotYFactor: 1,
    plotYUnitLabel: model.yUnitLabel,
    showGrid: axisSettings.showGrid,
    showMajorTicks: axisSettings.showMajorTicks,
    showMinorTicks: axisSettings.showMinorTicks,
    minorTickCount: axisSettings.minorTickCount === "" ? undefined : axisSettings.minorTickCount,
    tickLabelFontSize: axisSettings.tickLabelFontSize === "" ? undefined : axisSettings.tickLabelFontSize,
    axisTitleFontSize: axisSettings.axisTitleFontSize === "" ? undefined : axisSettings.axisTitleFontSize,
    legendFontSize: axisSettings.legendFontSize === "" ? undefined : axisSettings.legendFontSize,
    seriesList: model.seriesList,
    ssOverlayStyle: {
      fill: "#2563eb",
      fillOpacity: 0.08,
      stroke: "#2563eb",
      strokeOpacity: 0.8,
    },
    xDomain: model.xDomain,
    xLabelInterval: 1,
    xTickDigits: 4,
    yDomain: model.yDomain,
    yScaleMode: "linear",
  }));

  const main = document.createElement("div");
  main.className = "chart_view_main";
  main.dataset.paneCount = String(visiblePanes.length);

  const mainPane = document.createElement("div");
  mainPane.className = "chart_view_main_pane";
  mainPane.append(chartHost);

  const inspectorPane = createInspectorView({
    activePlotType,
    model,
    props,
  });

  if (visiblePanes.includes("chart")) {
    main.append(mainPane);
  }
  if (visiblePanes.includes("locator")) {
    main.append(createLocatorView(model));
  }
  if (visiblePanes.includes("inspector")) {
    main.append(inspectorPane);
  }
  root.append(main);

  return root;
};

const normalizeVisiblePanes = (
  visiblePanes: readonly ChartPane[] | undefined,
): readonly ChartPane[] => {
  if (!visiblePanes?.length) {
    return ["chart", "locator"];
  }

  const next: ChartPane[] = [];
  for (const pane of visiblePanes) {
    if (!next.includes(pane)) {
      next.push(pane);
    }
  }
  return next.length ? next : ["chart"];
};

const ChartView = (props: ChartViewProps): HTMLElement =>
  createChartView(props);

export default ChartView;
