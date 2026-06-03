import { inferMetadataGroupShapeFromRows } from "./autoTemplateMetadata.ts";
import {
  AUTO_SEGMENTATION_MIN_GROUP_SIZE,
  AUTO_SEGMENTATION_MIN_GROUPS,
  AUTO_SEGMENTATION_REPEAT_THRESHOLD,
  type TemplateRows,
} from "./autoTemplateTypes.ts";
import {
  approxEqual,
  computeSpan,
  normalizeCellText,
  parseFiniteNumber,
} from "../../../common/cellText.ts";

const detectFirstGroupLength = ({
  rows,
  dataStartRowIndex,
  pointColIndex,
  var2ColIndex,
}: {
  dataStartRowIndex: number;
  pointColIndex: number;
  rows: TemplateRows;
  var2ColIndex: number;
}): number | null => {
  if (pointColIndex < 0 && var2ColIndex < 0) return null;

  const firstRow = Array.isArray(rows[dataStartRowIndex])
    ? (rows[dataStartRowIndex] as Array<unknown>)
    : [];
  const firstVar2 =
    var2ColIndex >= 0 ? normalizeCellText(firstRow[var2ColIndex] ?? "") : "";
  const firstPoint =
    pointColIndex >= 0 ? parseFiniteNumber(firstRow[pointColIndex]) : null;

  let count = 0;
  let previousPoint: number | null = null;

  for (let rowIndex = dataStartRowIndex; rowIndex < rows.length; rowIndex += 1) {
    const row = Array.isArray(rows[rowIndex]) ? (rows[rowIndex] as Array<unknown>) : [];
    if (!row.length) continue;

    const currentVar2 =
      var2ColIndex >= 0 ? normalizeCellText(row[var2ColIndex] ?? "") : "";
    const currentPoint =
      pointColIndex >= 0 ? parseFiniteNumber(row[pointColIndex]) : null;

    if (count > 0) {
      if (firstVar2 && currentVar2 && currentVar2 !== firstVar2) {
        break;
      }
      if (
        firstPoint !== null &&
        currentPoint !== null &&
        (currentPoint === firstPoint ||
          (previousPoint !== null && currentPoint < previousPoint))
      ) {
        break;
      }
    }

    count += 1;
    if (currentPoint !== null) {
      previousPoint = currentPoint;
    }
  }

  return count >= 2 ? count : null;
};

// X segmentation inference
// These helpers infer repeated sweep groups when the file is already flattened
// into rows and does not carry an explicit "group size" field we can trust.

const inferRepeatedXGroupLength = ({
  dataStartRowIndex,
  rows,
  totalRowCount,
  xCol,
}: {
  dataStartRowIndex: number;
  rows: TemplateRows;
  totalRowCount?: number | null;
  xCol: number;
}): number | null => {
  if (!Number.isInteger(xCol) || xCol < 0) return null;

  const xValues: number[] = [];
  for (let rowIndex = dataStartRowIndex; rowIndex < rows.length; rowIndex += 1) {
    const row = Array.isArray(rows[rowIndex]) ? (rows[rowIndex] as Array<unknown>) : [];
    const parsed = parseFiniteNumber(row[xCol]);
    if (parsed === null) break;
    xValues.push(parsed);
  }

  if (
    xValues.length <
    AUTO_SEGMENTATION_MIN_GROUP_SIZE * AUTO_SEGMENTATION_MIN_GROUPS
  ) {
    return null;
  }

  const totalRows = Number(totalRowCount);
  const totalDataRows =
    Number.isInteger(totalRows) && totalRows > dataStartRowIndex
      ? totalRows - dataStartRowIndex
      : xValues.length;
  if (
    !Number.isInteger(totalDataRows) ||
    totalDataRows <
      AUTO_SEGMENTATION_MIN_GROUP_SIZE * AUTO_SEGMENTATION_MIN_GROUPS
  ) {
    return null;
  }

  const span = computeSpan(xValues) ?? 0;
  const tolerance = Math.max(1e-9, Math.abs(span) * 1e-4);
  const maxIndex = Math.min(xValues.length - 1, 4000);
  const candidates: number[] = [];

  for (
    let groupSize = AUTO_SEGMENTATION_MIN_GROUP_SIZE;
    groupSize <= maxIndex;
    groupSize += 1
  ) {
    if (totalDataRows % groupSize !== 0) continue;
    if (approxEqual(xValues[groupSize], xValues[0], tolerance)) {
      candidates.push(groupSize);
      if (candidates.length >= 64) break;
    }
  }

  if (!candidates.length) return null;

  let bestGroupSize = 0;
  let bestScore = 0;
  for (const candidate of candidates) {
    const groups = totalDataRows / candidate;
    if (!Number.isInteger(groups) || groups < AUTO_SEGMENTATION_MIN_GROUPS) {
      continue;
    }

    const compareWindow = Math.min(xValues.length - candidate, candidate * 8);
    if (compareWindow <= 0) continue;

    let matched = 0;
    for (let index = 0; index < compareWindow; index += 1) {
      if (approxEqual(xValues[index], xValues[index + candidate], tolerance * 2)) {
        matched += 1;
      }
    }

    const score = matched / compareWindow;
    if (score > bestScore) {
      bestScore = score;
      bestGroupSize = candidate;
    }
  }

  if (
    !bestGroupSize ||
    bestScore < AUTO_SEGMENTATION_REPEAT_THRESHOLD
  ) {
    return null;
  }

  return bestGroupSize;
};

export const resolveAutoGroupShape = ({
  dataStartRowIndex,
  notesText,
  pointColIndex,
  rows,
  totalRowCount,
  var2ColIndex,
  xCol,
}: {
  dataStartRowIndex: number;
  notesText?: string;
  pointColIndex: number;
  rows: TemplateRows;
  totalRowCount?: number | null;
  var2ColIndex: number;
  xCol: number;
}): {
  groupSize: number | null;
  groups: number | null;
} => {
  // Prefer explicit metadata first; if that is absent, fall back to shape-based
  // detection from Point/VAR2 columns or repeated X values.
  const metadataShape = inferMetadataGroupShapeFromRows({
    dataStartRowIndex,
    rows,
    totalRowCount,
    notesText,
  });
  if (metadataShape.groupSize !== null && metadataShape.groups !== null) {
    return {
      groupSize: metadataShape.groupSize,
      groups: metadataShape.groups,
    };
  }

  const explicitGroupSize = detectFirstGroupLength({
    dataStartRowIndex,
    pointColIndex,
    rows,
    var2ColIndex,
  });
  const repeatedXGroupSize =
    explicitGroupSize === null
      ? inferRepeatedXGroupLength({
          dataStartRowIndex,
          rows,
          totalRowCount,
          xCol,
        })
      : null;
  const groupSize = explicitGroupSize ?? repeatedXGroupSize;
  return {
    groupSize,
    groups: resolveGroupCount({
      dataStartRowIndex,
      groupSize,
      totalRowCount,
    }),
  };
};

const resolveGroupCount = ({
  dataStartRowIndex,
  groupSize,
  totalRowCount,
}: {
  dataStartRowIndex: number;
  groupSize: number | null;
  totalRowCount?: number | null;
}): number | null => {
  const totalRows = Number(totalRowCount);
  const normalizedGroupSize = Number(groupSize);
  if (!Number.isInteger(normalizedGroupSize) || normalizedGroupSize <= 0) return null;
  if (!Number.isInteger(totalRows) || totalRows <= dataStartRowIndex) return null;

  const dataRows = totalRows - dataStartRowIndex;
  if (dataRows <= 0 || dataRows % normalizedGroupSize !== 0) return null;
  return dataRows / normalizedGroupSize;
};

