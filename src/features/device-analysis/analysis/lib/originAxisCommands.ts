export type OriginAxisScaleMode = "linear" | "log";

const ORIGIN_LINEAR_Y_PADDING_RATIO = 0.05;
const ORIGIN_LINEAR_SINGLE_VALUE_PADDING_RATIO = 0.1;
const ORIGIN_LOG_Y_PADDING_RATIO = 0.05;
const ORIGIN_LOG_Y_PADDING_DECADES_MIN = 0.2;
const ORIGIN_LOG_SINGLE_VALUE_PADDING_DECADES = 0.3;
const ORIGIN_LOG_ROBUST_MIN_SAMPLE_COUNT = 50;
const ORIGIN_LOG_ROBUST_LOW_QUANTILE = 0.05;
const ORIGIN_LOG_EXP_MIN = -300;
const ORIGIN_LOG_EXP_MAX = 300;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toOriginCommandNumber = (value: unknown): string => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  const normalized = Object.is(num, -0) ? 0 : num;
  return String(normalized);
};

const toOriginStyleCommandNumber = (value: unknown): string => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const num = Number(text);
  if (!Number.isFinite(num)) return "";
  const normalized = Object.is(num, -0) ? 0 : num;
  return String(normalized);
};

const normalizeOriginCommandText = (
  value: unknown,
  { max = 160 }: { max?: number } = {},
): string => {
  const raw = String(value ?? "")
    .replace(/[\\_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";
  return raw.length > max ? raw.slice(0, max).trim() : raw;
};

const escapeOriginLabTalkText = (value: unknown): string =>
  normalizeOriginCommandText(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');

const toOriginLogCommandNumber = (value: unknown): string => {
  const num = Number(value);
  if (!Number.isFinite(num) || !(num > 0)) return "";
  const normalized = Object.is(num, -0) ? 0 : num;
  return normalized.toExponential().replace("E", "e");
};

const toOriginAxisCommandNumber = (
  yScaleMode: OriginAxisScaleMode,
  value: unknown,
): string =>
  yScaleMode === "log"
    ? toOriginLogCommandNumber(value)
    : toOriginCommandNumber(value);

const computeSortedQuantile = (
  sortedValues: number[],
  qRaw: number,
): number | null => {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return null;
  const q = Number.isFinite(qRaw) ? Math.min(1, Math.max(0, qRaw)) : 0;
  const idx = Math.floor((sortedValues.length - 1) * q);
  const safeIdx = Math.min(sortedValues.length - 1, Math.max(0, idx));
  const value = Number(sortedValues[safeIdx]);
  return Number.isFinite(value) ? value : null;
};

export const resolveOriginLogPositiveMinForRange = (
  positiveValues: number[],
  rawMin: number,
): number => {
  if (
    !Array.isArray(positiveValues) ||
    positiveValues.length < ORIGIN_LOG_ROBUST_MIN_SAMPLE_COUNT
  ) {
    return rawMin;
  }

  const sorted = positiveValues
    .filter((v) => Number.isFinite(v) && v > 0)
    .slice()
    .sort((a, b) => a - b);
  if (!sorted.length) return rawMin;

  const quantileValue = computeSortedQuantile(
    sorted,
    ORIGIN_LOG_ROBUST_LOW_QUANTILE,
  );
  if (quantileValue === null || !Number.isFinite(quantileValue) || !(quantileValue > 0)) {
    return rawMin;
  }

  return Math.max(rawMin, quantileValue);
};

const buildPaddedLinearRange = (
  minRaw: unknown,
  maxRaw: unknown,
): { min: number; max: number } | null => {
  const min = Number(minRaw);
  const max = Number(maxRaw);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  let lo = Math.min(min, max);
  let hi = Math.max(min, max);

  if (lo === hi) {
    const magnitude = Math.max(Math.abs(lo), 1);
    const pad = magnitude * ORIGIN_LINEAR_SINGLE_VALUE_PADDING_RATIO;
    lo -= pad;
    hi += pad;
  } else {
    const span = hi - lo;
    const pad = Math.max(
      span * ORIGIN_LINEAR_Y_PADDING_RATIO,
      1e-12 * Math.max(Math.abs(lo), Math.abs(hi), 1),
    );
    lo -= pad;
    hi += pad;
  }

  if (!(hi > lo)) return null;
  return { min: lo, max: hi };
};

const buildPaddedLogRange = (
  minPositiveRaw: unknown,
  maxPositiveRaw: unknown,
): { min: number; max: number } | null => {
  const minPositive = Number(minPositiveRaw);
  const maxPositive = Number(maxPositiveRaw);
  if (!Number.isFinite(minPositive) || !Number.isFinite(maxPositive)) return null;
  if (!(minPositive > 0) || !(maxPositive > 0)) return null;

  const lo = Math.min(minPositive, maxPositive);
  const hi = Math.max(minPositive, maxPositive);
  const logLo = Math.log10(lo);
  const logHi = Math.log10(hi);
  if (!Number.isFinite(logLo) || !Number.isFinite(logHi)) return null;

  const isSingleValue = !(logHi > logLo);
  const padDecades = isSingleValue
    ? ORIGIN_LOG_SINGLE_VALUE_PADDING_DECADES
    : Math.max(
        ORIGIN_LOG_Y_PADDING_DECADES_MIN,
        (logHi - logLo) * ORIGIN_LOG_Y_PADDING_RATIO,
      );
  const outMin = Math.pow(
    10,
    clamp(logLo - padDecades, ORIGIN_LOG_EXP_MIN, ORIGIN_LOG_EXP_MAX),
  );
  const outMax = Math.pow(
    10,
    clamp(logHi + padDecades, ORIGIN_LOG_EXP_MIN, ORIGIN_LOG_EXP_MAX),
  );
  if (!Number.isFinite(outMin) || !Number.isFinite(outMax)) return null;
  if (!(outMin > 0) || !(outMax > outMin)) return null;
  return { min: outMin, max: outMax };
};

export const buildOriginYAxisRangeCommands = (
  yScaleMode: OriginAxisScaleMode,
  payload: {
    yPositiveMin?: unknown;
    yPositiveMax?: unknown;
    yLinearMin?: unknown;
    yLinearMax?: unknown;
  } | null | undefined,
): string[] => {
  const range =
    yScaleMode === "log"
      ? buildPaddedLogRange(payload?.yPositiveMin, payload?.yPositiveMax)
      : buildPaddedLinearRange(payload?.yLinearMin, payload?.yLinearMax);
  if (!range) return [];

  const fromText = toOriginAxisCommandNumber(yScaleMode, range.min);
  const toText = toOriginAxisCommandNumber(yScaleMode, range.max);
  if (!fromText || !toText) return [];

  return [`layer.y.from=${fromText}`, `layer.y.to=${toText}`, "layer.y.rescale=1"];
};

export const buildOriginYAxisRangeCommandsFromDisplayRange = (
  yScaleMode: OriginAxisScaleMode,
  rangeRaw: { min?: unknown; max?: unknown } | null | undefined,
): string[] => {
  const minRaw = Number(rangeRaw?.min);
  const maxRaw = Number(rangeRaw?.max);
  if (!Number.isFinite(minRaw) || !Number.isFinite(maxRaw)) return [];

  const min = Math.min(minRaw, maxRaw);
  const max = Math.max(minRaw, maxRaw);
  if (!(max > min)) return [];
  if (yScaleMode === "log" && (!(min > 0) || !(max > 0))) return [];

  const fromText = toOriginAxisCommandNumber(yScaleMode, min);
  const toText = toOriginAxisCommandNumber(yScaleMode, max);
  if (!fromText || !toText) return [];

  return [`layer.y.from=${fromText}`, `layer.y.to=${toText}`, "layer.y.rescale=0"];
};

export const buildOriginXAxisRangeCommandsFromDisplayRange = (
  rangeRaw: { min?: unknown; max?: unknown } | null | undefined,
): string[] => {
  const minRaw = Number(rangeRaw?.min);
  const maxRaw = Number(rangeRaw?.max);
  if (!Number.isFinite(minRaw) || !Number.isFinite(maxRaw)) return [];

  const min = Math.min(minRaw, maxRaw);
  const max = Math.max(minRaw, maxRaw);
  if (!(max > min)) return [];

  const fromText = toOriginCommandNumber(min);
  const toText = toOriginCommandNumber(max);
  if (!fromText || !toText) return [];

  return [`layer.x.from=${fromText}`, `layer.x.to=${toText}`, "layer.x.rescale=0"];
};

export const buildOriginAxisSpacingCommands = (
  axisSettings: {
    originTickLabelOffset?: unknown;
    originAxisTitleGap?: unknown;
  } | null | undefined,
): string[] => {
  const commands: string[] = [];
  const tickLabelOffset = toOriginStyleCommandNumber(
    axisSettings?.originTickLabelOffset,
  );
  if (tickLabelOffset) {
    commands.push(
      `layer.x.label.offsetV=${tickLabelOffset}`,
      `layer.y.label.offsetH=${tickLabelOffset}`,
    );
  }

  const axisTitleGap = toOriginStyleCommandNumber(
    axisSettings?.originAxisTitleGap,
  );
  if (axisTitleGap) {
    commands.push(`system.tick.gapAxTitle=${axisTitleGap}`);
  }

  return commands.length ? [commands.join("; ")] : [];
};

export const buildOriginAxisTitleCommands = (
  options: {
    xAxisTitle?: unknown;
    yAxisTitle?: unknown;
    axisTitleFontSize?: unknown;
  } | null | undefined,
): string[] => {
  const commands: string[] = [];
  const xAxisTitle = escapeOriginLabTalkText(options?.xAxisTitle);
  const yAxisTitle = escapeOriginLabTalkText(options?.yAxisTitle);
  const axisTitleFontSize = toOriginStyleCommandNumber(options?.axisTitleFontSize);

  if (xAxisTitle) {
    commands.push(`label -xb "${xAxisTitle}";`);
  }
  if (yAxisTitle) {
    commands.push(`label -yl "${yAxisTitle}";`);
  }
  if (axisTitleFontSize) {
    commands.push(`xb.fsize=${axisTitleFontSize};`, `yl.fsize=${axisTitleFontSize};`);
  }

  return commands;
};
