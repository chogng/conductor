export type XSegmentationMode = "auto" | "points" | "segments";

type CellRef = {
  rowIndex: number;
  colIndex: number;
};

type XRangeForPreview = {
  xCol: number;
  startRow: number;
  endRow: number;
  total: number;
};

export type XAutoSegmentationSuggestion = {
  confidence: number;
  groupSize: number;
  groups: number;
  total: number;
};

const CELL_REF_RE = /^([A-Z]+)([1-9]\d*)$/i;
const MIN_GROUP_SIZE = 2;
const DEFAULT_MAX_SCAN_ROWS = 8000;
const DEFAULT_MIN_GROUPS = 2;
const DEFAULT_REPEAT_THRESHOLD = 0.9;

const parseCellRef = (value: unknown): CellRef | null => {
  const text = String(value ?? "").trim().toUpperCase();
  if (!text) return null;
  const match = text.match(CELL_REF_RE);
  if (!match) return null;

  const row = Number(match[2]);
  if (!Number.isInteger(row) || row <= 0) return null;

  let colIndex = 0;
  for (const char of match[1]) {
    colIndex = colIndex * 26 + (char.charCodeAt(0) - 64);
  }

  return {
    rowIndex: row - 1,
    colIndex: colIndex - 1,
  };
};

const parseFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizePreviewRowCount = (value: unknown): number | null => {
  const rowCount = Number(value);
  if (!Number.isInteger(rowCount) || rowCount <= 0) return null;
  return rowCount;
};

const approxEqual = (a: number, b: number, tolerance: number): boolean =>
  Math.abs(a - b) <= tolerance;

export const resolveXSegmentationMode = (
  modeRaw: unknown,
): XSegmentationMode => {
  const mode = String(modeRaw ?? "").trim().toLowerCase();
  if (mode === "auto" || mode === "points" || mode === "segments") return mode;

  return "auto";
};

export const resolveXRangeForPreview = ({
  xDataStart,
  xDataEnd,
  previewRowCount,
}: {
  xDataStart: unknown;
  xDataEnd: unknown;
  previewRowCount: unknown;
}): XRangeForPreview | null => {
  const start = parseCellRef(xDataStart);
  if (!start) return null;

  const endRaw = String(xDataEnd ?? "").trim();
  const useEnd = !endRaw || endRaw.toLowerCase() === "end";

  if (useEnd) {
    const rowCount = normalizePreviewRowCount(previewRowCount);
    if (!rowCount || rowCount <= start.rowIndex) return null;
    const endRow = rowCount - 1;
    return {
      xCol: start.colIndex,
      startRow: start.rowIndex,
      endRow,
      total: endRow - start.rowIndex + 1,
    };
  }

  const end = parseCellRef(endRaw);
  if (!end) return null;
  if (end.colIndex !== start.colIndex) return null;

  const startRow = Math.min(start.rowIndex, end.rowIndex);
  const endRow = Math.max(start.rowIndex, end.rowIndex);
  const total = endRow - startRow + 1;
  if (total <= 0) return null;

  return {
    xCol: start.colIndex,
    startRow,
    endRow,
    total,
  };
};

const buildCandidateGroupSizes = (
  values: number[],
  total: number,
  tolerance: number,
): number[] => {
  const candidates: number[] = [];
  const maxIndex = Math.min(values.length - 1, 4000);

  for (let i = MIN_GROUP_SIZE; i <= maxIndex; i += 1) {
    if (total % i !== 0) continue;
    if (approxEqual(values[i], values[0], tolerance)) {
      candidates.push(i);
      if (candidates.length >= 64) break;
    }
  }

  return candidates;
};

const scoreCandidate = (
  values: number[],
  groupSize: number,
  tolerance: number,
): number => {
  const compareWindow = Math.min(values.length - groupSize, groupSize * 8);
  if (compareWindow <= 0) return 0;

  let matched = 0;
  for (let i = 0; i < compareWindow; i += 1) {
    if (approxEqual(values[i], values[i + groupSize], tolerance)) {
      matched += 1;
    }
  }

  return matched / compareWindow;
};

export const inferXSegmentationSuggestionFromPreview = ({
  xDataStart,
  xDataEnd,
  previewRowCount,
  getPreviewRow,
  maxScanRows = DEFAULT_MAX_SCAN_ROWS,
  minGroups = DEFAULT_MIN_GROUPS,
  repeatThreshold = DEFAULT_REPEAT_THRESHOLD,
}: {
  xDataStart: unknown;
  xDataEnd: unknown;
  previewRowCount: unknown;
  getPreviewRow?: ((rowIndex: number) => unknown) | null;
  maxScanRows?: number;
  minGroups?: number;
  repeatThreshold?: number;
}): XAutoSegmentationSuggestion | null => {
  if (typeof getPreviewRow !== "function") return null;

  const range = resolveXRangeForPreview({
    xDataStart,
    xDataEnd,
    previewRowCount,
  });
  if (!range) return null;
  if (range.total < MIN_GROUP_SIZE * minGroups) return null;

  const scanRows = Math.min(range.total, Math.max(MIN_GROUP_SIZE * 2, maxScanRows));
  const values: number[] = [];

  for (let offset = 0; offset < scanRows; offset += 1) {
    const row = getPreviewRow(range.startRow + offset);
    if (!Array.isArray(row)) return null;
    const parsed = parseFiniteNumber(row[range.xCol]);
    if (parsed === null) return null;
    values.push(parsed);
  }

  if (values.length < MIN_GROUP_SIZE * minGroups) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.abs(max - min);
  const tolerance = Math.max(1e-9, span * 1e-4);

  const candidates = buildCandidateGroupSizes(values, range.total, tolerance);
  if (!candidates.length) return null;

  let bestGroupSize = 0;
  let bestScore = 0;

  for (const candidate of candidates) {
    const groups = range.total / candidate;
    if (!Number.isInteger(groups) || groups < minGroups) continue;

    const score = scoreCandidate(values, candidate, tolerance * 2);
    if (score > bestScore) {
      bestScore = score;
      bestGroupSize = candidate;
    }
  }

  if (!bestGroupSize || bestScore < repeatThreshold) return null;

  return {
    confidence: bestScore,
    groupSize: bestGroupSize,
    groups: range.total / bestGroupSize,
    total: range.total,
  };
};
