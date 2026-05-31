import type { TranslateFn } from "src/cs/platform/language/common/language";

import { formatNumber } from "../../diagnostics/common/numberFormat.ts";
import type { RcCurveChartSeries } from "./rcAnalysisModel.ts";

export type RcAnalysisSummary = {
  n?: unknown;
  r2?: unknown;
  rSheet?: unknown;
  rc?: unknown;
  rcw?: unknown;
  vg?: unknown;
};

export type RcCurveRow = RcAnalysisSummary & {
  warnings?: unknown;
};

const SUMMARY_CLASS = "rounded-xl border border-border bg-bg-page/40 px-4 py-3";
const SUMMARY_GRID_CLASS = "grid grid-cols-5 gap-3 text-sm";
const SUMMARY_LABEL_CLASS = "text-xs text-text-secondary";
const SUMMARY_VALUE_CLASS = "font-mono text-text-primary";
const TABLE_HEADER_CLASS =
  "p-2 text-xs font-semibold text-text-secondary text-left border-l border-border first:border-l-0";
const TABLE_CELL_CLASS = "p-2 font-mono text-text-primary border-l border-border";

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
    t,
  }: {
    error: string;
    summary: RcAnalysisSummary | null;
    t: TranslateFn;
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
      `text-sm ${error ? "text-red-500" : "text-text-secondary"}`,
      error || t("da_rc_no_result"),
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
    t,
  }: {
    series: RcCurveChartSeries[];
    t: TranslateFn;
  },
): void => {
  container.textContent = "";

  const root = document.createElement("div");
  root.className = "mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2";
  container.appendChild(root);

  appendText(root, "div", "text-xs font-semibold text-text-secondary", t("da_rc_curve_title"));

  const legend = document.createElement("div");
  legend.className = "flex min-w-0 items-center gap-3 text-xs text-text-secondary";
  root.appendChild(legend);

  for (const item of series) {
    const entry = document.createElement("span");
    entry.className = "inline-flex items-center gap-1.5";

    const swatch = document.createElement("span");
    swatch.className = "h-2.5 w-2.5 rounded-sm";
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
    t,
  }: {
    rows: RcCurveRow[];
    t: TranslateFn;
  },
): void => {
  container.textContent = "";
  if (!rows.length) return;

  const scroll = document.createElement("div");
  scroll.className = "min-w-0 w-full max-h-[220px] overflow-auto";
  container.appendChild(scroll);

  const table = document.createElement("table");
  table.className = "w-full min-w-[720px] table-fixed text-sm border-collapse";
  scroll.appendChild(table);

  const thead = document.createElement("thead");
  thead.className = "sticky top-0 bg-bg-surface z-10";
  table.appendChild(thead);

  const headerRow = document.createElement("tr");
  headerRow.className = "border-b border-border";
  thead.appendChild(headerRow);

  for (const label of ["Vg", "Rc", "RcW", "Rsh", "R2", "n", t("da_rc_table_warnings")]) {
    appendText(headerRow, "th", TABLE_HEADER_CLASS, label);
  }

  const tbody = document.createElement("tbody");
  tbody.className = "divide-y divide-border";
  table.appendChild(tbody);

  for (const [index, row] of rows.slice(0, 80).entries()) {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-bg-page/30";
    tr.dataset.index = String(index);
    tbody.appendChild(tr);

    appendText(tr, "td", "p-2 font-mono text-text-primary", formatNumber(row.vg));
    appendText(tr, "td", TABLE_CELL_CLASS, formatNumber(row.rc));
    appendText(tr, "td", TABLE_CELL_CLASS, formatNumber(row.rcw));
    appendText(tr, "td", TABLE_CELL_CLASS, formatNumber(row.rSheet));
    appendText(tr, "td", TABLE_CELL_CLASS, formatNumber(row.r2, { digits: 4 }));
    appendText(tr, "td", TABLE_CELL_CLASS, String(row.n ?? "-"));
    appendText(
      tr,
      "td",
      "p-2 text-xs text-text-secondary border-l border-border truncate",
      getWarningsText(row.warnings),
    );
  }
};
