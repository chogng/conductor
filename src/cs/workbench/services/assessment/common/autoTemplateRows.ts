/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  normalizeCellText,
  parseFiniteNumber,
} from "../../../common/cellText.ts";
import type { TemplateRows } from "./autoTemplateTypes.ts";

export const findGenericNumericColumns = ({
  dataStartRowIndex,
  rows,
}: {
  dataStartRowIndex: number;
  rows: TemplateRows;
}): { xCol: number | null; yCols: number[] } => {
  const maxColumns = rows.reduce((max, rawRow) => {
    const length = Array.isArray(rawRow) ? rawRow.length : 0;
    return Math.max(max, length);
  }, 0);
  const numericColumns: number[] = [];

  for (let colIndex = 0; colIndex < maxColumns; colIndex += 1) {
    if (columnHasNumericRows(rows, dataStartRowIndex, colIndex, 2)) {
      numericColumns.push(colIndex);
    }
  }

  if (numericColumns.length < 2) {
    return { xCol: null, yCols: [] };
  }

  return {
    xCol: numericColumns[0] ?? null,
    yCols: numericColumns.slice(1),
  };
};

export const getNormalizedRow = (
  rows: TemplateRows,
  rowIndex: number,
): string[] => {
  const rawRow = Array.isArray(rows?.[rowIndex]) ? rows[rowIndex] : [];
  return Array.isArray(rawRow)
    ? rawRow.map((value) => normalizeCellText(value))
    : [];
};

const headerLooksRelevant = (cell: string): boolean => {
  const normalized = normalizeCellText(cell).toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("voltage") ||
    normalized.includes("current") ||
    normalized.includes("drain") ||
    normalized.includes("gate") ||
    normalized.includes("source") ||
    normalized.includes("substrate") ||
    normalized === "id" ||
    normalized === "ig" ||
    normalized === "vg" ||
    normalized === "vd" ||
    normalized === "point" ||
    normalized === "repeat" ||
    normalized.startsWith("var")
  );
};

export const findHeaderRowIndex = (
  rows: TemplateRows,
): number => {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = getNormalizedRow(rows, rowIndex);
    if (!row.length) continue;
    if (row.includes("CH1 Voltage") && row.includes("CH2 Voltage")) {
      return rowIndex;
    }
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = getNormalizedRow(rows, rowIndex);
    if (!row.length) continue;
    if (row[0] !== "DataName") continue;
    const dataHeaders = row.slice(1).filter(Boolean);
    if (dataHeaders.length >= 2) {
      return rowIndex;
    }
  }

  for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex += 1) {
    const row = getNormalizedRow(rows, rowIndex);
    const nonEmptyCells = row.filter(Boolean);
    if (nonEmptyCells.length < 2) continue;

    const nextRow = Array.isArray(rows[rowIndex + 1]) ? (rows[rowIndex + 1] as Array<unknown>) : [];
    const numericCount = nextRow.reduce<number>((count, cell) => {
      return parseFiniteNumber(cell) === null ? count : count + 1;
    }, 0);
    if (numericCount >= 2) {
      return rowIndex;
    }
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = getNormalizedRow(rows, rowIndex);
    const nonEmptyCells = row.filter(Boolean);
    if (nonEmptyCells.length < 2) continue;
    if (!nonEmptyCells.some((cell) => headerLooksRelevant(cell))) continue;
    return rowIndex;
  }

  return 0;
};

export const columnHasNumericRows = (
  rows: TemplateRows,
  dataStartRowIndex: number,
  colIndex: number,
  minimumCount = 2,
): boolean => {
  let count = 0;
  for (let rowIndex = dataStartRowIndex; rowIndex < rows.length; rowIndex += 1) {
    const row = Array.isArray(rows[rowIndex]) ? (rows[rowIndex] as Array<unknown>) : [];
    if (parseFiniteNumber(row[colIndex]) === null) continue;
    count += 1;
    if (count >= minimumCount) return true;
  }
  return false;
};

