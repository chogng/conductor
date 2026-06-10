/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  normalizeCellText,
  parseFiniteNumber,
} from "../../../common/cellText.ts";
import {
  AUTO_SEGMENTATION_MIN_GROUP_SIZE,
  type ResolvedGroupShape,
  type TemplateRows,
} from "./autoTemplateTypes.ts";

const parseVoltageLikeValue = (raw: string): number | null => {
  const normalized = normalizeCellText(raw);
  if (!normalized) return null;
  const match = normalized.match(/([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*([a-zA-Zuμ]*)/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (match[2] || "").toLowerCase();
  const factor =
    unit === "mv"
      ? 1e-3
      : unit === "uv" || unit === "μv"
        ? 1e-6
        : unit === "kv"
          ? 1e3
          : 1;
  return value * factor;
};

const parsePositiveIntegerText = (raw: string): number | null => {
  const normalized = normalizeCellText(raw);
  if (!normalized) return null;
  const match = normalized.match(/(\d+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
};

export const parseVarSweepFromNotes = (
  notesText: string,
  varTag: "VAR1" | "VAR2",
): {
  count: number | null;
  start: number | null;
  step: number | null;
} | null => {
  const blockMatch = notesText.match(
    new RegExp(`\\[${varTag}\\]([\\s\\S]*?)(?=\\[[A-Z]+\\]|$)`, "i"),
  );
  const block = blockMatch?.[1] ?? "";
  if (!block) return null;

  const startMatch = block.match(/Start=([^,\]\t]+)/i);
  const stepMatch = block.match(/Step=([^,\]\t]+)/i);
  const countMatch = block.match(/No\.\s*of\s*Steps=([^,\]\t]+)/i);
  const start = startMatch ? parseVoltageLikeValue(startMatch[1]) : null;
  const step = stepMatch ? parseVoltageLikeValue(stepMatch[1]) : null;
  const count = countMatch ? parsePositiveIntegerText(countMatch[1]) : null;

  if (start === null && step === null && count === null) return null;
  return { count, start, step };
};

const parsePositiveIntegerFromCells = (cells: unknown[]): number | null => {
  const values = cells
    .map((cell) => {
      const numeric = parseFiniteNumber(cell);
      if (Number.isInteger(numeric) && Number(numeric) > 0) {
        return Number(numeric);
      }
      return parsePositiveIntegerText(String(cell ?? ""));
    })
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isInteger(value) && value > 0,
    );

  if (!values.length) return null;
  const first = values[0];
  return first === undefined ? null : first;
};

const findMetadataPositiveInteger = ({
  rows,
  firstCell,
  secondCell = null,
}: {
  firstCell: string;
  rows: TemplateRows;
  secondCell?: string | null;
}): number | null => {
  const expectedFirst = normalizeCellText(firstCell);
  const expectedSecond =
    secondCell === null ? null : normalizeCellText(secondCell);

  for (const rawRow of Array.isArray(rows) ? rows : []) {
    const row = Array.isArray(rawRow) ? rawRow : [];
    if (!row.length) continue;

    const first = normalizeCellText(row[0] ?? "");
    const second = normalizeCellText(row[1] ?? "");
    if (first !== expectedFirst) continue;
    if (expectedSecond !== null && second !== expectedSecond) continue;

    const valueStartIndex = expectedSecond === null ? 1 : 2;
    const resolved = parsePositiveIntegerFromCells(row.slice(valueStartIndex));
    if (resolved !== null) return resolved;
  }

  return null;
};

const findMetadataFiniteNumber = ({
  rows,
  firstCell,
  secondCell,
}: {
  firstCell: string;
  rows: TemplateRows;
  secondCell: string;
}): number | null => {
  const expectedFirst = normalizeCellText(firstCell);
  const expectedSecond = normalizeCellText(secondCell);

  for (const rawRow of Array.isArray(rows) ? rows : []) {
    const row = Array.isArray(rawRow) ? rawRow : [];
    if (!row.length) continue;
    if (normalizeCellText(row[0] ?? "") !== expectedFirst) continue;
    if (normalizeCellText(row[1] ?? "") !== expectedSecond) continue;

    for (const cell of row.slice(2)) {
      const numeric = parseFiniteNumber(cell);
      if (numeric !== null) return numeric;
      const voltageLike = parseVoltageLikeValue(String(cell ?? ""));
      if (voltageLike !== null) return voltageLike;
    }
  }

  return null;
};

export const parseSecondarySweepFromRows = (
  rows: TemplateRows,
): {
  count: number | null;
  start: number | null;
  step: number | null;
} | null => {
  const count = findMetadataPositiveInteger({
    firstCell: "TestParameter",
    secondCell: "Measurement.Secondary.Count",
    rows,
  });
  const start = findMetadataFiniteNumber({
    firstCell: "TestParameter",
    secondCell: "Measurement.Secondary.Start",
    rows,
  });
  const step = findMetadataFiniteNumber({
    firstCell: "TestParameter",
    secondCell: "Measurement.Secondary.Step",
    rows,
  });

  if (count === null && start === null && step === null) return null;
  return { count, start, step };
};

const resolveGroupShapeFromCounts = ({
  dataStartRowIndex,
  groupSize,
  groups,
  totalRowCount,
}: {
  dataStartRowIndex: number;
  groupSize?: number | null;
  groups?: number | null;
  totalRowCount?: number | null;
}): Omit<ResolvedGroupShape, "source"> | null => {
  const totalRows = Number(totalRowCount);
  if (!Number.isInteger(totalRows) || totalRows <= dataStartRowIndex) return null;

  const dataRows = totalRows - dataStartRowIndex;
  if (dataRows < AUTO_SEGMENTATION_MIN_GROUP_SIZE) {
    return null;
  }

  const normalizedGroupSize =
    Number.isInteger(groupSize) && Number(groupSize) >= AUTO_SEGMENTATION_MIN_GROUP_SIZE
      ? Number(groupSize)
      : null;
  const normalizedGroups =
    Number.isInteger(groups) && Number(groups) >= 1
      ? Number(groups)
      : null;

  if (normalizedGroupSize !== null && normalizedGroups !== null) {
    if (normalizedGroupSize * normalizedGroups !== dataRows) return null;
    return {
      groupSize: normalizedGroupSize,
      groups: normalizedGroups,
    };
  }

  if (normalizedGroupSize !== null) {
    if (dataRows % normalizedGroupSize !== 0) return null;
    const resolvedGroups = dataRows / normalizedGroupSize;
    if (!Number.isInteger(resolvedGroups) || resolvedGroups < 1) {
      return null;
    }
    return {
      groupSize: normalizedGroupSize,
      groups: resolvedGroups,
    };
  }

  if (normalizedGroups !== null) {
    if (dataRows % normalizedGroups !== 0) return null;
    const resolvedGroupSize = dataRows / normalizedGroups;
    if (
      !Number.isInteger(resolvedGroupSize) ||
      resolvedGroupSize < AUTO_SEGMENTATION_MIN_GROUP_SIZE
    ) {
      return null;
    }
    return {
      groupSize: resolvedGroupSize,
      groups: normalizedGroups,
    };
  }

  return null;
};

export const inferMetadataGroupShapeFromRows = ({
  dataStartRowIndex,
  rows,
  totalRowCount,
  notesText = "",
}: {
  dataStartRowIndex: number;
  rows: TemplateRows;
  totalRowCount?: number | null;
  notesText?: string;
}): ResolvedGroupShape => {
  // Order matters here: explicit exported dimensions are more reliable than
  // sweep counts reconstructed from notes.
  const dimensionShape = resolveGroupShapeFromCounts({
    dataStartRowIndex,
    groupSize: findMetadataPositiveInteger({
      firstCell: "Dimension1",
      rows,
    }),
    groups: findMetadataPositiveInteger({
      firstCell: "Dimension2",
      rows,
    }),
    totalRowCount,
  });
  if (dimensionShape) {
    return {
      ...dimensionShape,
      source: "dimension",
    };
  }

  const secondarySweep = parseSecondarySweepFromRows(rows);
  const secondaryCountShape = resolveGroupShapeFromCounts({
    dataStartRowIndex,
    groups: secondarySweep?.count ?? null,
    totalRowCount,
  });
  if (secondaryCountShape) {
    return {
      ...secondaryCountShape,
      source: "secondaryCount",
    };
  }

  const notesSweep = notesText ? parseVarSweepFromNotes(notesText, "VAR2") : null;
  const notesShape = resolveGroupShapeFromCounts({
    dataStartRowIndex,
    groups: notesSweep?.count ?? null,
    totalRowCount,
  });
  if (notesShape) {
    return {
      ...notesShape,
      source: "notes",
    };
  }

  return {
    groupSize: null,
    groups: null,
    source: null,
  };
};

