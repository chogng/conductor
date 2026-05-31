import type { TranslateFn } from "src/cs/platform/language/common/language";
import {
  renderCalculatedParametersRows,
  type RenderCalculatedParametersRowsOptions,
} from "src/cs/workbench/contrib/parameters/browser/calculatedParametersRow";

export type ParametersViewOptions = RenderCalculatedParametersRowsOptions & {
  gmMetricHeader: string;
  t: TranslateFn;
};

const TRANSFER_COLUMN_WIDTHS_PX = [
  168, 128, 88, 128, 88, 120, 168, 88, 112, 112, 104, 88, 120,
];
const DERIVATIVE_ONLY_COLUMN_WIDTHS_PX = [168, 168, 88];

const GROUP_HEADER_CLASS =
  "p-2 text-[14px] font-semibold tracking-wide text-text-secondary text-center border-l border-border";
const SUB_HEADER_CLASS =
  "p-2 text-[14px] font-semibold text-text-secondary text-center whitespace-nowrap border-l border-border";
const SERIES_HEADER_CLASS =
  "sticky left-0 z-20 p-2 text-[14px] font-semibold tracking-wide text-text-secondary text-left whitespace-nowrap align-middle bg-bg-surface shadow-[1px_0_0_var(--color-border)]";

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
    t,
  }: Pick<ParametersViewOptions, "gmMetricHeader" | "showTransferMetrics" | "t">,
): void => {
  const thead = document.createElement("thead");
  thead.className = "sticky top-0 bg-bg-surface z-10";

  const groupRow = document.createElement("tr");
  groupRow.className = "border-b border-border";
  appendHeaderCell(groupRow, {
    className: SERIES_HEADER_CLASS,
    rowSpan: 2,
    text: t("da_calc_group_series"),
  });
  if (showTransferMetrics) {
    appendHeaderCell(groupRow, {
      className: `${GROUP_HEADER_CLASS} bg-emerald-500/5`,
      colSpan: 2,
      text: t("da_calc_group_on_state"),
    });
    appendHeaderCell(groupRow, {
      className: `${GROUP_HEADER_CLASS} bg-cyan-500/5`,
      colSpan: 2,
      text: t("da_calc_group_off_state"),
    });
    appendHeaderCell(groupRow, {
      className: GROUP_HEADER_CLASS,
      text: t("da_calc_group_ratio"),
    });
  }
  appendHeaderCell(groupRow, {
    className: `${GROUP_HEADER_CLASS} bg-amber-500/5`,
    colSpan: 2,
    text: t("da_calc_group_derivative"),
  });
  if (showTransferMetrics) {
    appendHeaderCell(groupRow, {
      className: `${GROUP_HEADER_CLASS} bg-violet-500/5`,
      colSpan: 2,
      text: t("da_calc_group_threshold_voltage"),
    });
    appendHeaderCell(groupRow, {
      className: `${GROUP_HEADER_CLASS} bg-rose-500/5`,
      colSpan: 2,
      text: t("da_calc_group_ss"),
    });
    appendHeaderCell(groupRow, {
      className: GROUP_HEADER_CLASS,
      text: t("da_calc_group_jon"),
      title: t("da_calc_group_jon_hint"),
    });
  }

  const labelRow = document.createElement("tr");
  labelRow.className = "border-b border-border";
  if (showTransferMetrics) {
    appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} bg-emerald-500/5`, text: "|I|on" });
    appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} bg-emerald-500/5`, text: "x" });
    appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} bg-cyan-500/5`, text: "|I|off" });
    appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} bg-cyan-500/5`, text: "x" });
    appendHeaderCell(labelRow, { text: "Ion/Ioff" });
  }
  appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} bg-amber-500/5`, text: gmMetricHeader });
  appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} bg-amber-500/5`, text: "x" });
  if (showTransferMetrics) {
    const vthHint = t("da_calc_group_threshold_voltage_hint");
    appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} bg-violet-500/5`, text: "Vth,e", title: vthHint });
    appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} bg-violet-500/5`, text: "Vth,h", title: vthHint });
    appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} bg-rose-500/5`, text: "SS" });
    appendHeaderCell(labelRow, { className: `${SUB_HEADER_CLASS} bg-rose-500/5`, text: "x" });
    appendHeaderCell(labelRow, { text: "Jon", title: t("da_calc_group_jon_hint") });
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
  table.className = "w-full table-fixed text-sm border-collapse";
  table.style.minWidth = `${widths.reduce((total, width) => total + width, 0)}px`;

  appendColumns(table, widths);
  appendTableHeader(table, options);

  const body = document.createElement("tbody");
  body.className = "divide-y divide-border";
  table.appendChild(body);
  container.appendChild(table);

  renderCalculatedParametersRows(body, options);
};
