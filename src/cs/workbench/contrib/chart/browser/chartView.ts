import type { TranslateFn } from "src/cs/platform/language/common/language";
import { createSwitch } from "src/cs/base/browser/ui/switch/switch";
import CanvasDiagnosticsChart from "src/cs/workbench/contrib/diagnostics/browser/CanvasDiagnosticsChart";
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
type DiagnosticsState = {
  readonly enabled: boolean;
  readonly label: string;
  readonly setEnabled?: (next: boolean) => void;
};

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

export const createChartView = (props: ChartViewProps): HTMLElement => {
  const {
    activePlotType = "iv",
    processedData = [],
    processingStatus,
    activeFileId: controlledActiveFileId = undefined,
    t,
    originOpenPlotOptions = DEFAULT_ORIGIN_PLOT_OPTIONS,
  } = props;
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

  const chartArea = document.createElement("div");
  chartArea.className = "chart_view_chart_area";

  const mainArea = document.createElement("div");
  mainArea.className = "chart_view_main_area";
  mainArea.append(chartHost);

  const diagnosticsArea = createDiagnosticsArea({
    activePlotType,
    model,
    props,
  });

  chartArea.append(mainArea, diagnosticsArea);
  root.append(chartArea);

  return root;
};

const createDiagnosticsArea = ({
  activePlotType,
  model,
  props,
}: {
  readonly activePlotType: PlotType;
  readonly model: ReturnType<typeof createMainPlotModel>;
  readonly props: Pick<
    ChartViewProps,
    | "activePlotType"
    | "gmDiagnosticsEnabled"
    | "processedData"
    | "processingStatus"
    | "setGmDiagnosticsEnabled"
    | "setSsDiagnosticsEnabled"
    | "setVthDiagnosticsEnabled"
    | "ssDiagnosticsEnabled"
    | "t"
    | "vthDiagnosticsEnabled"
  >;
}): HTMLElement => {
  const diagnostics = getDiagnosticsState(activePlotType, props);
  const section = document.createElement("section");
  section.className = "chart_view_diagnostics_area";
  section.dataset.state = diagnostics?.enabled ? "on" : "off";
  section.setAttribute("aria-label", props.t("da_chart_diagnostics_heading"));

  const header = document.createElement("div");
  header.className = "chart_view_diagnostics_header";

  const title = document.createElement("div");
  title.className = "chart_view_diagnostics_title";
  title.textContent = diagnostics?.label ?? props.t("da_chart_diagnostics_heading");
  header.append(title);

  if (diagnostics) {
    header.append(createDiagnosticsSwitch(diagnostics));
  }
  section.append(header);

  const content = document.createElement("div");
  content.className = "chart_view_diagnostics_content";
  if (diagnostics?.enabled) {
    content.append(CanvasDiagnosticsChart({
      ariaLabel: diagnostics.label,
      series: model.seriesList.map((series) => ({
        color: series.color,
        data: series.data,
        id: series.id,
        lineName: series.name,
      })),
      xDomain: model.xDomain,
      xFactor: 1,
      xLabelInterval: 1,
      xTickDigits: 4,
      xTooltipDigits: 4,
      xUnitLabel: model.xUnitLabel,
      yAxisLabel: model.yUnitLabel,
      yDomain: model.yDomain,
      yTooltipMinDigits: 2,
    }));
  } else {
    const empty = document.createElement("div");
    empty.className = "chart_view_diagnostics_empty";
    empty.textContent = diagnostics
      ? props.t("da_chart_diagnostics_disabled")
      : props.t("da_chart_diagnostics_unavailable");
    content.append(empty);
  }
  section.append(content);
  return section;
};

const createDiagnosticsSwitch = ({
  enabled,
  label,
  setEnabled,
}: DiagnosticsState): HTMLElement => {
  const control = document.createElement("div");
  control.className = "chart_view_diagnostics_switch";

  const text = document.createElement("span");
  text.className = "chart_view_diagnostics_switch_label";
  text.textContent = label;

  const button = createSwitch({
    checked: enabled,
    disabled: !setEnabled,
  });
  button.setAttribute("aria-label", label);
  button.addEventListener("click", () => {
    setEnabled?.(!enabled);
  });

  control.append(text, button);
  return control;
};

const getDiagnosticsState = (
  activePlotType: PlotType,
  props: Pick<
    ChartViewProps,
    | "gmDiagnosticsEnabled"
    | "setGmDiagnosticsEnabled"
    | "setSsDiagnosticsEnabled"
    | "setVthDiagnosticsEnabled"
    | "ssDiagnosticsEnabled"
    | "t"
    | "vthDiagnosticsEnabled"
  >,
): DiagnosticsState | null => {
  switch (activePlotType) {
    case "gm":
      return {
        enabled: Boolean(props.gmDiagnosticsEnabled),
        label: props.t("analysis.gmDiagnostics"),
        setEnabled: props.setGmDiagnosticsEnabled,
      };
    case "ss":
      return {
        enabled: Boolean(props.ssDiagnosticsEnabled),
        label: props.t("analysis.ssDiagnostics"),
        setEnabled: props.setSsDiagnosticsEnabled,
      };
    case "vth":
      return {
        enabled: Boolean(props.vthDiagnosticsEnabled),
        label: props.t("analysis.vthDiagnostics"),
        setEnabled: props.setVthDiagnosticsEnabled,
      };
    case "iv":
    default:
      return null;
  }
};

const ChartView = (props: ChartViewProps): HTMLElement =>
  createChartView(props);

export default ChartView;
