/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export const resolveLabelWithUnit = (
  label: unknown,
  unit: unknown,
  fallback: string,
): string => {
  const text = String(label ?? "").trim() || fallback;
  const unitText = String(unit ?? "").trim();
  if (!unitText || text.includes("(")) return text;
  return `${text} (${unitText})`;
};
