export type TemplateConfig = {
  bottomTitle: string;
  fileNameMatchCaseSensitive: boolean;
  fileNameVdKeywords: string;
  fileNameVgKeywords: string;
  leftTitle: string;
  legendPrefix: string;
  name: string;
  selectedColumns: number[];
  stopOnError: boolean;
  xDataEnd: string;
  xDataStart: string;
  xSegmentationMode: "auto" | "points" | "segments";
  xSegments: string;
  xPoints: string;
  xUnit: string;
  yCount: string;
  yDataEnd: string;
  yDataStart: string;
  yPoints: string;
  yStep: string;
  yUnit: string;
};

export const createEmptyTemplateConfig = (
  overrides: Partial<TemplateConfig> = {},
): TemplateConfig => ({
  name: "",
  xDataStart: "",
  xDataEnd: "",
  xSegmentationMode: "auto",
  xSegments: "",
  xPoints: "",
  xUnit: "V",
  yDataStart: "",
  yDataEnd: "",
  yPoints: "",
  yCount: "",
  yStep: "",
  yUnit: "A",
  stopOnError: false,
  fileNameMatchCaseSensitive: false,
  bottomTitle: "",
  leftTitle: "",
  legendPrefix: "",
  fileNameVgKeywords: "",
  fileNameVdKeywords: "",
  selectedColumns: [],
  ...overrides,
});

export const cloneTemplateConfig = (
  config: Partial<TemplateConfig>,
): TemplateConfig => ({
  ...createEmptyTemplateConfig(config),
  selectedColumns: Array.isArray(config?.selectedColumns)
    ? [...config.selectedColumns]
    : [],
});

export const normalizeXDataEndValue = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.toLowerCase() === "end") return "End";
  return raw;
};

export const toTemplateNameKey = (name: unknown): string =>
  String(name ?? "")
    .trim()
    .toLowerCase();

