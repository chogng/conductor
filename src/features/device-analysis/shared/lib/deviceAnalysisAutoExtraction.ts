import {
  classifyDeviceAnalysisCurve,
  detectDeviceAnalysisAxisRole,
  extractDeviceAnalysisCurveMetadata,
  type DeviceAnalysisAxisRole,
  type DeviceAnalysisCurveClassification,
  type DeviceAnalysisCurveConfidence,
  type DeviceAnalysisCurveKind,
  type DeviceAnalysisCurveSource,
} from "./deviceAnalysisCurveClassification.js";
import {
  approxEqual,
  computeSpan,
  normalizeCellText,
  parseFiniteNumber,
} from "./deviceAnalysisSharedUtils.js";
import { getExcelColumnLabel } from "./deviceAnalysisUtils.js";

export const DEVICE_ANALYSIS_AUTO_TEMPLATE_ID = "__auto__";

export type DeviceAnalysisAutoExtractionPlan = {
  bottomTitle: string;
  confidence: DeviceAnalysisCurveConfidence;
  curveType: DeviceAnalysisCurveKind;
  curveTypeLabel: string | null;
  dataStartRowIndex: number;
  groups: number | null;
  leftTitle: string;
  legendPrefix: string;
  legendStartColIndex: number | null;
  legendStartRowIndex: number | null;
  legendStartValue: string | null;
  legendCount: number | null;
  legendStep: number | null;
  legendTarget: "auto" | "group" | "yColumn";
  needsTemplate: boolean;
  reasons: string[];
  xAxisRole: DeviceAnalysisAxisRole | null;
  xAxisRoleSource: DeviceAnalysisCurveSource;
  xCol: number;
  xPointsPerGroup: number | null;
  xSegmentationMode: "auto" | "points";
  xUnit: string;
  yCols: number[];
  yUnit: string;
};

const findGenericNumericColumns = ({
  dataStartRowIndex,
  rows,
}: {
  dataStartRowIndex: number;
  rows: Array<Array<unknown> | null | undefined>;
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

export type DeviceAnalysisAutoExtractionResult =
  | {
      message: string;
      ok: false;
      reasons: string[];
    }
  | {
      ok: true;
      plan: DeviceAnalysisAutoExtractionPlan;
    };

const AUTO_SEGMENTATION_MIN_GROUP_SIZE = 2;
const AUTO_SEGMENTATION_MIN_GROUPS = 2;
const AUTO_SEGMENTATION_REPEAT_THRESHOLD = 0.9;

const formatCompactNumber = (value: number | null | undefined): string => {
  if (!Number.isFinite(value)) return "";
  return `${Number(Number(value).toPrecision(12))}`;
};

type ResolvedGroupShape = {
  groupSize: number | null;
  groups: number | null;
  source: "dimension" | "secondaryCount" | "notes" | null;
};

type StructuredSeriesLayout = {
  curveType: DeviceAnalysisCurveKind;
  leftTitle: string;
  legendStartColIndex: number | null;
  legendStartRowIndex: number | null;
  legendStep: number | null;
  legendTarget: "auto" | "group" | "yColumn";
  reasons: string[];
  xAxisRole: DeviceAnalysisAxisRole | null;
  xAxisRoleSource: DeviceAnalysisCurveSource;
  xCol: number;
  yCols: number[];
};

const normalizeHeaderCompact = (value: unknown): string =>
  normalizeCellText(value)
    .toLowerCase()
    .replace(/[\s_\-./()[\]{}:=`]+/g, "");

const isVoltageLikeHeader = (value: unknown): boolean => {
  const compact = normalizeHeaderCompact(value);
  return (
    compact === "v" ||
    compact === "vp" ||
    compact === "vpn" ||
    compact === "vg" ||
    compact === "vd" ||
    compact.startsWith("vbias") ||
    compact.includes("voltage")
  );
};

const isFrequencyLikeHeader = (value: unknown): boolean => {
  const compact = normalizeHeaderCompact(value);
  return compact.includes("freq") || compact.includes("frequency") || compact.includes("hz");
};

const isCapacitanceLikeHeader = (value: unknown): boolean => {
  const compact = normalizeHeaderCompact(value);
  return (
    compact === "cp" ||
    compact === "cs" ||
    compact.startsWith("cp") ||
    compact.startsWith("cs") ||
    compact.includes("cap")
  );
};

const isCurrentLikeHeader = (value: unknown): boolean => {
  const compact = normalizeHeaderCompact(value);
  return (
    compact === "in" ||
    compact === "ipt" ||
    compact === "id" ||
    compact === "ig" ||
    compact.includes("current") ||
    compact.startsWith("in") ||
    compact.startsWith("ipt")
  );
};

const toCellRef = (rowIndex: number, colIndex: number): string =>
  `${getExcelColumnLabel(colIndex)}${rowIndex + 1}`;

// ---------------------------------------------------------------------------
// Header and row-shape detection
// These helpers answer two questions for the rest of the file:
// 1. which row is the effective header row
// 2. which columns contain usable numeric data
// ---------------------------------------------------------------------------

const getNormalizedRow = (
  rows: Array<Array<unknown> | null | undefined>,
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

const findHeaderRowIndex = (
  rows: Array<Array<unknown> | null | undefined>,
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

const columnHasNumericRows = (
  rows: Array<Array<unknown> | null | undefined>,
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

const detectFirstGroupLength = ({
  rows,
  dataStartRowIndex,
  pointColIndex,
  var2ColIndex,
}: {
  dataStartRowIndex: number;
  pointColIndex: number;
  rows: Array<Array<unknown> | null | undefined>;
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

// ---------------------------------------------------------------------------
// X segmentation inference
// These helpers infer repeated sweep groups when the file is already flattened
// into rows and does not carry an explicit "group size" field we can trust.
// ---------------------------------------------------------------------------

const inferRepeatedXGroupLength = ({
  dataStartRowIndex,
  rows,
  totalRowCount,
  xCol,
}: {
  dataStartRowIndex: number;
  rows: Array<Array<unknown> | null | undefined>;
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

const resolveAutoGroupShape = ({
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
  rows: Array<Array<unknown> | null | undefined>;
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

const currentHeaderLooksLikeDrainCurrent = (header: string): boolean => {
  const normalized = normalizeCellText(header).toLowerCase();
  const compact = normalized.replace(/[\s_\-./()[\]{}:=]+/g, "");
  return (
    compact === "id" ||
    compact.startsWith("id") ||
    compact === "draincurrent" ||
    compact === "totalcurrent" ||
    compact === "draini" ||
    normalized.includes("drain current") ||
    (normalized.includes("drain") && normalized.includes("current")) ||
    normalized.includes("totalcurrent")
  );
};

// ---------------------------------------------------------------------------
// Structured column-layout detection
// This is the main extension point for new CSV layouts such as:
// - XYXYXY... : repeated adjacent X/Y pairs
// - XYYYY...  : one shared X followed by many drain-current columns
// The goal is to normalize those layouts back into the worker's native model:
// one xCol + many yCols + legend information.
// ---------------------------------------------------------------------------

const getNumericColumnValues = ({
  rows,
  dataStartRowIndex,
  colIndex,
  limit = 512,
}: {
  rows: Array<Array<unknown> | null | undefined>;
  dataStartRowIndex: number;
  colIndex: number;
  limit?: number;
}): number[] => {
  const values: number[] = [];
  for (
    let rowIndex = dataStartRowIndex;
    rowIndex < rows.length && values.length < limit;
    rowIndex += 1
  ) {
    const row = Array.isArray(rows[rowIndex]) ? (rows[rowIndex] as Array<unknown>) : [];
    const parsed = parseFiniteNumber(row[colIndex]);
    if (parsed === null) break;
    values.push(parsed);
  }
  return values;
};

const normalizeStructuredAxisSuffix = (
  header: string,
): { axis: "x" | "y" | null; stem: string } => {
  const normalized = normalizeCellText(header);
  if (!normalized) return { axis: null, stem: "" };
  const trimmed = normalized.trim();
  const suffixMatch = trimmed.match(/^(.*?)(?:[\s_\-./()[\]{}:=]+)?([xy])$/i);
  if (!suffixMatch) {
    return { axis: null, stem: trimmed.toLowerCase() };
  }
  const stem = normalizeCellText(suffixMatch[1]).toLowerCase();
  return {
    axis: suffixMatch[2].toLowerCase() === "x" ? "x" : "y",
    stem,
  };
};

const columnsShareEquivalentX = ({
  rows,
  dataStartRowIndex,
  leftCol,
  rightCol,
}: {
  rows: Array<Array<unknown> | null | undefined>;
  dataStartRowIndex: number;
  leftCol: number;
  rightCol: number;
}): boolean => {
  // We allow tiny floating-point drift because many export tools rewrite the
  // same X sweep with slightly different text formatting.
  const leftValues = getNumericColumnValues({
    rows,
    dataStartRowIndex,
    colIndex: leftCol,
  });
  const rightValues = getNumericColumnValues({
    rows,
    dataStartRowIndex,
    colIndex: rightCol,
  });
  const compareCount = Math.min(leftValues.length, rightValues.length);
  if (compareCount < AUTO_SEGMENTATION_MIN_GROUP_SIZE) return false;

  const leftSpan = computeSpan(leftValues) ?? 0;
  const rightSpan = computeSpan(rightValues) ?? 0;
  const tolerance = Math.max(
    1e-9,
    Math.max(Math.abs(leftSpan), Math.abs(rightSpan), 1) * 1e-4,
  );

  for (let index = 0; index < compareCount; index += 1) {
    if (!approxEqual(leftValues[index], rightValues[index], tolerance)) {
      return false;
    }
  }
  return true;
};

const columnsShareEquivalentY = ({
  rows,
  dataStartRowIndex,
  leftCol,
  rightCol,
}: {
  rows: Array<Array<unknown> | null | undefined>;
  dataStartRowIndex: number;
  leftCol: number;
  rightCol: number;
}): boolean => {
  const leftValues = getNumericColumnValues({
    rows,
    dataStartRowIndex,
    colIndex: leftCol,
  });
  const rightValues = getNumericColumnValues({
    rows,
    dataStartRowIndex,
    colIndex: rightCol,
  });
  const compareCount = Math.min(leftValues.length, rightValues.length);
  if (compareCount < AUTO_SEGMENTATION_MIN_GROUP_SIZE) return false;

  const maxMagnitude = Math.max(
    1,
    ...leftValues.map((value) => Math.abs(value)),
    ...rightValues.map((value) => Math.abs(value)),
  );
  const tolerance = Math.max(1e-12, maxMagnitude * 1e-6);
  for (let index = 0; index < compareCount; index += 1) {
    if (!approxEqual(leftValues[index], rightValues[index], tolerance)) {
      return false;
    }
  }
  return true;
};

const findNumericSemanticColumns = ({
  dataStartRowIndex,
  headers,
  rows,
  predicate,
}: {
  dataStartRowIndex: number;
  headers: string[];
  rows: Array<Array<unknown> | null | undefined>;
  predicate: (header: string) => boolean;
}): number[] =>
  headers
    .map((header, index) => ({ header, index }))
    .filter(
      ({ header, index }) =>
        predicate(header) && columnHasNumericRows(rows, dataStartRowIndex, index, 2),
    )
    .map(({ index }) => index);

const chooseBestSemanticPair = ({
  xCandidates,
  yCandidates,
}: {
  xCandidates: number[];
  yCandidates: number[];
}): { xCol: number | null; yCol: number | null } => {
  let bestPair: { gap: number; xCol: number; yCol: number } | null = null;
  for (const xCol of xCandidates) {
    for (const yCol of yCandidates) {
      if (yCol <= xCol) continue;
      const gap = yCol - xCol;
      if (
        !bestPair ||
        gap < bestPair.gap ||
        (gap === bestPair.gap && xCol > bestPair.xCol)
      ) {
        bestPair = { gap, xCol, yCol };
      }
    }
  }
  if (bestPair) {
    return { xCol: bestPair.xCol, yCol: bestPair.yCol };
  }
  return {
    xCol: xCandidates.at(-1) ?? xCandidates[0] ?? null,
    yCol: yCandidates.at(-1) ?? yCandidates[0] ?? null,
  };
};

const inferSpecializedGenericLayout = ({
  curveType,
  dataStartRowIndex,
  headers,
  rows,
}: {
  curveType: DeviceAnalysisCurveKind;
  dataStartRowIndex: number;
  headers: string[];
  rows: Array<Array<unknown> | null | undefined>;
}): {
  leftTitle: string;
  xCol: number | null;
  xUnit: string;
  yCols: number[];
  yUnit: string;
} | null => {
  if (curveType === "pv") {
    const xCandidates = findNumericSemanticColumns({
      dataStartRowIndex,
      headers,
      rows,
      predicate: isVoltageLikeHeader,
    });
    const yCandidates = findNumericSemanticColumns({
      dataStartRowIndex,
      headers,
      rows,
      predicate: isCurrentLikeHeader,
    });
    const pair = chooseBestSemanticPair({ xCandidates, yCandidates });
    if (pair.xCol === null || pair.yCol === null) return null;
    return {
      leftTitle: headers[pair.yCol] || "I",
      xCol: pair.xCol,
      xUnit: "V",
      yCols: [pair.yCol],
      yUnit: "A",
    };
  }

  if (curveType === "cv" || curveType === "cf") {
    const xCandidates = findNumericSemanticColumns({
      dataStartRowIndex,
      headers,
      rows,
      predicate: curveType === "cf" ? isFrequencyLikeHeader : isVoltageLikeHeader,
    });
    const yCandidates = findNumericSemanticColumns({
      dataStartRowIndex,
      headers,
      rows,
      predicate: isCapacitanceLikeHeader,
    });
    const pair = chooseBestSemanticPair({ xCandidates, yCandidates });
    if (pair.xCol === null || pair.yCol === null) return null;
    const uniqueYCols = yCandidates.filter(
      (colIndex, index) =>
        index ===
        yCandidates.findIndex((otherCol) =>
          columnsShareEquivalentY({
            rows,
            dataStartRowIndex,
            leftCol: colIndex,
            rightCol: otherCol,
          }),
        ),
    );
    const resolvedYCols = uniqueYCols.length ? uniqueYCols : [pair.yCol];
    const preferredYCols = resolvedYCols.filter((colIndex) => colIndex >= pair.xCol!);
    const yCols = preferredYCols.length ? preferredYCols : resolvedYCols;
    return {
      leftTitle: headers[yCols.at(-1) ?? pair.yCol] || "C",
      xCol: pair.xCol,
      xUnit: curveType === "cf" ? "Hz" : "V",
      yCols,
      yUnit: "F",
    };
  }

  return null;
};

const inferStructuredSeriesLayout = ({
  classification,
  dataStartRowIndex,
  headers,
  rows,
}: {
  classification: DeviceAnalysisCurveClassification;
  dataStartRowIndex: number;
  headers: string[];
  rows: Array<Array<unknown> | null | undefined>;
}): StructuredSeriesLayout | null => {
  const headerEntries = headers.map((header, index) => {
    const normalizedHeader = normalizeCellText(header);
    const normalized = normalizedHeader.toLowerCase();
    const compact = normalized.replace(/[\s_\-./()[\]{}:=]+/g, "");
    const suffix = normalizeStructuredAxisSuffix(normalizedHeader);
    const numeric = columnHasNumericRows(rows, dataStartRowIndex, index, 2);
    return {
      header: normalizedHeader,
      index,
      normalized,
      numeric,
      suffixAxis: suffix.axis,
      suffixStem: suffix.stem,
      role: detectDeviceAnalysisAxisRole(normalizedHeader),
      isCurrent:
        normalized.includes("current") ||
        normalized === "id" ||
        /^i[gds]?([^a-z0-9]|$)/.test(normalized) ||
        compact.startsWith("id") ||
        compact.startsWith("ig") ||
        normalized === "ig" ||
        currentHeaderLooksLikeDrainCurrent(normalizedHeader),
      isDrainCurrent: currentHeaderLooksLikeDrainCurrent(normalizedHeader),
    };
  });

  const pairCandidates: Array<{ xCol: number; yCol: number }> = [];
  for (let index = 0; index < headerEntries.length - 1; index += 1) {
    const left = headerEntries[index];
    const right = headerEntries[index + 1];
    if (!left.numeric || !right.numeric) continue;
    if (left.suffixAxis !== "x" || right.suffixAxis !== "y") continue;
    if (!left.suffixStem || left.suffixStem !== right.suffixStem) continue;
    pairCandidates.push({ xCol: left.index, yCol: right.index });
  }

  if (pairCandidates.length >= 2) {
    // XYXYXY... case: if every X column is effectively the same sweep, keep the
    // first X and turn all Y columns into parallel series.
    const sharedX = pairCandidates.every((pair) =>
      columnsShareEquivalentX({
        rows,
        dataStartRowIndex,
        leftCol: pairCandidates[0]?.xCol ?? pair.xCol,
        rightCol: pair.xCol,
      }),
    );

    if (sharedX) {
      const firstXHeader = headers[pairCandidates[0]?.xCol ?? 0] || "X";
      const xAxisRole =
        classification.xAxisRole ??
        detectDeviceAnalysisAxisRole(firstXHeader) ??
        (normalizeCellText(firstXHeader).toLowerCase().includes("drain") ? "vd" : null) ??
        (normalizeCellText(firstXHeader).toLowerCase().includes("gate") ? "vg" : null);

      return {
        curveType:
          classification.curveType !== "unknown"
            ? classification.curveType
            : xAxisRole === "vg"
              ? "transfer"
              : xAxisRole === "vd"
                ? "output"
                : "unknown",
        leftTitle: "Id",
        legendStartColIndex: pairCandidates[0]?.yCol ?? null,
        legendStartRowIndex: dataStartRowIndex - 1 >= 0 ? dataStartRowIndex - 1 : null,
        legendStep:
          pairCandidates.length >= 2
            ? pairCandidates[1]!.yCol - pairCandidates[0]!.yCol
            : 1,
        legendTarget: "yColumn",
        reasons: [
          `Detected ${pairCandidates.length} adjacent X/Y column pairs with equivalent X traces.`,
        ],
        xAxisRole,
        xAxisRoleSource: classification.xAxisRole ? classification.xAxisRoleSource : "label",
        xCol: pairCandidates[0]!.xCol,
        yCols: pairCandidates.map((pair) => pair.yCol),
      };
    }
  }

  // XYYYY... case: one X-like column plus many drain-current columns. We keep
  // this strict on purpose so transfer files with Id/Ig/Vd do not get
  // misclassified as multi-Y output files.
  const xCandidates = headerEntries.filter(
    (entry) =>
      entry.numeric &&
      (entry.suffixAxis === "x" ||
        entry.role === classification.xAxisRole ||
        entry.role !== null),
  );
  const primaryX = xCandidates[0] ?? null;
  if (!primaryX) return null;

  const yCandidates = headerEntries.filter(
    (entry) => entry.numeric && entry.index !== primaryX.index && entry.isDrainCurrent,
  );

  if (yCandidates.length < 2) return null;

  const yStep =
    yCandidates.length >= 2
      ? yCandidates[1]!.index - yCandidates[0]!.index
      : 1;
  const uniformYStep = yCandidates.every(
    (entry, index) => index === 0 || entry.index - yCandidates[index - 1]!.index === yStep,
  );
  const xAxisRole =
    classification.xAxisRole ??
    primaryX.role ??
    (primaryX.normalized.includes("drain") ? "vd" : null) ??
    (primaryX.normalized.includes("gate") ? "vg" : null);

  return {
    curveType:
      classification.curveType !== "unknown"
        ? classification.curveType
        : xAxisRole === "vg"
          ? "transfer"
          : xAxisRole === "vd"
            ? "output"
            : "unknown",
    leftTitle: "Id",
    legendStartColIndex: yCandidates[0]!.index,
    legendStartRowIndex: dataStartRowIndex - 1 >= 0 ? dataStartRowIndex - 1 : null,
    legendStep: uniformYStep ? yStep : 1,
    legendTarget: "yColumn",
    reasons: [
      `Detected one shared X column with ${yCandidates.length} numeric Y columns.`,
    ],
    xAxisRole,
    xAxisRoleSource: classification.xAxisRole ? classification.xAxisRoleSource : "label",
    xCol: primaryX.index,
    yCols: yCandidates.map((entry) => entry.index),
  };
};

// ---------------------------------------------------------------------------
// Generic header matching and metadata parsing
// These helpers support the classic "single X + single Y/grouped rows" flow and
// also feed legend/group inference for the structured layouts above.
// ---------------------------------------------------------------------------

const findFirstMatchingColumn = ({
  dataStartRowIndex,
  fallbackToFirst = true,
  headers,
  rows,
  type,
  role,
}: {
  dataStartRowIndex: number;
  fallbackToFirst?: boolean;
  headers: string[];
  role: DeviceAnalysisAxisRole | null;
  rows: Array<Array<unknown> | null | undefined>;
  type: "current" | "voltage";
}): number | null => {
  const candidates = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header, index }) => {
      const normalized = normalizeCellText(header).toLowerCase();
      if (!normalized) return false;
      if (!columnHasNumericRows(rows, dataStartRowIndex, index, 2)) return false;
      return type === "voltage"
        ? normalized.includes("voltage") || normalized === "vg" || normalized === "vd"
        : normalized.includes("current") || normalized === "id" || normalized === "ig";
    });

  if (!candidates.length) return null;

  if (type === "current") {
    const drainCurrentCandidate = candidates.find(({ header }) =>
      currentHeaderLooksLikeDrainCurrent(header),
    );
    if (drainCurrentCandidate) return drainCurrentCandidate.index;
  }

  if (role) {
    const roleCandidate = candidates.find(
      ({ header }) => detectDeviceAnalysisAxisRole(header) === role,
    );
    if (roleCandidate) return roleCandidate.index;
  }

  return fallbackToFirst ? (candidates[0]?.index ?? null) : null;
};

const resolveLabelForRole = (
  role: DeviceAnalysisAxisRole | null,
  fallback: string,
): string => {
  if (role === "vg") return "Vg";
  if (role === "vd") return "Vd";
  return fallback;
};

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

const parseVarSweepFromNotes = (
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
  rows: Array<Array<unknown> | null | undefined>;
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
  rows: Array<Array<unknown> | null | undefined>;
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

const parseSecondarySweepFromRows = (
  rows: Array<Array<unknown> | null | undefined>,
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
  rows: Array<Array<unknown> | null | undefined>;
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

// ---------------------------------------------------------------------------
// Plan builders
// The stripped-channel path handles CH1/CH2 exports from measurement tools.
// The generic path handles everything else, including the new structured
// XYXY... / XYYYY... layouts.
// ---------------------------------------------------------------------------

const inferStrippedChannelPlan = ({
  classification,
  dataStartRowIndex,
  fileName,
  headers,
  metadata,
  rows,
  totalRowCount,
}: {
  classification: DeviceAnalysisCurveClassification;
  dataStartRowIndex: number;
  fileName: unknown;
  headers: string[];
  metadata: ReturnType<typeof extractDeviceAnalysisCurveMetadata>;
  rows: Array<Array<unknown> | null | undefined>;
  totalRowCount?: number | null;
}): DeviceAnalysisAutoExtractionResult => {
  const ch1VoltageCol = headers.findIndex((entry) => entry === "CH1 Voltage");
  const ch2VoltageCol = headers.findIndex((entry) => entry === "CH2 Voltage");
  const ch1CurrentCol = headers.findIndex((entry) => entry === "CH1 Current");
  const ch2CurrentCol = headers.findIndex((entry) => entry === "CH2 Current");
  const pointCol = headers.findIndex((entry) => entry === "Point");
  const var2Col = headers.findIndex((entry) => entry === "VAR2");

  if (
    ch1VoltageCol < 0 ||
    ch2VoltageCol < 0 ||
    ch1CurrentCol < 0 ||
    ch2CurrentCol < 0
  ) {
    return {
      message: `${String(fileName ?? "file")}: missing CH1/CH2 voltage/current columns.`,
      ok: false,
      reasons: [],
    };
  }

  const sweptAxis = metadata.strippedSweepVoltageAxis;
  if (!sweptAxis || !classification.xAxisRole || classification.curveType === "unknown") {
    return {
      message: `${String(fileName ?? "file")}: unable to infer stripped sweep roles automatically.`,
      ok: false,
      reasons: classification.reasons,
    };
  }

  const xCol = sweptAxis === "ch1" ? ch1VoltageCol : ch2VoltageCol;
  const fixedVoltageCol = sweptAxis === "ch1" ? ch2VoltageCol : ch1VoltageCol;
  const yCol =
    classification.curveType === "output"
      ? sweptAxis === "ch1"
        ? ch1CurrentCol
        : ch2CurrentCol
      : sweptAxis === "ch1"
        ? ch2CurrentCol
        : ch1CurrentCol;
  const { groupSize, groups } = resolveAutoGroupShape({
    dataStartRowIndex,
    notesText: metadata.notesText,
    pointColIndex: pointCol,
    rows,
    totalRowCount,
    var2ColIndex: var2Col,
    xCol,
  });
  const normalizedGroupSize =
    Number.isInteger(groupSize) && Number(groupSize) > 0 ? Number(groupSize) : null;
  const hasGroupedLegend = normalizedGroupSize !== null && (groups ?? 0) > 1;
  const fixedLegendValue =
    !hasGroupedLegend && Number.isFinite(metadata.strippedFixedVoltageMagnitude)
      ? formatCompactNumber(metadata.strippedFixedVoltageMagnitude)
      : null;
  const biasRole = classification.xAxisRole === "vg" ? "vd" : "vg";

  return {
    ok: true,
    plan: {
      bottomTitle: resolveLabelForRole(classification.xAxisRole, headers[xCol] || "X"),
      confidence: classification.confidence,
      curveType: classification.curveType,
      curveTypeLabel: classification.curveTypeLabel,
      dataStartRowIndex,
      groups,
      leftTitle: "Id",
      legendPrefix: resolveLabelForRole(biasRole, headers[fixedVoltageCol] || "Bias"),
      legendStartColIndex: hasGroupedLegend ? fixedVoltageCol : null,
      legendStartRowIndex: hasGroupedLegend ? dataStartRowIndex : null,
      legendStartValue: fixedLegendValue,
      legendCount: hasGroupedLegend ? null : fixedLegendValue ? 1 : null,
      legendStep: null,
      legendTarget: hasGroupedLegend ? "group" : fixedLegendValue ? "yColumn" : "auto",
      needsTemplate: classification.needsTemplate,
      reasons: classification.reasons,
      xAxisRole: classification.xAxisRole,
      xAxisRoleSource: classification.xAxisRoleSource,
      xCol,
      xPointsPerGroup: normalizedGroupSize,
      xSegmentationMode: normalizedGroupSize !== null ? "points" : "auto",
      xUnit: "V",
      yCols: [yCol],
      yUnit: "A",
    },
  };
};

const inferGenericPlan = ({
  classification,
  dataStartRowIndex,
  fileName,
  headers,
  metadata,
  rows,
  totalRowCount,
}: {
  classification: DeviceAnalysisCurveClassification;
  dataStartRowIndex: number;
  fileName: unknown;
  headers: string[];
  metadata: ReturnType<typeof extractDeviceAnalysisCurveMetadata>;
  rows: Array<Array<unknown> | null | undefined>;
  totalRowCount?: number | null;
}): DeviceAnalysisAutoExtractionResult => {
  const structuredLayout = inferStructuredSeriesLayout({
    classification,
    dataStartRowIndex,
    headers,
    rows,
  });

  const effectiveXAxisRole = structuredLayout?.xAxisRole ?? classification.xAxisRole;
  const effectiveCurveType = structuredLayout?.curveType ?? classification.curveType;
  const effectiveConfidence =
    classification.curveType !== "unknown" && classification.xAxisRole
      ? classification.confidence
      : structuredLayout
        ? "medium"
        : classification.confidence;
  const effectiveReasons = structuredLayout
    ? [...structuredLayout.reasons, ...classification.reasons]
    : classification.reasons;
  const effectiveRoleSource = structuredLayout?.xAxisRoleSource ?? classification.xAxisRoleSource;

  if (!effectiveXAxisRole || effectiveCurveType === "unknown") {
    if (
      effectiveCurveType === "cv" ||
      effectiveCurveType === "cf" ||
      effectiveCurveType === "pv"
    ) {
      const specializedLayout =
        inferSpecializedGenericLayout({
          curveType: effectiveCurveType,
          dataStartRowIndex,
          headers,
          rows,
        }) ??
        (() => {
          const genericColumns = findGenericNumericColumns({
            dataStartRowIndex,
            rows,
          });
          if (genericColumns.xCol === null || !genericColumns.yCols.length) return null;
          return {
            leftTitle: headers[genericColumns.yCols[0]!] || "Y",
            xCol: genericColumns.xCol,
            xUnit: effectiveCurveType === "cf" ? "Hz" : "V",
            yCols: genericColumns.yCols,
            yUnit: effectiveCurveType === "pv" ? "A" : "F",
          };
        })();
      if (
        specializedLayout &&
        specializedLayout.xCol !== null &&
        specializedLayout.yCols.length
      ) {
        const resolvedLayout = specializedLayout as typeof specializedLayout & {
          xCol: number;
        };
        const xHeader = headers[resolvedLayout.xCol] || "X";
        const isSingleSeries = resolvedLayout.yCols.length === 1;

        return {
          ok: true,
          plan: {
            bottomTitle: xHeader,
            confidence: effectiveConfidence === "low" ? "medium" : effectiveConfidence,
            curveType: effectiveCurveType,
            curveTypeLabel: effectiveCurveType,
            dataStartRowIndex,
            groups: 1,
            leftTitle: resolvedLayout.leftTitle,
            legendPrefix: "",
            legendStartColIndex: isSingleSeries ? null : resolvedLayout.yCols[0]!,
            legendStartRowIndex:
              isSingleSeries || dataStartRowIndex - 1 < 0 ? null : dataStartRowIndex - 1,
            legendStartValue: null,
            legendCount: isSingleSeries ? null : resolvedLayout.yCols.length,
            legendStep: isSingleSeries ? null : 1,
            legendTarget: isSingleSeries ? "auto" : "yColumn",
            needsTemplate: false,
            reasons:
              effectiveReasons.length > 0
                ? effectiveReasons
                : [
                    `Detected a generic ${effectiveCurveType.toUpperCase()} layout with one numeric X column and ${resolvedLayout.yCols.length} numeric Y column(s).`,
                  ],
            xAxisRole: null,
            xAxisRoleSource: effectiveRoleSource,
            xCol: resolvedLayout.xCol,
            xPointsPerGroup: null,
            xSegmentationMode: "auto",
            xUnit: resolvedLayout.xUnit,
            yCols: resolvedLayout.yCols,
            yUnit: resolvedLayout.yUnit,
          },
        };
      }
    }

    return {
      message: `${String(fileName ?? "file")}: unable to infer axis roles automatically.`,
      ok: false,
      reasons: effectiveReasons,
    };
  }

  const xCol =
    structuredLayout?.xCol ??
    findFirstMatchingColumn({
      dataStartRowIndex,
      headers,
      role: effectiveXAxisRole,
      rows,
      type: "voltage",
    });
  const fallbackYCol = findFirstMatchingColumn({
    dataStartRowIndex,
    headers,
    role: "vd",
    rows,
    type: "current",
  });
  const yCols = structuredLayout?.yCols?.length
    ? structuredLayout.yCols
    : fallbackYCol !== null
      ? [fallbackYCol]
      : [];

  if (xCol === null || !yCols.length) {
    return {
      message: `${String(fileName ?? "file")}: unable to locate auto extraction columns.`,
      ok: false,
      reasons: effectiveReasons,
    };
  }

  const pointCol = headers.findIndex((entry) => normalizeCellText(entry) === "Point");
  const var2Col = headers.findIndex((entry) => normalizeCellText(entry) === "VAR2");
  const { groupSize, groups } = resolveAutoGroupShape({
    dataStartRowIndex,
    notesText: metadata.notesText,
    pointColIndex: pointCol,
    rows,
    totalRowCount,
    var2ColIndex: var2Col,
    xCol,
  });
  const biasRole = effectiveXAxisRole === "vg" ? "vd" : "vg";
  const legendCol = findFirstMatchingColumn({
    dataStartRowIndex,
    fallbackToFirst: false,
    headers,
    role: biasRole,
    rows,
    type: "voltage",
  });
  const var2Role = detectDeviceAnalysisAxisRole(metadata.var2Name);
  const generatedLegendSweep =
    legendCol === null && var2Role === biasRole
      ? parseVarSweepFromNotes(metadata.notesText, "VAR2") ??
        parseSecondarySweepFromRows(rows)
      : null;
  const normalizedGroupSize =
    Number.isInteger(groupSize) && Number(groupSize) > 0 ? Number(groupSize) : null;
  const structuredLegendTarget = structuredLayout?.legendTarget ?? "auto";
  // Structured layouts already map legends by header columns, so they should
  // not be reinterpreted as "group legend" sweeps from row-wise metadata.
  const hasGroupedLegend =
    structuredLegendTarget !== "yColumn" &&
    normalizedGroupSize !== null &&
    (groups ?? 0) > 1 &&
    (legendCol !== null ||
      (generatedLegendSweep?.start !== null && generatedLegendSweep?.count !== null));
  const hasSingleGeneratedLegend =
    !hasGroupedLegend &&
    generatedLegendSweep?.start !== null &&
    generatedLegendSweep?.count === 1;
  const primaryYHeader = headers[yCols[0]!] || "Y";

  return {
    ok: true,
    plan: {
      bottomTitle: resolveLabelForRole(effectiveXAxisRole, headers[xCol] || "X"),
      confidence: effectiveConfidence,
      curveType: effectiveCurveType,
      curveTypeLabel:
        effectiveCurveType === classification.curveType
          ? classification.curveTypeLabel
          : effectiveCurveType === "transfer"
            ? effectiveXAxisRole === "vg"
              ? "transfer (vg)"
              : "transfer"
            : effectiveCurveType === "output"
              ? effectiveXAxisRole === "vd"
                ? "output (vd)"
                : "output"
              : effectiveCurveType === "pv"
                ? "pv"
              : effectiveCurveType === "cv"
                ? "cv"
                : effectiveCurveType === "cf"
                  ? "cf"
              : "unknown",
      dataStartRowIndex,
      groups,
      leftTitle:
        structuredLayout?.leftTitle ??
        (currentHeaderLooksLikeDrainCurrent(primaryYHeader) ? "Id" : primaryYHeader),
      legendPrefix:
        structuredLegendTarget === "yColumn"
          ? ""
          : legendCol !== null
          ? resolveLabelForRole(biasRole, headers[legendCol] || "Bias")
          : resolveLabelForRole(biasRole, metadata.var2Name || "Bias"),
      legendStartColIndex:
        structuredLegendTarget === "yColumn"
          ? structuredLayout?.legendStartColIndex ?? null
          : hasGroupedLegend
            ? legendCol
            : null,
      legendStartRowIndex:
        structuredLegendTarget === "yColumn"
          ? structuredLayout?.legendStartRowIndex ?? null
          : hasGroupedLegend
            ? dataStartRowIndex
            : null,
      legendStartValue:
        structuredLegendTarget !== "yColumn" &&
        hasGroupedLegend &&
        legendCol === null &&
        generatedLegendSweep &&
        generatedLegendSweep.start !== null
          ? formatCompactNumber(generatedLegendSweep.start)
          : hasSingleGeneratedLegend
            ? formatCompactNumber(generatedLegendSweep.start)
          : null,
      legendCount:
        structuredLegendTarget === "yColumn"
          ? yCols.length
          : hasGroupedLegend && legendCol === null
          ? (generatedLegendSweep?.count ?? null)
          : hasSingleGeneratedLegend
            ? 1
          : null,
      legendStep:
        structuredLegendTarget === "yColumn"
          ? (structuredLayout?.legendStep ?? 1)
          : hasGroupedLegend && legendCol === null
          ? (generatedLegendSweep?.step ?? null)
          : null,
      legendTarget:
        structuredLegendTarget === "yColumn"
          ? "yColumn"
          : hasGroupedLegend
            ? "group"
            : hasSingleGeneratedLegend
              ? "yColumn"
              : "auto",
      needsTemplate: classification.needsTemplate && !structuredLayout,
      reasons: effectiveReasons,
      xAxisRole: effectiveXAxisRole,
      xAxisRoleSource: effectiveRoleSource,
      xCol,
      xPointsPerGroup: normalizedGroupSize,
      xSegmentationMode: normalizedGroupSize !== null ? "points" : "auto",
      xUnit: "V",
      yCols,
      yUnit: "A",
    },
  };
};

// Public entry point for preview-time auto inference. Keep this thin so future
// layout rules can stay inside the dedicated helpers above.
export const inferDeviceAnalysisAutoExtraction = ({
  fileName,
  rows,
  totalRowCount,
}: {
  fileName?: unknown;
  rows: Array<Array<unknown> | null | undefined>;
  totalRowCount?: number | null;
}): DeviceAnalysisAutoExtractionResult => {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) {
    return {
      message: `${String(fileName ?? "file")}: no rows available for auto extraction.`,
      ok: false,
      reasons: [],
    };
  }

  const headerRowIndex = findHeaderRowIndex(safeRows);
  const headers = getNormalizedRow(safeRows, headerRowIndex);
  const dataStartRowIndex = Math.min(headerRowIndex + 1, safeRows.length);
  const metadata = extractDeviceAnalysisCurveMetadata(safeRows);
  const classification = classifyDeviceAnalysisCurve({
    fileName,
    metadata,
  });

  if (metadata.isStrippedChannelSweep) {
    return inferStrippedChannelPlan({
      classification,
      dataStartRowIndex,
      fileName,
      headers,
      metadata,
      rows: safeRows,
      totalRowCount,
    });
  }

  return inferGenericPlan({
    classification,
    dataStartRowIndex,
    fileName,
    headers,
    metadata,
    rows: safeRows,
    totalRowCount,
  });
};

// Shared serializer used by the template UI. This intentionally mirrors the
// worker config model so auto-detected plans remain editable by users.
export const buildDeviceAnalysisAutoTemplateConfig = (
  plan: DeviceAnalysisAutoExtractionPlan,
): Record<string, unknown> => {
  const normalizedGroupSize =
    Number.isInteger(plan.xPointsPerGroup) && Number(plan.xPointsPerGroup) > 0
      ? Number(plan.xPointsPerGroup)
      : null;
  return {
    autoExtractionMode: true,
    bottomTitle: plan.bottomTitle,
    leftTitle: plan.leftTitle,
    legendPrefix: plan.legendPrefix,
    xDataEnd: "End",
    xDataStart: toCellRef(plan.dataStartRowIndex, plan.xCol),
    xPointsPerGroup: normalizedGroupSize !== null ? String(normalizedGroupSize) : "",
    xSegmentationMode: plan.xSegmentationMode,
    xUnit: plan.xUnit,
    yColumns: [...plan.yCols],
    yLegendCount: plan.legendCount !== null ? String(plan.legendCount) : "",
    yLegendStart:
      plan.legendStartColIndex !== null && plan.legendStartRowIndex !== null
        ? toCellRef(plan.legendStartRowIndex, plan.legendStartColIndex)
        : plan.legendStartValue ?? "",
    yLegendStep: plan.legendStep !== null ? formatCompactNumber(plan.legendStep) : "",
    yLegendTarget: plan.legendTarget,
    yUnit: plan.yUnit,
  };
};

// Shared serializer used by the worker processing path.
export const buildDeviceAnalysisAutoWorkerConfig = (
  plan: DeviceAnalysisAutoExtractionPlan,
): Record<string, unknown> => {
  const normalizedGroupSize =
    Number.isInteger(plan.xPointsPerGroup) && Number(plan.xPointsPerGroup) > 0
      ? Number(plan.xPointsPerGroup)
      : null;
  const normalizedGroups =
    Number.isInteger(plan.groups) && Number(plan.groups) > 0
      ? Number(plan.groups)
      : null;
  return {
    autoDetectCurveType: true,
    bottomTitle: plan.bottomTitle,
    endRow: "end",
    fileNameVdKeywords: "",
    fileNameVgKeywords: "",
    groupSize: normalizedGroupSize,
    groups: normalizedGroups,
    leftTitle: plan.leftTitle,
    legendPrefix: plan.legendPrefix,
    startRow: plan.dataStartRowIndex,
    xCol: plan.xCol,
    xSegmentationMode: plan.xSegmentationMode,
    xUnit: plan.xUnit,
    yCols: [...plan.yCols],
    yLegendStartCell:
      plan.legendStartColIndex !== null && plan.legendStartRowIndex !== null
        ? {
            colIndex: plan.legendStartColIndex,
            rowIndex: plan.legendStartRowIndex,
          }
        : null,
    yLegendStartValue: plan.legendStartValue,
    yLegendCount: plan.legendCount,
    yLegendStep: plan.legendStep,
    yLegendTarget: plan.legendTarget,
    yUnit: plan.yUnit,
  };
};
