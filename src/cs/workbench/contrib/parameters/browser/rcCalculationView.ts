import { localize } from "src/cs/nls";

import { formatNumber } from "src/cs/workbench/services/calculation/common/numberFormat";
import type { RcCurveChartSeries } from "./rcCalculationModel.ts";

export type RcCalculationSummary = {
  n?: unknown;
  r2?: unknown;
  rSheet?: unknown;
  rc?: unknown;
  rcw?: unknown;
  vg?: unknown;
};

export type RcCurveRow = RcCalculationSummary & {
  warnings?: unknown;
};

const SUMMARY_CLASS = "rc_summary";
const SUMMARY_GRID_CLASS = "rc_summary_grid";
const SUMMARY_LABEL_CLASS = "rc_summary_label";
const SUMMARY_VALUE_CLASS = "rc_summary_value";
const TABLE_HEADER_CLASS = "rc_table_header";
const TABLE_CELL_CLASS = "rc_table_cell";

const appendText = (
  parent: HTMLElement,
  tagName: keyof HTMLElementTagNameMap,
  className: string,
  text: string,
): HTMLElement => {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
};

const appendSummaryItem = (
  parent: HTMLElement,
  label: string,
  value: string,
): void => {
  const item = document.createElement("div");
  appendText(item, "div", SUMMARY_LABEL_CLASS, label);
  appendText(item, "div", SUMMARY_VALUE_CLASS, value);
  parent.appendChild(item);
};

const getWarningsText = (warnings: unknown): string =>
  Array.isArray(warnings) && warnings.length
    ? warnings.map((warning) => String(warning)).join(", ")
    : "-";

export const renderRcSummaryView = (
  container: HTMLElement,
  {
    error,
    summary,
  }: {
    error: string;
    summary: RcCalculationSummary | null;
  },
): void => {
  container.textContent = "";

  const root = document.createElement("div");
  root.className = SUMMARY_CLASS;
  root.dataset.state = summary ? "ready" : error ? "error" : "empty";
  container.appendChild(root);

  if (!summary) {
    const message = appendText(
      root,
      "div",
      error ? "rc_summary_message rc_summary_message--error" : "rc_summary_message",
      error || localize("parameters.rc.noResult", "No Rc result yet."),
    );
    message.setAttribute("aria-live", "polite");
    return;
  }

  const grid = document.createElement("div");
  grid.className = SUMMARY_GRID_CLASS;
  root.appendChild(grid);

  appendSummaryItem(grid, "Vg", formatNumber(summary.vg));
  appendSummaryItem(grid, "Rc", formatNumber(summary.rc));
  appendSummaryItem(grid, "RcW", formatNumber(summary.rcw));
  appendSummaryItem(grid, "Rsh", formatNumber(summary.rSheet));
  appendSummaryItem(
    grid,
    "R2 / n",
    `${formatNumber(summary.r2, { digits: 4 })} / ${summary.n ?? "-"}`,
  );
};

export const renderRcCurveHeaderView = (
  container: HTMLElement,
  {
    series,
  }: {
    series: RcCurveChartSeries[];
  },
): void => {
  container.textContent = "";

  const root = document.createElement("div");
  root.className = "rc_curve_header";
  container.appendChild(root);

  appendText(root, "div", "parameters.rc.curveTitle", localize("parameters.rc.curveTitle", "Rc Curve"));

  const legend = document.createElement("div");
  legend.className = "rc_curve_legend";
  root.appendChild(legend);

  for (const item of series) {
    const entry = document.createElement("span");
    entry.className = "rc_curve_legend_item";

    const swatch = document.createElement("span");
    swatch.className = "rc_curve_legend_swatch";
    swatch.style.backgroundColor = item.color;
    entry.appendChild(swatch);

    entry.append(document.createTextNode(item.lineName));
    legend.appendChild(entry);
  }
};

export const renderRcCurveRowsView = (
  container: HTMLElement,
  {
    rows,
  }: {
    rows: RcCurveRow[];
  },
): void => {
  container.textContent = "";
  if (!rows.length) return;

  const scroll = document.createElement("div");
  scroll.className = "rc_table_scroll";
  container.appendChild(scroll);

  const table = document.createElement("table");
  table.className = "rc_table";
  scroll.appendChild(table);

  const thead = document.createElement("thead");
  thead.className = "rc_table_head";
  table.appendChild(thead);

  const headerRow = document.createElement("tr");
  headerRow.className = "rc_table_header_row";
  thead.appendChild(headerRow);

  for (const label of ["Vg", "Rc", "RcW", "Rsh", "R2", "n", localize("parameters.rc.table.warnings", "warnings")]) {
    appendText(headerRow, "th", TABLE_HEADER_CLASS, label);
  }

  const tbody = document.createElement("tbody");
  tbody.className = "rc_table_body";
  table.appendChild(tbody);

  for (const [index, row] of rows.slice(0, 80).entries()) {
    const tr = document.createElement("tr");
    tr.className = "rc_table_row";
    tr.dataset.index = String(index);
    tbody.appendChild(tr);

    appendText(tr, "td", "rc_table_cell rc_table_cell--first", formatNumber(row.vg));
    appendText(tr, "td", TABLE_CELL_CLASS, formatNumber(row.rc));
    appendText(tr, "td", TABLE_CELL_CLASS, formatNumber(row.rcw));
    appendText(tr, "td", TABLE_CELL_CLASS, formatNumber(row.rSheet));
    appendText(tr, "td", TABLE_CELL_CLASS, formatNumber(row.r2, { digits: 4 }));
    appendText(tr, "td", TABLE_CELL_CLASS, String(row.n ?? "-"));
    appendText(
      tr,
      "td",
      "rc_table_cell rc_table_cell--warnings",
      getWarningsText(row.warnings),
    );
  }
};
