const toOriginStyleCommandNumber = (value: unknown): string => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return "";
  }

  const num = Number(value);
  if (!Number.isFinite(num)) {
    return "";
  }

  return String(Math.min(96, Math.max(1, Math.round(num))));
};

export const buildOriginLegendCommands = (
  options: {
    legendFontSize?: unknown;
  } | null | undefined,
): string[] => {
  const legendFontSize = toOriginStyleCommandNumber(options?.legendFontSize);
  return legendFontSize ? [`legend.fsize=${legendFontSize};`] : [];
};
