/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export const resolveLabelWithUnit = (
  label: unknown,
  unit: unknown,
  fallback: string,
): string => {
  const text = resolveAxisTitleLabel(label, fallback);
  const unitText = String(unit ?? "").trim();
  if (!unitText || text.includes("(")) return text;
  return `${text} (${unitText})`;
};

export const resolveAxisTitleLabel = (
  label: unknown,
  fallback: string,
): string =>
  String(label ?? "")
    .trim()
    .replace(/\s*\([^()]+\)\s*$/, "")
    .trim() || fallback;
