import { localize } from "src/cs/nls";
import {
  renderCalculatedParametersRows,
  type RenderCalculatedParametersRowsOptions,
} from "src/cs/workbench/contrib/parameters/browser/calculatedParametersRow";
import {
  formatMetricValue,
  getSsMetricText,
} from "src/cs/workbench/contrib/parameters/browser/parametersModel";

export type ParametersViewOptions = RenderCalculatedParametersRowsOptions & {
  gmMetricHeader: string;
};

const SERIES_COLUMN_MIN_WIDTH_PX = 56;
const SERIES_COLUMN_MAX_WIDTH_PX = 168;
const SERIES_COLUMN_HORIZONTAL_PADDING_PX = 16;
const SERIES_COLUMN_CHAR_WIDTH_PX = 9;
const METRIC_COLUMN_MIN_WIDTH_PX = 64;
const METRIC_COLUMN_MAX_WIDTH_PX = 168;
const METRIC_COLUMN_HORIZONTAL_PADDING_PX = 28;
const METRIC_COLUMN_CHAR_WIDTH_PX = 9;

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
    seriesHeader,
    showTransferMetrics,
  }: Pick<ParametersViewOptions, "gmMetricHeader" | "showTransferMetrics"> & { seriesHeader: string },
): void => {
  const thead = document.createElement("thead");
  thead.className = "parameters_table_head";

  if (!showTransferMetrics) {
    const headerRow = document.createElement("tr");
    headerRow.className = "parameters_header_row";
    appendHeaderCell(headerRow, {
      className: SERIES_HEADER_CLASS,
      text: seriesHeader,
    });
    appendHeaderCell(headerRow, { className: `${SUB_HEADER_CLASS} parameters_cell--derivative`, text: gmMetricHeader });
    appendHeaderCell(headerRow, { className: `${SUB_HEADER_CLASS} parameters_cell--derivative`, text: "x" });

    thead.appendChild(headerRow);
    table.appendChild(thead);
    return;
  }

  const groupRow = document.createElement("tr");
  groupRow.className = "parameters_header_row";
  appendHeaderCell(groupRow, {
    className: SERIES_HEADER_CLASS,
    rowSpan: 2,
    text: seriesHeader,
  });
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
  appendHeaderCell(groupRow, {
    className: `${GROUP_HEADER_CLASS} parameters_cell--derivative`,
    colSpan: 2,
    text: localize("calc_group_derivative", "Derivative"),
  });
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

  const labelRow = document.createElement("tr");
  labelRow.className = "parameters_header_row";
  appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--on`, text: "|I|on" });
  appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--on`, text: "x" });
  appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--off`, text: "|I|off" });
  appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--off`, text: "x" });
  appendHeaderCell(labelRow, { text: "Ion/Ioff" });
  appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--derivative`, text: gmMetricHeader });
  appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--derivative`, text: "x" });
  const vthHint = localize("calc_group_threshold_voltage_hint", "sqrt(|Id|)-Vg linear extrapolation; V-shaped transfer curves are fitted by electron / hole branch.");
  appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--threshold`, text: "Vth,e", title: vthHint });
  appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--threshold`, text: "Vth,h", title: vthHint });
  appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--ss`, text: "SS" });
  appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} parameters_cell--ss`, text: "x" });
  appendHeaderCell(labelRow, { text: "Jon", title: localize("calc_group_jon_hint", "J = |I|/Area (if area is available).") });

  thead.append(groupRow, labelRow);
  table.appendChild(thead);
};

const resolveSeriesHeader = (
  rows: ParametersViewOptions["rows"],
): string => {
  const header = rows.find((row) => String(row?.legendHeader ?? "").trim())
    ?.legendHeader;
  return String(header ?? "").trim() || localize("calc_group_series", "Series");
};

const estimateSeriesColumnWidth = (
  rows: ParametersViewOptions["rows"],
  seriesHeader: string,
): number => {
  const maxLength = Math.max(
    seriesHeader.length,
    ...rows.map((row) => String(row?.name ?? "").length),
  );
  const estimated = maxLength * SERIES_COLUMN_CHAR_WIDTH_PX + SERIES_COLUMN_HORIZONTAL_PADDING_PX;
  return Math.max(SERIES_COLUMN_MIN_WIDTH_PX, Math.min(SERIES_COLUMN_MAX_WIDTH_PX, estimated));
};

const getPendingMetricText = (
  row: ParametersViewOptions["rows"][number],
  value: number | null | undefined,
  digits?: number,
): string => row?.isPending ? "..." : formatMetricValue(value, digits);

const estimateMetricColumnWidth = (
  header: string,
  values: readonly string[],
  minWidth = METRIC_COLUMN_MIN_WIDTH_PX,
): number => {
  const maxLength = Math.max(header.length, ...values.map((value) => value.length));
  const estimated = maxLength * METRIC_COLUMN_CHAR_WIDTH_PX + METRIC_COLUMN_HORIZONTAL_PADDING_PX;
  return Math.max(minWidth, Math.min(METRIC_COLUMN_MAX_WIDTH_PX, estimated));
};

const estimateMetricColumnWidths = ({
  gmMetricHeader,
  rows,
  showTransferMetrics,
}: ParametersViewOptions): number[] => {
  const getValues = (
    selector: (row: ParametersViewOptions["rows"][number]) => string,
  ): string[] => rows.map(selector);

  if (!showTransferMetrics) {
    return [
      estimateMetricColumnWidth(gmMetricHeader, getValues((row) =>
        getPendingMetricText(row, row.gmMaxAbs)
      )),
      estimateMetricColumnWidth("x", getValues((row) =>
        getPendingMetricText(row, row.xAtGmMaxAbs)
      )),
    ];
  }

  return [
    estimateMetricColumnWidth("|I|on", getValues((row) =>
      getPendingMetricText(row, row.ion)
    ), 88),
    estimateMetricColumnWidth("x", getValues((row) =>
      getPendingMetricText(row, row.xAtIon)
    )),
    estimateMetricColumnWidth("|I|off", getValues((row) =>
      getPendingMetricText(row, row.ioff)
    ), 88),
    estimateMetricColumnWidth("x", getValues((row) =>
      getPendingMetricText(row, row.xAtIoff)
    )),
    estimateMetricColumnWidth("Ion/Ioff", getValues((row) =>
      getPendingMetricText(row, row.ionIoff, 3)
    ), 96),
    estimateMetricColumnWidth(gmMetricHeader, getValues((row) =>
      getPendingMetricText(row, row.gmMaxAbs)
    ), 88),
    estimateMetricColumnWidth("x", getValues((row) =>
      getPendingMetricText(row, row.xAtGmMaxAbs)
    )),
    estimateMetricColumnWidth("Vth,e", getValues((row) =>
      getPendingMetricText(row, row.thresholdVoltageElectron)
    ), 88),
    estimateMetricColumnWidth("Vth,h", getValues((row) =>
      getPendingMetricText(row, row.thresholdVoltageHole)
    ), 88),
    estimateMetricColumnWidth("SS", getValues((row) =>
      row?.isPending ? "..." : getSsMetricText(row.ss, row.ssConfidence)
    ), 88),
    estimateMetricColumnWidth("x", getValues((row) =>
      getPendingMetricText(row, row.xAtSs)
    )),
    estimateMetricColumnWidth("Jon", getValues((row) =>
      getPendingMetricText(row, row.jon)
    ), 88),
  ];
};

export const renderParametersView = (
  container: HTMLElement,
  options: ParametersViewOptions,
): void => {
  container.textContent = "";

  const seriesHeader = resolveSeriesHeader(options.rows);
  const widths = [
    estimateSeriesColumnWidth(options.rows, seriesHeader),
    ...estimateMetricColumnWidths(options),
  ];
  const tableWidth = widths.reduce((total, width) => total + width, 0);
  const table = document.createElement("table");
  table.className = "parameters_table";
  table.style.width = `${tableWidth}px`;
  table.style.minWidth = `${tableWidth}px`;

  appendColumns(table, widths);
  appendTableHeader(table, { ...options, seriesHeader });

  const body = document.createElement("tbody");
  body.className = "parameters_table_body";
  table.appendChild(body);
  container.appendChild(table);

  renderCalculatedParametersRows(body, options);
};
