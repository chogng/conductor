import { createButton } from "src/cs/base/browser/ui/button/button";
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
  ProcessingStatus,
} from "src/cs/workbench/contrib/session/common/sessionTypes";
import MainPlotChart from "src/cs/workbench/contrib/chart/browser/MainPlotChart";
import OriginExportToolbar, {
  type OriginCurveExportSeriesOption,
  type OriginExportContentOption,
} from "src/cs/workbench/contrib/export/browser/OriginExportToolbar";
import type {
  OriginCanvasExportScope,
  OriginCurveExportMode,
  OriginFilteredCanvasKind,
} from "src/cs/workbench/contrib/export/browser/originCanvasExport";
import type { OriginExportContentKey, OriginExportMode } from "src/cs/workbench/contrib/export/common/originSelectionExport";

type StateSetter<T> = (next: T | ((previous: T) => T)) => void;

type AnalysisChartsProps = {
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

const ORIGIN_EXPORT_CONTENT_OPTIONS: OriginExportContentOption[] = [
  { group: "basic", key: "iv", labelKey: "da_origin_export_content_iv" },
  { group: "derived", key: "metrics", labelKey: "da_origin_export_content_metrics" },
  { group: "derived", key: "gm", labelKey: "da_origin_export_content_gm" },
  { group: "derived", key: "ss", labelKey: "da_origin_export_content_ss" },
  { group: "derived", key: "vth", labelKey: "da_origin_export_content_vth" },
];

const getFiniteDomain = (values: number[], fallback: [number, number]): [number, number] => {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return fallback;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (min === max) return [min - 0.5, max + 0.5];
  return [min, max];
};

const createFileSelect = ({
  activeFileId,
  onChange,
  processedData,
}: {
  activeFileId: string | null;
  onChange?: (nextFileId: string | null) => void;
  processedData: ProcessedEntry[];
}): HTMLSelectElement => {
  const select = document.createElement("select");
  select.className = "analysis_file_select dropdown-field dropdown-field--sm";
  select.value = activeFileId ?? "";
  for (const file of processedData) {
    const fileId = String(file?.fileId ?? "");
    if (!fileId) continue;
    const option = document.createElement("option");
    option.value = fileId;
    option.textContent = String(file?.fileName ?? fileId).replace(/\.csv$/i, "");
    select.append(option);
  }
  select.addEventListener("change", () => onChange?.(select.value || null));
  return select;
};

const createSeriesList = (file: any): PlotSeries[] => {
  const xGroups = Array.isArray(file?.xGroups) ? file.xGroups : [];
  return (Array.isArray(file?.series) ? file.series : [])
    .map((series: any, index: number) => {
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

const createOriginCurveOptions = (file: any): OriginCurveExportSeriesOption[] =>
  (Array.isArray(file?.series) ? file.series : [])
    .map((series: any, index: number) => {
      const seriesId = String(series?.id ?? "");
      if (!seriesId) return null;
      return {
        key: seriesId,
        label: String(series?.name ?? series?.legendValue ?? `Series ${index + 1}`),
        sourceFileId: String(file?.fileId ?? ""),
        sourceSeriesId: seriesId,
      };
    })
    .filter((option: OriginCurveExportSeriesOption | null): option is OriginCurveExportSeriesOption => Boolean(option));

const appendStat = (parent: HTMLElement, label: string, value: string): void => {
  const item = document.createElement("div");
  item.className = "analysis_stat";
  const labelElement = document.createElement("div");
  labelElement.className = "analysis_stat_label";
  labelElement.textContent = label;
  const valueElement = document.createElement("div");
  valueElement.className = "analysis_stat_value";
  valueElement.textContent = value;
  item.append(labelElement, valueElement);
  parent.append(item);
};

const createEmptyState = (message: string, hint = ""): HTMLElement => {
  const root = document.createElement("div");
  root.className = "analysis_empty";
  const title = document.createElement("p");
  title.className = "analysis_empty_title";
  title.textContent = message;
  root.append(title);
  if (hint) {
    const text = document.createElement("p");
    text.className = "analysis_empty_hint";
    text.textContent = hint;
    root.append(text);
  }
  return root;
};

export const createAnalysisCharts = ({
  processedData = [],
  processingStatus,
  activeFileId: controlledActiveFileId = undefined,
  onActiveFileIdChange = undefined,
  showFileSelect = true,
  t,
  ionIoffMethod = "auto",
  setIonIoffMethod = () => {},
  ssMethod = "auto",
  setSsMethod = () => {},
  ssDiagnosticsEnabled = true,
  setSsDiagnosticsEnabled = () => {},
  vthDiagnosticsEnabled = false,
  setVthDiagnosticsEnabled = () => {},
  gmDiagnosticsEnabled = false,
  setGmDiagnosticsEnabled = () => {},
  ssShowFitLine = true,
  setSsShowFitLine = () => {},
  originOpenPlotOptions = DEFAULT_ORIGIN_PLOT_OPTIONS,
}: AnalysisChartsProps): HTMLElement => {
  const root = document.createElement("section");
  root.className = "analysis_charts";
  root.setAttribute("aria-label", t("da_analysis_visualization"));

  if (!processedData.length) {
    root.append(createEmptyState(
      processingStatus?.state === "processing"
        ? t("da_analysis_processing")
        : t("da_analysis_empty_title"),
      processingStatus?.state === "processing"
        ? t("da_analysis_processing_hint")
        : t("da_analysis_empty_hint"),
    ));
    return root;
  }

  let activeFileId = controlledActiveFileId ?? processedData[0]?.fileId ?? null;
  const activeFile =
    processedData.find((file) => String(file?.fileId ?? "") === String(activeFileId ?? "")) ??
    processedData[0] ??
    null;
  activeFileId = activeFile?.fileId ?? null;

  const header = document.createElement("div");
  header.className = "analysis_charts_header";
  const title = document.createElement("div");
  title.className = "analysis_charts_title";
  const heading = document.createElement("h2");
  heading.className = "analysis_charts_heading";
  heading.textContent = String(activeFile?.fileName ?? t("da_analysis_visualization")).replace(/\.csv$/i, "");
  const subtitle = document.createElement("p");
  subtitle.className = "analysis_charts_subtitle";
  subtitle.textContent = t("da_analysis_file_count", { count: processedData.length });
  title.append(heading, subtitle);
  header.append(title);

  if (showFileSelect) {
    header.append(createFileSelect({
      activeFileId,
      onChange: onActiveFileIdChange,
      processedData,
    }));
  }
  root.append(header);

  const seriesList = createSeriesList(activeFile);
  const allX = seriesList.flatMap((series) => series.data.map((point) => Number(point.x)));
  const allY = seriesList.flatMap((series) => series.data.map((point) => Number(point.y)));
  const xDomain = getFiniteDomain(allX, [0, 1]);
  const yDomain = getFiniteDomain(allY, [0, 1]);

  const controls = document.createElement("div");
  controls.className = "analysis_charts_controls";
  const ionToggle = createButton({
    label: ionIoffMethod === "manual" ? t("da_ion_ioff_manual") : t("da_ion_ioff_auto"),
    size: "sm",
    variant: "secondary",
  });
  ionToggle.addEventListener("click", () => setIonIoffMethod(ionIoffMethod === "manual" ? "auto" : "manual"));
  const ssToggle = createButton({
    label: ssMethod === "manual" ? t("da_ss_method_manual") : t("da_ss_method_auto"),
    size: "sm",
    variant: "secondary",
  });
  ssToggle.addEventListener("click", () => setSsMethod(ssMethod === "manual" ? "auto" : "manual"));
  const gmToggle = createButton({
    label: t("da_gm_diagnostics"),
    size: "sm",
    variant: gmDiagnosticsEnabled ? "primary" : "secondary",
  });
  gmToggle.addEventListener("click", () => setGmDiagnosticsEnabled(!gmDiagnosticsEnabled));
  const ssDiagnosticsToggle = createButton({
    label: t("da_ss_diagnostics"),
    size: "sm",
    variant: ssDiagnosticsEnabled ? "primary" : "secondary",
  });
  ssDiagnosticsToggle.addEventListener("click", () => setSsDiagnosticsEnabled(!ssDiagnosticsEnabled));
  const vthToggle = createButton({
    label: t("da_vth_diagnostics"),
    size: "sm",
    variant: vthDiagnosticsEnabled ? "primary" : "secondary",
  });
  vthToggle.addEventListener("click", () => setVthDiagnosticsEnabled(!vthDiagnosticsEnabled));
  const ssFitToggle = createButton({
    label: t("da_ss_show_fit_line"),
    size: "sm",
    variant: ssShowFitLine ? "primary" : "secondary",
  });
  ssFitToggle.addEventListener("click", () => setSsShowFitLine(!ssShowFitLine));
  controls.append(ionToggle, ssToggle, gmToggle, ssDiagnosticsToggle, vthToggle, ssFitToggle);
  root.append(controls);

  const summary = document.createElement("div");
  summary.className = "analysis_summary_grid";
  appendStat(summary, t("da_analysis_series_count"), String(seriesList.length));
  appendStat(summary, t("da_analysis_points_count"), String(seriesList.reduce((sum, series) => sum + series.data.length, 0)));
  appendStat(summary, t("da_axis_x_domain"), `${xDomain[0].toPrecision(4)} - ${xDomain[1].toPrecision(4)}`);
  appendStat(summary, t("da_axis_y_domain"), `${yDomain[0].toPrecision(4)} - ${yDomain[1].toPrecision(4)}`);
  root.append(summary);

  const chartHost = document.createElement("div");
  chartHost.className = "analysis_chart_host";
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

  const selectedCurveKeys = new Set(seriesList.map((series) => series.id));
  const selectedContentKeys: OriginExportContentKey[] = ["iv"];
  let originMode: OriginExportMode = "merged";
  let canvasScope: OriginCanvasExportScope = "current";
  let filteredKind: OriginFilteredCanvasKind = "output";
  let curveMode: OriginCurveExportMode = "all";
  const exportHost = OriginExportToolbar({
    curveOptions: createOriginCurveOptions(activeFile),
    hasMixedExportYScales: false,
    mode: originMode,
    onExportOriginZip: () => undefined,
    onModeChange: (next) => {
      originMode = next;
    },
    onOpenInOrigin: () => undefined,
    onSelectedCurveOptionKeysChange: () => undefined,
    originCanvasExportScope: canvasScope,
    originExportContentOptions: ORIGIN_EXPORT_CONTENT_OPTIONS,
    originFilteredCanvasKind: filteredKind,
    replaceMatchingOriginSeriesAcrossFiles: () => ({
      matchedFileCount: 0,
      matchedSeriesCount: 0,
    }),
    resolvedCurveExportMode: curveMode,
    scopedFileIds: activeFileId ? [activeFileId] : [],
    selectedContentKeys,
    selectedCurveOptionKeySet: selectedCurveKeys,
    setContentKeys: () => undefined,
    setOriginCanvasExportScope: (next) => {
      canvasScope = typeof next === "function" ? next(canvasScope) : next;
    },
    setOriginFilteredCanvasKind: (next) => {
      filteredKind = typeof next === "function" ? next(filteredKind) : next;
    },
    setResolvedCurveExportMode: (next) => {
      curveMode = next;
    },
    showFilteredCanvasKindSelect: true,
    t,
  });
  root.append(exportHost);

  return root;
};

const AnalysisCharts = (props: AnalysisChartsProps): any =>
  createAnalysisCharts(props);

export default AnalysisCharts;
