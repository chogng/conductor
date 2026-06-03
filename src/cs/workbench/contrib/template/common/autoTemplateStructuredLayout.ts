import {
  detectAxisRole,
  type AxisRole,
  type FileAssessment,
  type CurveKind,
} from "../../../common/fileAssessment.ts";
import {
  approxEqual,
  computeSpan,
  normalizeCellText,
  parseFiniteNumber,
} from "../../../common/cellText.ts";
import { columnHasNumericRows } from "./autoTemplateRows.ts";
import {
  AUTO_SEGMENTATION_MIN_GROUP_SIZE,
  type AutoExtractionBlock,
  type StructuredSeriesLayout,
  type TemplateRows,
} from "./autoTemplateTypes.ts";

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

export const currentHeaderLooksLikeDrainCurrent = (header: string): boolean => {
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

export const currentHeaderLooksLikeGateCurrent = (header: string): boolean => {
  const normalized = normalizeCellText(header).toLowerCase();
  const compact = normalized.replace(/[\s_\-./()[\]{}:=]+/g, "");
  return (
    compact === "ig" ||
    compact.startsWith("ig") ||
    compact === "gatecurrent" ||
    compact === "gatei" ||
    normalized.includes("gate current") ||
    (normalized.includes("gate") && normalized.includes("current"))
  );
};

const getNumericColumnValues = ({
  rows,
  dataStartRowIndex,
  colIndex,
  limit = 512,
}: {
  rows: TemplateRows;
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
  rows: TemplateRows;
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
  rows: TemplateRows;
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
  rows: TemplateRows;
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

type StructuredHeaderEntry = {
  header: string;
  index: number;
  isDrainCurrent: boolean;
  normalized: string;
  numeric: boolean;
  role: AxisRole | null;
  suffixAxis: "x" | "y" | null;
};

const entryLooksLikeBlockX = (
  entry: StructuredHeaderEntry,
  assessment: FileAssessment,
): boolean =>
  entry.numeric &&
  !entry.isDrainCurrent &&
  (entry.suffixAxis === "x" ||
    entry.role === assessment.xAxisRole ||
    entry.role !== null ||
    entry.normalized.includes("voltage"));

const createSharedXBlock = ({
  bottomTitle,
  dataStartRowIndex,
  xAxisRole,
  xCol,
  yCols,
}: {
  bottomTitle: string;
  dataStartRowIndex: number;
  xAxisRole: AxisRole | null;
  xCol: number;
  yCols: number[];
}): AutoExtractionBlock => {
  const sortedYCols = [...yCols].sort((a, b) => a - b);
  const firstYCol = sortedYCols[0] ?? null;
  const legendStep =
    sortedYCols.length >= 2 ? sortedYCols[1]! - sortedYCols[0]! : 1;

  return {
    bottomTitle: bottomTitle || "X",
    endCol: Math.max(xCol, ...sortedYCols),
    legendStartColIndex: firstYCol,
    legendStartRowIndex:
      firstYCol !== null && dataStartRowIndex - 1 >= 0
        ? dataStartRowIndex - 1
        : null,
    legendStep,
    legendTarget: sortedYCols.length > 1 ? "yColumn" : "auto",
    startCol: Math.min(xCol, ...sortedYCols),
    xAxisRole,
    xCol,
    yCols: sortedYCols,
  };
};

const buildStructuredLayoutFromBlocks = ({
  blocks,
  assessment,
  curveType,
  leftTitle,
  reasons,
  xAxisRole,
}: {
  blocks: AutoExtractionBlock[];
  assessment: FileAssessment;
  curveType: CurveKind;
  leftTitle: string;
  reasons: string[];
  xAxisRole: AxisRole | null;
}): StructuredSeriesLayout | null => {
  const firstBlock = blocks[0] ?? null;
  if (!firstBlock) return null;
  const yCols = blocks.flatMap((block) => block.yCols);
  if (!yCols.length) return null;

  return {
    blocks,
    curveType,
    leftTitle,
    legendStartColIndex: firstBlock.legendStartColIndex,
    legendStartRowIndex: firstBlock.legendStartRowIndex,
    legendStep: firstBlock.legendStep,
    legendTarget: firstBlock.legendTarget,
    reasons,
    xAxisRole,
    xAxisRoleSource: assessment.xAxisRole ? assessment.xAxisRoleSource : "label",
    xCol: firstBlock.xCol,
    yCols,
  };
};

const inferSeparatedSharedXBlocks = ({
  assessment,
  dataStartRowIndex,
  entries,
}: {
  assessment: FileAssessment;
  dataStartRowIndex: number;
  entries: StructuredHeaderEntry[];
}): AutoExtractionBlock[] => {
  const blocks: AutoExtractionBlock[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const xEntry = entries[index];
    if (!xEntry || !entryLooksLikeBlockX(xEntry, assessment)) continue;

    const yCols: number[] = [];
    let scanIndex = index + 1;
    let endCol = xEntry.index;
    while (scanIndex < entries.length) {
      const candidate = entries[scanIndex];
      if (!candidate) break;
      if (entryLooksLikeBlockX(candidate, assessment)) break;
      if (candidate.numeric && candidate.isDrainCurrent) {
        yCols.push(candidate.index);
        endCol = candidate.index;
      }
      scanIndex += 1;
    }

    if (yCols.length > 0) {
      const xAxisRole =
        assessment.xAxisRole ??
        xEntry.role ??
        (xEntry.normalized.includes("drain") ? "vd" : null) ??
        (xEntry.normalized.includes("gate") ? "vg" : null);
      blocks.push({
        ...createSharedXBlock({
          bottomTitle: xEntry.header || "X",
          dataStartRowIndex,
          xAxisRole,
          xCol: xEntry.index,
          yCols,
        }),
        xAxisRole,
        endCol,
        startCol: xEntry.index,
      });
      index = Math.max(index, scanIndex - 1);
    }
  }

  return blocks.length >= 2 ? blocks : [];
};

export const inferSpecializedGenericLayout = ({
  curveType,
  dataStartRowIndex,
  headers,
  rows,
}: {
  curveType: CurveKind;
  dataStartRowIndex: number;
  headers: string[];
  rows: TemplateRows;
}): {
  leftTitle: string;
  xCol: number | null;
  xUnit: string;
  yCols: number[];
  yUnit: string;
} | null => {
  const structuredPairCandidates: Array<{ xCol: number; yCol: number }> = [];
  for (let index = 0; index < headers.length - 1; index += 1) {
    const leftHeader = normalizeCellText(headers[index]);
    const rightHeader = normalizeCellText(headers[index + 1]);
    const leftSuffix = normalizeStructuredAxisSuffix(leftHeader);
    const rightSuffix = normalizeStructuredAxisSuffix(rightHeader);
    if (leftSuffix.axis !== "x" || rightSuffix.axis !== "y") continue;
    if (!leftSuffix.stem || leftSuffix.stem !== rightSuffix.stem) continue;
    if (!columnHasNumericRows(rows, dataStartRowIndex, index, 2)) continue;
    if (!columnHasNumericRows(rows, dataStartRowIndex, index + 1, 2)) continue;
    structuredPairCandidates.push({ xCol: index, yCol: index + 1 });
  }

  if (structuredPairCandidates.length >= 2) {
    const sharedX = structuredPairCandidates.every((pair) =>
      columnsShareEquivalentX({
        rows,
        dataStartRowIndex,
        leftCol: structuredPairCandidates[0]?.xCol ?? pair.xCol,
        rightCol: pair.xCol,
      }),
    );
    if (sharedX) {
      return {
        leftTitle:
          headers[
            structuredPairCandidates[structuredPairCandidates.length - 1]?.yCol ?? 1
          ] || (curveType === "pv" ? "I" : "C"),
        xCol: structuredPairCandidates[0]?.xCol ?? null,
        xUnit: curveType === "cf" ? "Hz" : "V",
        yCols: structuredPairCandidates.map((pair) => pair.yCol),
        yUnit: curveType === "pv" ? "A" : "F",
      };
    }
  }

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

export const inferStructuredSeriesLayout = ({
  assessment,
  dataStartRowIndex,
  headers,
  rows,
}: {
  assessment: FileAssessment;
  dataStartRowIndex: number;
  headers: string[];
  rows: TemplateRows;
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
      role: detectAxisRole(normalizedHeader),
      isCurrent:
        normalized.includes("current") ||
        normalized === "id" ||
        /^i[gds]?([^a-z0-9]|$)/.test(normalized) ||
        compact.startsWith("id") ||
        compact.startsWith("ig") ||
        normalized === "ig" ||
        currentHeaderLooksLikeDrainCurrent(normalizedHeader),
      isDrainCurrent: currentHeaderLooksLikeDrainCurrent(normalizedHeader),
      isGateCurrent: currentHeaderLooksLikeGateCurrent(normalizedHeader),
    };
  });

  const separatedBlocks = inferSeparatedSharedXBlocks({
    assessment,
    dataStartRowIndex,
    entries: headerEntries,
  });
  const hasSeparatedBlockSignal =
    separatedBlocks.some((block) => block.yCols.length > 1);
  if (separatedBlocks.length >= 2 && hasSeparatedBlockSignal) {
    const firstBlock = separatedBlocks[0]!;
    const xAxisRole =
      assessment.xAxisRole ??
      firstBlock.xAxisRole ??
      (headers[firstBlock.xCol]?.toLowerCase().includes("drain") ? "vd" : null) ??
      (headers[firstBlock.xCol]?.toLowerCase().includes("gate") ? "vg" : null);
    return buildStructuredLayoutFromBlocks({
      blocks: separatedBlocks,
      assessment,
      curveType:
        assessment.curveType !== "unknown"
          ? assessment.curveType
          : xAxisRole === "vg"
            ? "transfer"
            : xAxisRole === "vd"
              ? "output"
              : "unknown",
      leftTitle: "Id",
      reasons: [
        `Detected ${separatedBlocks.length} separated X/Y column blocks with ${separatedBlocks.flatMap((block) => block.yCols).length} total Y column(s).`,
      ],
      xAxisRole,
    });
  }

  const pairCandidates: Array<{ xCol: number; yCol: number }> = [];
  for (let index = 0; index < headerEntries.length - 1; index += 1) {
    const left = headerEntries[index];
    const right = headerEntries[index + 1];
    if (!left.numeric || !right.numeric) continue;
    if (left.suffixAxis !== "x" || right.suffixAxis !== "y") continue;
    if (!left.suffixStem || left.suffixStem !== right.suffixStem) continue;
    pairCandidates.push({ xCol: left.index, yCol: right.index });
  }

  const adjacentVoltageCurrentPairs: Array<{ xCol: number; yCol: number }> = [];
  for (let index = 0; index < headerEntries.length - 1; index += 1) {
    const left = headerEntries[index];
    const right = headerEntries[index + 1];
    if (!left.numeric || !right.numeric) continue;
    if (!left.role) continue;
    if (!right.isCurrent || right.isGateCurrent || !right.isDrainCurrent) continue;
    adjacentVoltageCurrentPairs.push({ xCol: left.index, yCol: right.index });
  }

  if (adjacentVoltageCurrentPairs.length >= 2) {
    const sharedX = adjacentVoltageCurrentPairs.every((pair) =>
      columnsShareEquivalentX({
        rows,
        dataStartRowIndex,
        leftCol: adjacentVoltageCurrentPairs[0]?.xCol ?? pair.xCol,
        rightCol: pair.xCol,
      }),
    );
    const firstX = headerEntries[adjacentVoltageCurrentPairs[0]?.xCol ?? 0] ?? null;
    const xAxisRole =
      assessment.xAxisRole ??
      firstX?.role ??
      (firstX?.normalized.includes("drain") ? "vd" : null) ??
      (firstX?.normalized.includes("gate") ? "vg" : null);

    if (sharedX && xAxisRole) {
      const yCols = adjacentVoltageCurrentPairs.map((pair) => pair.yCol);
      return buildStructuredLayoutFromBlocks({
        blocks: [
          createSharedXBlock({
            bottomTitle: headers[adjacentVoltageCurrentPairs[0]!.xCol] || "X",
            dataStartRowIndex,
            xAxisRole,
            xCol: adjacentVoltageCurrentPairs[0]!.xCol,
            yCols,
          }),
        ],
        assessment,
        curveType:
          assessment.curveType !== "unknown"
            ? assessment.curveType
            : xAxisRole === "vg"
              ? "transfer"
              : "output",
        leftTitle: "Id",
        reasons: [
          `Detected ${adjacentVoltageCurrentPairs.length} adjacent voltage/Id column pairs with equivalent X traces; gate-current columns were excluded.`,
        ],
        xAxisRole,
      });
    }
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
        assessment.xAxisRole ??
        detectAxisRole(firstXHeader) ??
        (normalizeCellText(firstXHeader).toLowerCase().includes("drain") ? "vd" : null) ??
        (normalizeCellText(firstXHeader).toLowerCase().includes("gate") ? "vg" : null);

      const yCols = pairCandidates.map((pair) => pair.yCol);
      return buildStructuredLayoutFromBlocks({
        blocks: [
          createSharedXBlock({
            bottomTitle: firstXHeader,
            dataStartRowIndex,
            xAxisRole,
            xCol: pairCandidates[0]!.xCol,
            yCols,
          }),
        ],
        assessment,
        curveType:
          assessment.curveType !== "unknown"
            ? assessment.curveType
            : xAxisRole === "vg"
              ? "transfer"
              : xAxisRole === "vd"
                ? "output"
                : "unknown",
        leftTitle: "Id",
        reasons: [
          `Detected ${pairCandidates.length} adjacent X/Y column pairs with equivalent X traces.`,
        ],
        xAxisRole,
      });
    }
  }

  // XYYYY... case: one X-like column plus many drain-current columns. We keep
  // this strict on purpose so transfer files with Id/Ig/Vd do not get
  // misclassified as multi-Y output files.
  const xCandidates = headerEntries.filter(
    (entry) =>
      entry.numeric &&
      (entry.suffixAxis === "x" ||
        entry.role === assessment.xAxisRole ||
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
    assessment.xAxisRole ??
    primaryX.role ??
    (primaryX.normalized.includes("drain") ? "vd" : null) ??
    (primaryX.normalized.includes("gate") ? "vg" : null);

  const yCols = yCandidates.map((entry) => entry.index);
  return buildStructuredLayoutFromBlocks({
    blocks: [
      {
        ...createSharedXBlock({
          bottomTitle: primaryX.header || "X",
          dataStartRowIndex,
          xAxisRole,
          xCol: primaryX.index,
          yCols,
        }),
        legendStep: uniformYStep ? yStep : 1,
      },
    ],
    assessment,
    curveType:
      assessment.curveType !== "unknown"
        ? assessment.curveType
        : xAxisRole === "vg"
          ? "transfer"
          : xAxisRole === "vd"
            ? "output"
            : "unknown",
    leftTitle: "Id",
    reasons: [
      `Detected one shared X column with ${yCandidates.length} numeric Y columns.`,
    ],
    xAxisRole,
  });
};

