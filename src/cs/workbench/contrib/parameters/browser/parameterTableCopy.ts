/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import type { RenderCalculatedParametersRowsOptions } from "src/cs/workbench/contrib/parameters/browser/calculatedParametersRow";
import {
  formatMetricValue,
  getSsMetricText,
  type CalculatedParameterRowData,
} from "src/cs/workbench/services/parameters/common/parameterModel";

export type ParameterTableCopyOptions = RenderCalculatedParametersRowsOptions & {
  gmMetricHeader: string;
};

const sanitizeTsvCell = (value: string): string =>
  value.replace(/[\t\r\n]+/g, " ").trim();

const joinTsvRow = (cells: readonly string[]): string =>
  cells.map(sanitizeTsvCell).join("\t");

const getHeaderRows = ({
  gmMetricHeader,
  showTransferMetrics,
}: Pick<ParameterTableCopyOptions, "gmMetricHeader" | "showTransferMetrics">): string[][] => {
  if (!showTransferMetrics) {
    return [
      ["#", localize("calc_group_series", "Series"), gmMetricHeader, "x"],
    ];
  }

  return [
    [
      "#",
      localize("calc_group_series", "Series"),
      localize("calc_group_on_state", "On-state"),
      "",
      localize("calc_group_off_state", "Off-state"),
      "",
      localize("calc_group_ratio", "On/Off Ratio"),
      localize("calc_group_derivative", "Derivative"),
      "",
      localize("calc_group_threshold_voltage", "Threshold Voltage"),
      "",
      localize("calc_group_ss", "Subthreshold"),
      "",
      localize("calc_group_jon", "Current Density"),
    ],
    [
      "#",
      localize("calc_group_series", "Series"),
      "|I|on",
      "x",
      "|I|off",
      "x",
      "Ion/Ioff",
      gmMetricHeader,
      "x",
      "Vth,e",
      "Vth,h",
      "SS",
      "x",
      "Jon",
    ],
  ];
};

const getMetricText = (
  value: number | null | undefined,
  isPending: boolean,
  digits?: number,
): string => isPending ? "..." : formatMetricValue(value, digits);

const getParameterRowCells = (
  row: CalculatedParameterRowData & { isPending?: unknown },
  index: number,
  showTransferMetrics: boolean,
): string[] => {
  const isPending = Boolean(row?.isPending);
  const cells = [String(index + 1), row.name];

  if (showTransferMetrics) {
    cells.push(
      getMetricText(row.ion, isPending),
      getMetricText(row.xAtIon, isPending),
      getMetricText(row.ioff, isPending),
      getMetricText(row.xAtIoff, isPending),
      getMetricText(row.ionIoff, isPending, 3),
    );
  }

  cells.push(
    getMetricText(row.gmMaxAbs, isPending),
    getMetricText(row.xAtGmMaxAbs, isPending),
  );

  if (showTransferMetrics) {
    cells.push(
      getMetricText(row.thresholdVoltageElectron, isPending),
      getMetricText(row.thresholdVoltageHole, isPending),
      isPending ? "..." : getSsMetricText(row.ss, row.ssConfidence),
      getMetricText(row.xAtSs, isPending),
      getMetricText(row.jon, isPending),
    );
  }

  return cells;
};

export const createParameterTableTsv = ({
  gmMetricHeader,
  rows,
  showTransferMetrics,
}: ParameterTableCopyOptions): string => {
  const headerRows = getHeaderRows({ gmMetricHeader, showTransferMetrics });
  const bodyRows = rows.map((row, index) =>
    getParameterRowCells(row, index, showTransferMetrics),
  );

  return [...headerRows, ...bodyRows].map(joinTsvRow).join("\n");
};
