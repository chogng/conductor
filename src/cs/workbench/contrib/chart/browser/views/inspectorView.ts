import { createSwitch } from "src/cs/base/browser/ui/switch/switch";
import { localize } from "src/cs/nls";
import CanvasDiagnosticsChart from "src/cs/workbench/contrib/diagnostics/browser/CanvasDiagnosticsChart";
import type { createMainPlotModel } from "src/cs/workbench/contrib/plot/browser/mainPlotModel";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";
import type { ChartViewProps } from "src/cs/workbench/contrib/chart/browser/views/chartView";

type MainPlotModel = ReturnType<typeof createMainPlotModel>;

type DiagnosticsState = {
  readonly enabled: boolean;
  readonly label: string;
  readonly setEnabled?: (next: boolean) => void;
};

export const createInspectorView = ({
  activePlotType,
  model,
  props,
}: {
  readonly activePlotType: PlotType;
  readonly model: MainPlotModel;
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
    | "vthDiagnosticsEnabled"
  >;
}): HTMLElement => {
  const diagnostics = getDiagnosticsState(activePlotType, props);
  const section = document.createElement("section");
  section.className = "chart_view_inspector_pane";
  section.dataset.state = diagnostics?.enabled ? "on" : "off";
  section.setAttribute("aria-label", localize("chart_diagnostics_heading", "Diagnostics"));

  const header = document.createElement("div");
  header.className = "chart_view_diagnostics_header";

  const title = document.createElement("div");
  title.className = "chart_view_diagnostics_title";
  title.textContent = diagnostics?.label ?? localize("chart_diagnostics_heading", "Diagnostics");
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
      ? localize("chart_diagnostics_disabled", "Turn on diagnostics to show the diagnostic curve here.")
      : localize("chart_diagnostics_unavailable", "Switch to GM, SS, or VTH to inspect diagnostic curves.");
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
