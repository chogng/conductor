import { localize } from "src/cs/nls";
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
} from "src/cs/workbench/contrib/session/browser/sessionContext";
import type {
  CleanedEntry,
  ProcessingStatus,
} from "src/cs/workbench/contrib/session/common/sessionTypes";

type StateSetter<T> = (next: T | ((previous: T) => T)) => void;
type DiagnosticsState = {
  readonly enabled: boolean;
  readonly label: string;
  readonly setEnabled?: (next: boolean) => void;
};

export type ChartAuxiliaryPane = "locator" | "inspector";
export type ChartPane = "chart" | ChartAuxiliaryPane;

export type ChartViewProps = {
  t: TranslateFn;
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
};

export const createChartView = (props: ChartViewProps): HTMLElement => {
  const {
    activePlotType = "iv",
    cleanedData = [],
    processingStatus,
    activeFileId: controlledActiveFileId = undefined,
    t,
    originOpenPlotOptions = DEFAULT_ORIGIN_PLOT_OPTIONS,
  } = props;
  const visiblePanes = normalizeVisiblePanes(props.visiblePanes);
  const root = document.createElement("section");
  root.className = "chart_view";
  root.setAttribute("aria-label", localize("analysis.visualization", "Analysis & Visualization"));

  if (!cleanedData.length) {
    root.append(createEmptyView({
      hint: processingStatus?.state === "processing"
        ? localize("da_analysis_processing_hint", "Extracting and preparing chart data, please wait.")
        : localize("analysis.empty.hint", "Apply a template to generate chart data."),
      title: processingStatus?.state === "processing"
        ? localize("da_analysis_processing", "Processing analysis data...")
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

  const main = document.createElement("div");
  main.className = "chart_view_main";
  main.dataset.paneCount = String(visiblePanes.length);

  const mainPane = document.createElement("div");
  mainPane.className = "chart_view_main_pane";
  mainPane.append(chartHost);

  const inspectorPane = createInspectorPane({
    activePlotType,
    model,
    props,
  });

  if (visiblePanes.includes("chart")) {
    main.append(mainPane);
  }
  if (visiblePanes.includes("locator")) {
    main.append(createLocatorPane({ model, props }));
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

const createLocatorPane = ({
  model,
  props,
}: {
  readonly model: ReturnType<typeof createMainPlotModel>;
  readonly props: Pick<ChartViewProps, "t">;
}): HTMLElement => {
  const section = document.createElement("section");
  section.className = "chart_view_locator_pane";
  section.setAttribute("aria-label", localize("da_chart_locator_heading", "Locator"));

  const header = document.createElement("div");
  header.className = "chart_view_auxiliary_header";
  header.textContent = localize("da_chart_locator_heading", "Locator");

  const body = document.createElement("div");
  body.className = "chart_view_locator_grid";
  body.append(
    createLocatorMetric(localize("analysis.seriesCount", "Series"), String(model.seriesList.length)),
    createLocatorMetric(localize("analysis.pointsCount", "Points"), String(model.pointsCount)),
    createLocatorMetric(localize("analysis.xDomain", "X domain"), formatDomain(model.xDomain)),
    createLocatorMetric(localize("analysis.yDomain", "Y domain"), formatDomain(model.yDomain)),
  );

  section.append(header, body);
  return section;
};

const createLocatorMetric = (labelText: string, valueText: string): HTMLElement => {
  const item = document.createElement("div");
  item.className = "chart_view_locator_metric";

  const label = document.createElement("div");
  label.className = "chart_view_locator_metric_label";
  label.textContent = labelText;

  const value = document.createElement("div");
  value.className = "chart_view_locator_metric_value";
  value.textContent = valueText;

  item.append(label, value);
  return item;
};

const formatDomain = (domain: readonly [number, number] | undefined): string =>
  domain && domain.length >= 2
    ? `${formatDomainNumber(domain[0])} - ${formatDomainNumber(domain[1])}`
    : "";

const formatDomainNumber = (value: number): string =>
  Number.isFinite(value) ? Number(value).toPrecision(4) : "";

const createInspectorPane = ({
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
    | "cleanedData"
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
  section.className = "chart_view_inspector_pane";
  section.dataset.state = diagnostics?.enabled ? "on" : "off";
  section.setAttribute("aria-label", localize("da_chart_diagnostics_heading", "Diagnostics"));

  const header = document.createElement("div");
  header.className = "chart_view_diagnostics_header";

  const title = document.createElement("div");
  title.className = "chart_view_diagnostics_title";
  title.textContent = diagnostics?.label ?? localize("da_chart_diagnostics_heading", "Diagnostics");
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
      ? localize("da_chart_diagnostics_disabled", "Turn on diagnostics to show the diagnostic curve here.")
      : localize("da_chart_diagnostics_unavailable", "Switch to GM, SS, or VTH to inspect diagnostic curves.");
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
        label: localize("analysis.gmDiagnostics", "gm diagnostics"),
        setEnabled: props.setGmDiagnosticsEnabled,
      };
    case "ss":
      return {
        enabled: Boolean(props.ssDiagnosticsEnabled),
        label: localize("analysis.ssDiagnostics", "SS diagnostics"),
        setEnabled: props.setSsDiagnosticsEnabled,
      };
    case "vth":
      return {
        enabled: Boolean(props.vthDiagnosticsEnabled),
        label: localize("analysis.vthDiagnostics", "Vth diagnostics"),
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
