import {
  formatMetricValue,
  getCurrentTooltip,
  getSsMetricText,
  getSsTooltip,
  getThresholdVoltageTooltip,
  type CalculatedParameterRowData,
  type CurrentTooltipBuilder,
  type SsConfidence,
  type SsTooltipBuilder,
} from "src/cs/workbench/contrib/parameters/browser/parametersModel";

export type RenderCalculatedParametersRowsOptions = {
  buildCurrentTooltip?: CurrentTooltipBuilder;
  buildSsTooltip?: SsTooltipBuilder;
  rows: Array<CalculatedParameterRowData & { id?: unknown; isPending?: unknown }>;
  showTransferMetrics: boolean;
};

const LABEL_CELL_CLASS = "parameters_label_cell";
const ION_CELL_CLASS = "parameters_metric_cell parameters_cell--on";
const ION_X_CELL_CLASS = "parameters_metric_cell parameters_metric_cell--secondary parameters_cell--on";
const IOFF_CELL_CLASS = "parameters_metric_cell parameters_cell--off";
const IOFF_X_CELL_CLASS = "parameters_metric_cell parameters_metric_cell--secondary parameters_cell--off";
const METRIC_CELL_CLASS = "parameters_metric_cell";
const GM_CELL_CLASS = "parameters_metric_cell parameters_cell--derivative";
const GM_X_CELL_CLASS = "parameters_metric_cell parameters_metric_cell--secondary parameters_cell--derivative";
const VTH_CELL_CLASS = "parameters_metric_cell parameters_cell--threshold";
const SS_CELL_CLASS = "parameters_metric_cell parameters_cell--ss";
const SS_X_CELL_CLASS = "parameters_metric_cell parameters_metric_cell--secondary parameters_cell--ss";

const appendTextCell = (
  rowNode: HTMLTableRowElement,
  className: string,
  text: string,
  title = "",
): void => {
  const cell = document.createElement("td");
  cell.className = className;
  cell.title = title;
  cell.textContent = text;
  rowNode.appendChild(cell);
};

const appendMetricCell = (
  rowNode: HTMLTableRowElement,
  className: string,
  value: number | null | undefined,
  isPending: boolean,
  title = "",
  digits?: number,
): void => {
  appendTextCell(rowNode, className, isPending ? "..." : formatMetricValue(value, digits), title);
};

const resolveSsBadgeClass = (
  confidence: SsConfidence,
  isPending: boolean,
): string => {
  if (isPending) return "parameters_ss_badge parameters_ss_badge--pending";
  if (confidence === "high") return "parameters_ss_badge parameters_ss_badge--high";
  if (confidence === "low") return "parameters_ss_badge parameters_ss_badge--low";
  if (confidence === "fail") return "parameters_ss_badge parameters_ss_badge--fail";
  return "parameters_ss_badge";
};

const appendSsCell = (
  rowNode: HTMLTableRowElement,
  value: number | null | undefined,
  confidence: SsConfidence,
  isPending: boolean,
  title: string,
): void => {
  const cell = document.createElement("td");
  cell.className = SS_CELL_CLASS;

  const badge = document.createElement("span");
  badge.className = resolveSsBadgeClass(confidence, isPending);
  badge.title = title;
  badge.textContent = isPending ? "..." : getSsMetricText(value, confidence);

  cell.appendChild(badge);
  rowNode.appendChild(cell);
};

const appendCalculatedParametersRow = (
  container: HTMLTableSectionElement,
  row: CalculatedParameterRowData,
  {
    buildCurrentTooltip,
    buildSsTooltip,
    showTransferMetrics,
  }: Omit<RenderCalculatedParametersRowsOptions, "rows">,
  isPending: boolean,
): void => {
  const rowNode = document.createElement("tr");
  rowNode.className = "parameters_table_row";

  appendTextCell(rowNode, LABEL_CELL_CLASS, row.name, row.name);

  if (showTransferMetrics) {
    const ionTooltip = getCurrentTooltip(buildCurrentTooltip, isPending, row, "ion");
    const ioffTooltip = getCurrentTooltip(buildCurrentTooltip, isPending, row, "ioff");
    const ratioTooltip = getCurrentTooltip(buildCurrentTooltip, isPending, row, "ratio");

    appendMetricCell(rowNode, ION_CELL_CLASS, row.ion, isPending, ionTooltip);
    appendMetricCell(rowNode, ION_X_CELL_CLASS, row.xAtIon, isPending, ionTooltip);
    appendMetricCell(rowNode, IOFF_CELL_CLASS, row.ioff, isPending, ioffTooltip);
    appendMetricCell(rowNode, IOFF_X_CELL_CLASS, row.xAtIoff, isPending, ioffTooltip);
    appendMetricCell(rowNode, METRIC_CELL_CLASS, row.ionIoff, isPending, ratioTooltip, 3);
  }

  appendMetricCell(rowNode, GM_CELL_CLASS, row.gmMaxAbs, isPending);
  appendMetricCell(rowNode, GM_X_CELL_CLASS, row.xAtGmMaxAbs, isPending);

  if (showTransferMetrics) {
    const vthTooltip = getThresholdVoltageTooltip(row, isPending);
    appendMetricCell(rowNode, VTH_CELL_CLASS, row.thresholdVoltageElectron, isPending, vthTooltip);
    appendMetricCell(rowNode, VTH_CELL_CLASS, row.thresholdVoltageHole, isPending, vthTooltip);
    appendSsCell(
      rowNode,
      row.ss,
      row.ssConfidence,
      isPending,
      getSsTooltip(buildSsTooltip, isPending, row),
    );
    appendMetricCell(rowNode, SS_X_CELL_CLASS, row.xAtSs, isPending);
    appendMetricCell(rowNode, METRIC_CELL_CLASS, row.jon, isPending);
  }

  container.appendChild(rowNode);
};

export const renderCalculatedParametersRows = (
  container: HTMLTableSectionElement,
  options: RenderCalculatedParametersRowsOptions,
): void => {
  container.textContent = "";
  for (const row of options.rows) {
    appendCalculatedParametersRow(container, row, options, Boolean(row?.isPending));
  }
};
