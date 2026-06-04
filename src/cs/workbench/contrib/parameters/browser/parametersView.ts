import { localize } from "src/cs/nls";
import {
  renderCalculatedParametersRows,
  type RenderCalculatedParametersRowsOptions,
} from "src/cs/workbench/contrib/parameters/browser/calculatedParametersRow";

export type ParametersViewOptions = RenderCalculatedParametersRowsOptions & {
  gmMetricHeader: string;
};

const TRANSFER_COLUMN_WIDTHS_PX = [
  168, 128, 88, 128, 88, 120, 168, 88, 112, 112, 104, 88, 120,
];
const DERIVATIVE_ONLY_COLUMN_WIDTHS_PX = [168, 168, 88];

const GROUP_HEADER_CLASS = "parameters_group_header";
const SUB_HEADER_CLASS = "parameters_sub_header";
const SERIES_HEADER_CLASS = "parameters_series_header";

const appendHeaderCell = (
  row: HTMLTableRowElement,
  {
    className = SUB_HEADER_CLASS,
    colSpan,
    rowSpan,
    text,
    title,
  }: {
    className?: string;
    colSpan?: number;
    rowSpan?: number;
    text: string;
    title?: string;
  },
): void => {
  const cell = document.createElement("th");
  cell.className = className;
  cell.textContent = text;
  if (colSpan != null) cell.colSpan = colSpan;
  if (rowSpan != null) cell.rowSpan = rowSpan;
  if (title) cell.title = title;
  row.appendChild(cell);
};

const appendColumns = (table: HTMLTableElement, widths: number[]): void => {
  const colgroup = document.createElement("colgroup");
  for (const width of widths) {
    const column = document.createElement("col");
    column.style.width = `${width}px`;
    colgroup.appendChild(column);
  }
  table.appendChild(colgroup);
};

const appendTableHeader = (
  table: HTMLTableElement,
  {
    gmMetricHeader,
    showTransferMetrics,
  }: Pick<ParametersViewOptions, "gmMetricHeader" | "showTransferMetrics" >,
): void => {
  const thead = document.createElement("thead");
  thead.className = "parameters_table_head";

  const groupRow = document.createElement("tr");
  groupRow.className = "parameters_header_row";
  appendHeaderCell(groupRow, {
    className: SERIES_HEADER_CLASS,
    rowSpan: 2,
    text: localize("calc_group_series", "Series"),
  });
  if (showTransferMetrics) {
    appendHeaderCell(groupRow, {
      className: `${GROUP_HEADER_CLASS} parameters_cell--on`,
      colSpan: 2,
      text: localize("calc_group_on_state", "On-state"),
    });
    appendHeaderCell(groupRow, {
      className: `${GROUP_HEADER_CLASS} parameters_cell--off`,
      colSpan: 2,
      text: localize("calc_group_off_state", "Off-state"),
    });
    appendHeaderCell(groupRow, {
      className: GROUP_HEADER_CLASS,
      text: localize("calc_group_ratio", "On/Off Ratio"),
    });
  }
  appendHeaderCell(groupRow, {
    className: `${GROUP_HEADER_CLASS} parameters_cell--derivative`,
    colSpan: 2,
    text: localize("calc_group_derivative", "Derivative"),
  });
  if (showTransferMetrics) {
    appendHeaderCell(groupRow, {
      className: `${GROUP_HEADER_CLASS} parameters_cell--threshold`,
      colSpan: 2,
      text: localize("calc_group_threshold_voltage", "Threshold Voltage"),
    });
    appendHeaderCell(groupRow, {
      className: `${GROUP_HEADER_CLASS} parameters_cell--ss`,
      colSpan: 2,
      text: localize("calc_group_ss", "Subthreshold"),
    });
    appendHeaderCell(groupRow, {
      className: GROUP_HEADER_CLASS,
      text: localize("calc_group_jon", "Current Density"),
      title: localize("calc_group_jon_hint", "J = |I|/Area (if area is available)."),
    });
  }

  const labelRow = document.createElement("tr");
  labelRow.className = "parameters_header_row";
  if (showTransferMetrics) {
    appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--on`, text: "|I|on" });
    appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--on`, text: "x" });
    appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--off`, text: "|I|off" });
    appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--off`, text: "x" });
    appendHeaderCell(labelRow, { text: "Ion/Ioff" });
  }
  appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--derivative`, text: gmMetricHeader });
  appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--derivative`, text: "x" });
  if (showTransferMetrics) {
    const vthHint = localize("calc_group_threshold_voltage_hint", "sqrt(|Id|)-Vg linear extrapolation; V-shaped transfer curves are fitted by electron / hole branch.");
    appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--threshold`, text: "Vth,e", title: vthHint });
    appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--threshold`, text: "Vth,h", title: vthHint });
    appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--ss`, text: "SS" });
    appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--ss`, text: "x" });
    appendHeaderCell(labelRow, { text: "Jon", title: localize("calc_group_jon_hint", "J = |I|/Area (if area is available).") });
  }

  thead.append(groupRow, labelRow);
  table.appendChild(thead);
};

export const renderParametersView = (
  container: HTMLElement,
  options: ParametersViewOptions,
): void => {
  container.textContent = "";

  const widths = options.showTransferMetrics
    ? TRANSFER_COLUMN_WIDTHS_PX
    : DERIVATIVE_ONLY_COLUMN_WIDTHS_PX;
  const table = document.createElement("table");
  table.className = "parameters_table";
  table.style.minWidth = `${widths.reduce((total, width) => total + width, 0)}px`;

  appendColumns(table, widths);
  appendTableHeader(table, options);

  const body = document.createElement("tbody");
  body.className = "parameters_table_body";
  table.appendChild(body);
  container.appendChild(table);

  renderCalculatedParametersRows(body, options);
};
