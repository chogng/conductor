export const createEmptyTemplateConfig = (overrides = {}) => ({
  name: "",
  xDataStart: "",
  xDataEnd: "",
  xPoints: "",
  yDataStart: "",
  yDataEnd: "",
  yPoints: "",
  yCount: "",
  yStep: "",
  stopOnError: false,
  bottomTitle: "",
  leftTitle: "",
  legendPrefix: "",
  fileNameVgKeywords: "",
  fileNameVdKeywords: "",
  selectedColumns: [],
  ...overrides,
});

export const cloneTemplateConfig = (config) => ({
  ...createEmptyTemplateConfig(config),
  selectedColumns: Array.isArray(config?.selectedColumns)
    ? [...config.selectedColumns]
    : [],
});

export const normalizeXDataEndValue = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.toLowerCase() === "end" || raw === "结束") return "End";
  return raw;
};

export const toTemplateNameKey = (name) =>
  String(name ?? "")
    .trim()
    .toLowerCase();
