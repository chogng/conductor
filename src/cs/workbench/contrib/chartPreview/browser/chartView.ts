import type { TranslateFn } from "src/cs/platform/language/common/language";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  type OriginPlotOptions,
} from "src/cs/workbench/contrib/origin/common/originPlotOptions";
import type {
  IonIoffManualTargetsByFileId,
  IonIoffMethod,
  SsManualRanges,
  SsMethod,
} from "src/cs/workbench/contrib/session/analysis-session-context";
import type {
  ProcessedEntry,
  ProcessedSeries,
  ProcessingStatus,
} from "src/cs/workbench/contrib/session/common/sessionTypes";
import MainPlotChart from "src/cs/workbench/contrib/chart/browser/MainPlotChart";

type StateSetter<T> = (next: T | ((previous: T) => T)) => void;

export type ChartViewProps = {
  t: TranslateFn;
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

type PlotPoint = {
  x?: number;
  y?: number;
  yPositive?: number;
  yAbsPositive?: number;
};

type PlotSeries = {
  id: string;
  name: string;
  color?: string;
  data: PlotPoint[];
};

const getFiniteDomain = (values: number[], fallback: [number, number]): [number, number] => {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return fallback;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (min === max) return [min - 0.5, max + 0.5];
  return [min, max];
};

const createSeriesList = (file: ProcessedEntry | null): PlotSeries[] => {
  const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
  return (Array.isArray(file?.series) ? file.series : [])
    .map((series: ProcessedSeries, index: number) => {
      const xValues = xGroups[Number(series?.groupIndex)] ?? [];
      const yValues = Array.isArray(series?.y) ? series.y : [];
      const count = Math.min(xValues.length, yValues.length);
      if (!String(series?.id ?? "") || count <= 0) return null;
      const data: PlotPoint[] = [];
      for (let pointIndex = 0; pointIndex < count; pointIndex += 1) {
        const x = Number(xValues[pointIndex]);
        const y = Number(yValues[pointIndex]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        data.push({
          x,
          y,
          yPositive: y > 0 ? y : undefined,
          yAbsPositive: y !== 0 ? Math.abs(y) : undefined,
        });
      }
      return {
        id: String(series.id),
        name: String(series?.name ?? series?.legendValue ?? `Series ${index + 1}`),
        data,
      };
    })
    .filter((series: PlotSeries | null): series is PlotSeries => Boolean(series));
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

const createEmptyState = (message: string, hint = ""): HTMLElement => {
  const root = document.createElement("div");
  root.className = "chart_view_empty";
  const title = document.createElement("p");
  title.className = "chart_view_empty_title";
  title.textContent = message;
  root.append(title);
  if (hint) {
    const text = document.createElement("p");
    text.className = "chart_view_empty_hint";
    text.textContent = hint;
    root.append(text);
  }
  return root;
};

export const createChartView = ({
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
    root.append(createEmptyState(
      processingStatus?.state === "processing"
        ? t("da_analysis_processing")
        : t("analysis.empty.title"),
      processingStatus?.state === "processing"
        ? t("da_analysis_processing_hint")
        : t("analysis.empty.hint"),
    ));
    return root;
  }

  let activeFileId = controlledActiveFileId ?? processedData[0]?.fileId ?? null;
  const activeFile =
    processedData.find((file) => String(file?.fileId ?? "") === String(activeFileId ?? "")) ??
    processedData[0] ??
    null;

  const seriesList = createSeriesList(activeFile);
  const allX = seriesList.flatMap((series) => series.data.map((point) => Number(point.x)));
  const allY = seriesList.flatMap((series) => series.data.map((point) => Number(point.y)));
  const xDomain = getFiniteDomain(allX, [0, 1]);
  const yDomain = getFiniteDomain(allY, [0, 1]);

  const summary = document.createElement("div");
  summary.className = "chart_view_summary";
  appendStat(summary, t("analysis.seriesCount"), String(seriesList.length));
  appendStat(summary, t("analysis.pointsCount"), String(seriesList.reduce((sum, series) => sum + series.data.length, 0)));
  appendStat(summary, t("analysis.xDomain"), `${xDomain[0].toPrecision(4)} - ${xDomain[1].toPrecision(4)}`);
  appendStat(summary, t("analysis.yDomain"), `${yDomain[0].toPrecision(4)} - ${yDomain[1].toPrecision(4)}`);
  root.append(summary);

  const chartHost = document.createElement("div");
  chartHost.className = "chart_view_host";
  chartHost.append(MainPlotChart({
    activeFile,
    curveLineWidth: 2,
    curvePlotType: Number(originOpenPlotOptions?.type ?? DEFAULT_ORIGIN_PLOT_OPTIONS.type),
    effectiveYScale: "linear",
    focusedSeriesColor: "#2563eb",
    highlightOverlays: [],
    plotType: "iv",
    plotXFactor: 1,
    plotXUnitLabel: String(activeFile?.xUnit ?? ""),
    plotYFactor: 1,
    plotYUnitLabel: String(activeFile?.yUnit ?? ""),
    seriesList,
    ssOverlayStyle: {
      fill: "#2563eb",
      fillOpacity: 0.08,
      stroke: "#2563eb",
      strokeOpacity: 0.8,
    },
    xDomain,
    xLabelInterval: 1,
    xTickDigits: 4,
    yDomain,
    yScaleMode: "linear",
  }));
  root.append(chartHost);

  return root;
};

const ChartView = (props: ChartViewProps): HTMLElement =>
  createChartView(props);

export default ChartView;
