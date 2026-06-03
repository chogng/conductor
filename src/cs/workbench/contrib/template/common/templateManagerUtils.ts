export type TemplateConfig = {
  bottomTitle: string;
  fileNameMatchCaseSensitive: boolean;
  fileNameVdKeywords: string;
  fileNameVgKeywords: string;
  leftTitle: string;
  legendPrefix: string;
  name: string;
  yColumns: number[];
  stopOnError: boolean;
  xDataEnd: string;
  xDataStart: string;
  xSegmentationMode: "auto" | "points" | "segments";
  xSegmentCount: string;
  xPointsPerGroup: string;
  xUnit: string;
  yLegendCount: string;
  yLegendStart: string;
  yLegendStep: string;
  yLegendTarget: "auto" | "yColumn" | "group";
  yUnit: string;
};

export const createEmptyTemplateConfig = (
  overrides: Partial<TemplateConfig> = {},
): TemplateConfig => ({
  name: "",
  xDataStart: "",
  xDataEnd: "",
  xSegmentationMode: "auto",
  xSegmentCount: "",
  xPointsPerGroup: "",
  xUnit: "V",
  yLegendStart: "",
  yLegendCount: "",
  yLegendStep: "",
  yLegendTarget: "auto",
  yUnit: "A",
  stopOnError: false,
  fileNameMatchCaseSensitive: false,
  bottomTitle: "",
  leftTitle: "",
  legendPrefix: "",
  fileNameVgKeywords: "",
  fileNameVdKeywords: "",
  yColumns: [],
  ...overrides,
});

export const normalizeXDataEndValue = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.toLowerCase() === "end") return "End";
  return raw;
};

export const cloneTemplateConfig = (
  config: Partial<TemplateConfig>,
): TemplateConfig => {
  const cloned = createEmptyTemplateConfig(config);
  const xDataEnd = normalizeXDataEndValue(cloned.xDataEnd);

  return {
    ...cloned,
    xDataEnd: xDataEnd || (cloned.xDataStart.trim() ? "End" : ""),
    yColumns: Array.isArray(config?.yColumns) ? [...config.yColumns] : [],
  };
};

export const normalizeTemplateConfigRecord = (
  source: Partial<TemplateConfig> & Record<string, unknown>,
): TemplateConfig => {
  const xDataStart = String(source?.xDataStart ?? "");
  const xDataEndRaw = normalizeXDataEndValue(source?.xDataEnd);
  const xDataEnd = !xDataEndRaw ? (xDataStart.trim() ? "End" : "") : xDataEndRaw;

  return createEmptyTemplateConfig({
    name: String(source?.name ?? ""),
    xDataStart,
    xDataEnd,
    xSegmentationMode:
      source?.xSegmentationMode === "points" ||
      source?.xSegmentationMode === "segments" ||
      source?.xSegmentationMode === "auto"
        ? source.xSegmentationMode
        : "auto",
    xSegmentCount: String(source?.xSegmentCount ?? ""),
    xPointsPerGroup: String(source?.xPointsPerGroup ?? ""),
    xUnit: String(source?.xUnit ?? "V") || "V",
    yLegendStart: String(source?.yLegendStart ?? ""),
    yLegendCount: String(source?.yLegendCount ?? ""),
    yLegendStep: String(source?.yLegendStep ?? ""),
    yLegendTarget:
      source?.yLegendTarget === "yColumn" ||
      source?.yLegendTarget === "group" ||
      source?.yLegendTarget === "auto"
        ? source.yLegendTarget
        : "auto",
    yUnit: String(source?.yUnit ?? "A") || "A",
    stopOnError: Boolean(source?.stopOnError),
    fileNameMatchCaseSensitive: Boolean(source?.fileNameMatchCaseSensitive),
    bottomTitle: String(source?.bottomTitle ?? ""),
    leftTitle: String(source?.leftTitle ?? ""),
    legendPrefix: String(source?.legendPrefix ?? ""),
    fileNameVgKeywords: String(source?.fileNameVgKeywords ?? ""),
    fileNameVdKeywords: String(source?.fileNameVdKeywords ?? ""),
    yColumns: Array.isArray(source?.yColumns)
      ? source.yColumns
          .map((entry) => Number(entry))
          .filter((entry) => Number.isInteger(entry) && entry >= 0)
      : [],
  });
};

export const toTemplateNameKey = (name: unknown): string =>
  String(name ?? "")
    .trim()
    .toLowerCase();
