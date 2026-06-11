export const normalizeCellText = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .replace(/^"+|"+$/g, "")
    .trim();

export const parseFiniteNumber = (value: unknown): number | null => {
  const normalized = normalizeCellText(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const computeSpan = (values: readonly number[]): number | null => {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length < 2) return null;
  return Math.max(...finiteValues) - Math.min(...finiteValues);
};

export const approxEqual = (
  left: number,
  right: number,
  tolerance: number,
): boolean => Math.abs(left - right) <= tolerance;
