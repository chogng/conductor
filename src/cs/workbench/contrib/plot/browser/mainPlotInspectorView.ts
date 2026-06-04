import { createSwitch } from "src/cs/base/browser/ui/switch/switch";
import { localize } from "src/cs/nls";
import CanvasDiagnosticsChart from "src/cs/workbench/contrib/diagnostics/browser/CanvasDiagnosticsChart";
import type { MainPlotRenderModel } from "src/cs/workbench/contrib/plot/browser/mainPlotRenderModel";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";

type DiagnosticsState = {
  readonly enabled: boolean;
  readonly label: string;
  readonly setEnabled?: (next: boolean) => void;
};

export type MainPlotInspectorProps = {
  readonly gmDiagnosticsEnabled?: boolean;
  readonly setGmDiagnosticsEnabled?: (next: boolean) => void;
  readonly setSsDiagnosticsEnabled?: (next: boolean) => void;
  readonly setVthDiagnosticsEnabled?: (next: boolean) => void;
  readonly ssDiagnosticsEnabled?: boolean;
  readonly vthDiagnosticsEnabled?: boolean;
};

export const createMainPlotInspectorView = ({
  plotType,
  model,
  props,
}: {
  readonly plotType: PlotType;
  readonly model: MainPlotRenderModel;
  readonly props: MainPlotInspectorProps;
}): HTMLElement => {
  const diagnostics = getDiagnosticsState(plotType, props);
  const section = document.createElement("section");
  section.className = "main_plot_inspector_pane";
  section.dataset.state = diagnostics?.enabled ? "on" : "off";
  section.setAttribute("aria-label", localize("chart_diagnostics_heading", "Diagnostics"));

  const header = document.createElement("div");
  header.className = "main_plot_diagnostics_header";

  const title = document.createElement("div");
  title.className = "main_plot_diagnostics_title";
  title.textContent = diagnostics?.label ?? localize("chart_diagnostics_heading", "Diagnostics");
  header.append(title);

  if (diagnostics) {
    header.append(createDiagnosticsSwitch(diagnostics));
  }
  section.append(header);

  const content = document.createElement("div");
  content.className = "main_plot_diagnostics_content";
  if (diagnostics?.enabled) {
    content.append(CanvasDiagnosticsChart({
      ariaLabel: diagnostics.label,
      series: model.seriesList.map((series) => ({
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
    empty.className = "main_plot_diagnostics_empty";
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
  control.className = "main_plot_diagnostics_switch";

  const text = document.createElement("span");
  text.className = "main_plot_diagnostics_switch_label";
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
  plotType: PlotType,
  props: MainPlotInspectorProps,
): DiagnosticsState | null => {
  switch (plotType) {
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
