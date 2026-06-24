/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { normalizeColumnIndexes } from "src/cs/workbench/services/template/common/templateXYBinding";

const CELL_REF_RE = /^([A-Z]+)([1-9]\d*)$/i;
const END_LABEL = "End";

export type TemplateCellRef = {
  colIndex: number;
  rowIndex: number;
};

export type TemplateXRange = {
  readonly start: string;
  readonly end: string;
};

export type ResolvedTemplateXRange = {
  readonly column: number;
  readonly endCell: TemplateCellRef | null;
  readonly endRow: number | "end";
  readonly label: string;
  readonly startCell: TemplateCellRef;
  readonly startRow: number;
};

export const toColumnLabel = (colIndex: number): string => {
  let value = Math.max(0, Math.floor(Number(colIndex) || 0)) + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
};

export const toCellLabel = (rowIndex: number, colIndex: number): string =>
  `${toColumnLabel(colIndex)}${Math.max(0, Math.floor(Number(rowIndex) || 0)) + 1}`;

export const parseCellLabel = (value: unknown): TemplateCellRef | null => {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text) {
    return null;
  }

  const match = text.match(CELL_REF_RE);
  if (!match) {
    return null;
  }

  const rowNumber = Number(match[2]);
  if (!Number.isInteger(rowNumber) || rowNumber <= 0) {
    return null;
  }

  let colIndex = 0;
  for (const char of match[1]) {
    colIndex = colIndex * 26 + (char.charCodeAt(0) - 64);
  }

  return {
    colIndex: colIndex - 1,
    rowIndex: rowNumber - 1,
  };
};

export const isCellLabel = (value: unknown): boolean => Boolean(parseCellLabel(value));

export function normalizeTemplateXRange(value: unknown): TemplateXRange | null {
  if (typeof value === "string") {
    return normalizeTemplateXRangeParts(parseTemplateXRangeText(value));
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as { readonly start?: unknown; readonly end?: unknown };
  return normalizeTemplateXRangeParts({
    start: record.start,
    end: record.end,
  });
}

export function normalizeTemplateXRanges(
  values: readonly unknown[] | undefined,
  formStart?: unknown,
  formEnd?: unknown,
  formColumns?: readonly unknown[],
): TemplateXRange[] {
  const ranges = Array.isArray(values)
    ? values
      .map(value => normalizeTemplateXRange(value))
      .filter((value): value is TemplateXRange => Boolean(value))
    : [];
  if (ranges.length) {
    return ranges;
  }

  return createTemplateXRangesFromFormFields(formStart, formEnd, formColumns);
}

export function formatTemplateXRangeLabel(range: TemplateXRange): string {
  return `${range.start}:${normalizeTemplateXRangeEndLabel(range.end)}`;
}

export function resolveTemplateXRange(range: TemplateXRange): ResolvedTemplateXRange | null {
  const normalized = normalizeTemplateXRange(range);
  if (!normalized) {
    return null;
  }

  const startCell = parseCellLabel(normalized.start);
  if (!startCell) {
    return null;
  }

  if (isTemplateXRangeEnd(normalized.end)) {
    return {
      column: startCell.colIndex,
      endCell: null,
      endRow: "end",
      label: formatTemplateXRangeLabel(normalized),
      startCell,
      startRow: startCell.rowIndex,
    };
  }

  const endCell = parseCellLabel(normalized.end);
  if (!endCell || endCell.colIndex !== startCell.colIndex) {
    return null;
  }

  return {
    column: startCell.colIndex,
    endCell,
    endRow: endCell.rowIndex,
    label: formatTemplateXRangeLabel(normalized),
    startCell,
    startRow: startCell.rowIndex,
  };
}

export function getTemplateXRangeColumns(ranges: readonly TemplateXRange[]): number[] {
  const columns = ranges
    .map(range => resolveTemplateXRange(range)?.column)
    .filter((column): column is number => typeof column === "number");
  return normalizeColumnIndexes(columns);
}

export function getTemplateXRangeFormFields(ranges: readonly TemplateXRange[]): {
  readonly xDataEnd: string;
  readonly xDataStart: string;
} {
  const first = normalizeTemplateXRange(ranges[0]);
  if (!first) {
    return {
      xDataEnd: "",
      xDataStart: "",
    };
  }

  return {
    xDataEnd: isTemplateXRangeEnd(first.end) ? "" : first.end,
    xDataStart: first.start,
  };
}

export function areTemplateXRangesEqual(
  first: readonly TemplateXRange[] | undefined,
  second: readonly TemplateXRange[] | undefined,
): boolean {
  const normalizedFirst = normalizeTemplateXRanges(first);
  const normalizedSecond = normalizeTemplateXRanges(second);
  if (normalizedFirst.length !== normalizedSecond.length) {
    return false;
  }

  return normalizedFirst.every((range, index) => {
    const other = normalizedSecond[index];
    return range.start === other?.start && range.end === other.end;
  });
}

export function haveTemplateXRangesSameRows(ranges: readonly TemplateXRange[]): boolean {
  const resolved = ranges
    .map(range => resolveTemplateXRange(range))
    .filter((range): range is ResolvedTemplateXRange => Boolean(range));
  const first = resolved[0];
  if (!first) {
    return true;
  }

  return resolved.every(range =>
    range.startRow === first.startRow &&
    range.endRow === first.endRow,
  );
}

function parseTemplateXRangeText(value: string): {
  readonly start: unknown;
  readonly end: unknown;
} {
  const [start, ...rest] = value.split(":");
  return {
    start,
    end: rest.length ? rest.join(":") : END_LABEL,
  };
}

function normalizeTemplateXRangeParts({
  start,
  end,
}: {
  readonly start: unknown;
  readonly end: unknown;
}): TemplateXRange | null {
  const startCell = parseCellLabel(start);
  if (!startCell) {
    return null;
  }

  const endLabel = normalizeTemplateXRangeEndLabel(end);
  if (isTemplateXRangeEnd(endLabel)) {
    return {
      start: toCellLabel(startCell.rowIndex, startCell.colIndex),
      end: END_LABEL,
    };
  }

  const endCell = parseCellLabel(endLabel);
  if (!endCell || endCell.colIndex !== startCell.colIndex) {
    return null;
  }

  const startRow = Math.min(startCell.rowIndex, endCell.rowIndex);
  const endRow = Math.max(startCell.rowIndex, endCell.rowIndex);
  return {
    start: toCellLabel(startRow, startCell.colIndex),
    end: toCellLabel(endRow, startCell.colIndex),
  };
}

function createTemplateXRangesFromFormFields(
  formStart: unknown,
  formEnd: unknown,
  formColumns: readonly unknown[] | undefined,
): TemplateXRange[] {
  const startCell = parseCellLabel(formStart);
  if (!startCell) {
    return [];
  }

  const columns = normalizeColumnIndexes(formColumns).length
    ? normalizeColumnIndexes(formColumns)
    : [startCell.colIndex];
  const endLabel = normalizeTemplateXRangeEndLabel(formEnd);
  const endCell = isTemplateXRangeEnd(endLabel) ? null : parseCellLabel(endLabel);
  const endRow = endCell?.rowIndex ?? startCell.rowIndex;

  return columns
    .map(column => normalizeTemplateXRange({
      start: toCellLabel(startCell.rowIndex, column),
      end: endCell ? toCellLabel(endRow, column) : END_LABEL,
    }))
    .filter((range): range is TemplateXRange => Boolean(range));
}

function normalizeTemplateXRangeEndLabel(value: unknown): string {
  const raw = String(value ?? "").trim();
  return !raw || raw.toLowerCase() === "end" ? END_LABEL : raw.toUpperCase();
}

function isTemplateXRangeEnd(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase() === "end";
}
