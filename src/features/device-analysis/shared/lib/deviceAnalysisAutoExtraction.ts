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

const toCellRef = (rowIndex: number, colIndex: number): string =>
  `${getExcelColumnLabel(colIndex)}${rowIndex + 1}`;

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
    compact === "draincurrent" ||
    compact === "draini" ||
    normalized.includes("drain current")
  );
};

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
  if (dataRows < AUTO_SEGMENTATION_MIN_GROUP_SIZE * AUTO_SEGMENTATION_MIN_GROUPS) {
    return null;
  }

  const normalizedGroupSize =
    Number.isInteger(groupSize) && Number(groupSize) >= AUTO_SEGMENTATION_MIN_GROUP_SIZE
      ? Number(groupSize)
      : null;
  const normalizedGroups =
    Number.isInteger(groups) && Number(groups) >= AUTO_SEGMENTATION_MIN_GROUPS
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
    if (!Number.isInteger(resolvedGroups) || resolvedGroups < AUTO_SEGMENTATION_MIN_GROUPS) {
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
  if (!classification.xAxisRole || classification.curveType === "unknown") {
    return {
      message: `${String(fileName ?? "file")}: unable to infer axis roles automatically.`,
      ok: false,
      reasons: classification.reasons,
    };
  }

  const xCol = findFirstMatchingColumn({
    dataStartRowIndex,
    headers,
    role: classification.xAxisRole,
    rows,
    type: "voltage",
  });
  const yCol = findFirstMatchingColumn({
    dataStartRowIndex,
    headers,
    role: "vd",
    rows,
    type: "current",
  });

  if (xCol === null || yCol === null) {
    return {
      message: `${String(fileName ?? "file")}: unable to locate auto extraction columns.`,
      ok: false,
      reasons: classification.reasons,
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
  const biasRole = classification.xAxisRole === "vg" ? "vd" : "vg";
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
  const hasGroupedLegend =
    normalizedGroupSize !== null &&
    (groups ?? 0) > 1 &&
    (legendCol !== null ||
      (generatedLegendSweep?.start !== null && generatedLegendSweep?.count !== null));
  const hasSingleGeneratedLegend =
    !hasGroupedLegend &&
    generatedLegendSweep?.start !== null &&
    generatedLegendSweep?.count === 1;
  const yHeader = headers[yCol] || "Y";

  return {
    ok: true,
    plan: {
      bottomTitle: resolveLabelForRole(classification.xAxisRole, headers[xCol] || "X"),
      confidence: classification.confidence,
      curveType: classification.curveType,
      curveTypeLabel: classification.curveTypeLabel,
      dataStartRowIndex,
      groups,
      leftTitle: currentHeaderLooksLikeDrainCurrent(yHeader) ? "Id" : yHeader,
      legendPrefix:
        legendCol !== null
          ? resolveLabelForRole(biasRole, headers[legendCol] || "Bias")
          : resolveLabelForRole(biasRole, metadata.var2Name || "Bias"),
      legendStartColIndex: hasGroupedLegend ? legendCol : null,
      legendStartRowIndex: hasGroupedLegend ? dataStartRowIndex : null,
      legendStartValue:
        hasGroupedLegend &&
        legendCol === null &&
        generatedLegendSweep &&
        generatedLegendSweep.start !== null
          ? formatCompactNumber(generatedLegendSweep.start)
          : hasSingleGeneratedLegend
            ? formatCompactNumber(generatedLegendSweep.start)
          : null,
      legendCount:
        hasGroupedLegend && legendCol === null
          ? (generatedLegendSweep?.count ?? null)
          : hasSingleGeneratedLegend
            ? 1
          : null,
      legendStep:
        hasGroupedLegend && legendCol === null
          ? (generatedLegendSweep?.step ?? null)
          : null,
      legendTarget: hasGroupedLegend ? "group" : hasSingleGeneratedLegend ? "yColumn" : "auto",
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
