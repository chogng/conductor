import type { TranslateFn } from "src/cs/platform/language/common/language";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  type OriginPlotOptions,
} from "src/cs/workbench/contrib/origin/common/originPlotOptions";
import MainPlotChart from "src/cs/workbench/contrib/plot/browser/MainPlotChart";
import { createMainPlotModel } from "src/cs/workbench/contrib/plot/browser/mainPlotModel";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";
import { createEmptyView } from "src/cs/workbench/contrib/chart/browser/emptyView";
import type {
  IonIoffManualTargetsByFileId,
  IonIoffMethod,
  SsManualRanges,
  SsMethod,
} from "src/cs/workbench/contrib/session/analysis-session-context";
import type {
  ProcessedEntry,
  ProcessingStatus,
} from "src/cs/workbench/contrib/session/common/sessionTypes";

type StateSetter<T> = (next: T | ((previous: T) => T)) => void;

export type ChartViewProps = {
  t: TranslateFn;
  activePlotType?: PlotType;
  processedData: ProcessedEntry[];
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
};

const appendStat = (parent: HTMLElement, label: string, value: string): void => {
  const item = document.createElement("div");
  item.className = "chart_view_stat";
  const labelElement = document.createElement("div");
  labelElement.className = "chart_view_stat_label";
  labelElement.textContent = label;
  const valueElement = document.createElement("div");
  valueElement.className = "chart_view_stat_value";
  valueElement.textContent = value;
  item.append(labelElement, valueElement);
  parent.append(item);
};

export const createChartView = ({
  activePlotType = "iv",
  processedData = [],
  processingStatus,
  activeFileId: controlledActiveFileId = undefined,
  t,
  originOpenPlotOptions = DEFAULT_ORIGIN_PLOT_OPTIONS,
}: ChartViewProps): HTMLElement => {
  const root = document.createElement("section");
  root.className = "chart_view";
  root.setAttribute("aria-label", t("analysis.visualization"));

  if (!processedData.length) {
    root.append(createEmptyView({
      hint: processingStatus?.state === "processing"
        ? t("da_analysis_processing_hint")
        : t("analysis.empty.hint"),
      title: processingStatus?.state === "processing"
        ? t("da_analysis_processing")
        : t("analysis.empty.title"),
    }));
    return root;
  }

  const model = createMainPlotModel({
    activeFileId: controlledActiveFileId,
    plotType: activePlotType,
    processedData,
  });

  const summary = document.createElement("div");
  summary.className = "chart_view_summary";
  appendStat(summary, t("analysis.seriesCount"), String(model.seriesList.length));
  appendStat(summary, t("analysis.pointsCount"), String(model.pointsCount));
  appendStat(summary, t("analysis.xDomain"), `${model.xDomain[0].toPrecision(4)} - ${model.xDomain[1].toPrecision(4)}`);
  appendStat(summary, t("analysis.yDomain"), `${model.yDomain[0].toPrecision(4)} - ${model.yDomain[1].toPrecision(4)}`);
  root.append(summary);

  const chartHost = document.createElement("div");
  chartHost.className = "chart_view_host";
  chartHost.append(MainPlotChart({
    activeFile: model.activeFile,
    curveLineWidth: 2,
    curvePlotType: Number(originOpenPlotOptions?.type ?? DEFAULT_ORIGIN_PLOT_OPTIONS.type),
    effectiveYScale: "linear",
    focusedSeriesColor: "#2563eb",
    highlightOverlays: [],
    plotType: activePlotType,
    plotXFactor: 1,
    plotXUnitLabel: model.xUnitLabel,
    plotYFactor: 1,
    plotYUnitLabel: model.yUnitLabel,
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
  root.append(chartHost);

  return root;
};

const ChartView = (props: ChartViewProps): HTMLElement =>
  createChartView(props);

export default ChartView;
