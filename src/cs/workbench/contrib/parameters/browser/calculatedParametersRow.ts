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

const LABEL_CELL_CLASS =
  "sticky left-0 z-[1] max-w-0 overflow-hidden text-ellipsis p-2 text-[14px] text-text-primary font-medium whitespace-nowrap text-left bg-bg-surface shadow-[1px_0_0_var(--color-border)] group-hover:bg-bg-page";
const ION_CELL_CLASS =
  "p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border bg-emerald-500/5";
const ION_X_CELL_CLASS =
  "p-2 font-mono text-[14px] text-text-secondary whitespace-nowrap text-center border-l border-border bg-emerald-500/5";
const IOFF_CELL_CLASS =
  "p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border bg-cyan-500/5";
const IOFF_X_CELL_CLASS =
  "p-2 font-mono text-[14px] text-text-secondary whitespace-nowrap text-center border-l border-border bg-cyan-500/5";
const METRIC_CELL_CLASS =
  "p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border";
const GM_CELL_CLASS =
  "p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border bg-amber-500/5";
const GM_X_CELL_CLASS =
  "p-2 font-mono text-[14px] text-text-secondary whitespace-nowrap text-center border-l border-border bg-amber-500/5";
const VTH_CELL_CLASS =
  "p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border bg-violet-500/5";
const SS_CELL_CLASS =
  "p-2 font-mono text-[14px] text-text-primary whitespace-nowrap text-center border-l border-border bg-rose-500/5";
const SS_X_CELL_CLASS =
  "p-2 font-mono text-[14px] text-text-secondary whitespace-nowrap text-center border-l border-border bg-rose-500/5";

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
  const base =
    "inline-flex h-6 min-w-[4.75rem] items-center justify-center px-2 rounded-md text-[14px] font-medium leading-none border";
  if (isPending) return `${base} bg-bg-page text-text-secondary border-border`;
  if (confidence === "high") return `${base} bg-green-500/10 text-green-500 border-green-500/20`;
  if (confidence === "low") return `${base} bg-yellow-500/10 text-yellow-500 border-yellow-500/20`;
  if (confidence === "fail") return `${base} bg-red-500/10 text-red-500 border-red-500/20`;
  return `${base} bg-bg-page text-text-primary border-border`;
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
  rowNode.className = "group hover:bg-bg-page/30";

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
