export const DEVICE_ANALYSIS_Y_UNIT_VALUES = [
  "A",
  "mA",
  "uA",
  "nA",
  "pA",
] as const;

export const DEVICE_ANALYSIS_X_UNIT_VALUES = ["V", "mV"] as const;

export type DeviceAnalysisYUnit =
  (typeof DEVICE_ANALYSIS_Y_UNIT_VALUES)[number];
export type DeviceAnalysisXUnit =
  (typeof DEVICE_ANALYSIS_X_UNIT_VALUES)[number];

const DEVICE_ANALYSIS_Y_UNIT_ALIAS_MAP: Record<string, DeviceAnalysisYUnit> = {
  a: "A",
  ma: "mA",
  "ua": "uA",
  "µa": "uA",
  "μa": "uA",
  na: "nA",
  pa: "pA",
};

const DEVICE_ANALYSIS_X_UNIT_ALIAS_MAP: Record<string, DeviceAnalysisXUnit> = {
  v: "V",
  mv: "mV",
};

export const normalizeDeviceAnalysisYUnit = (
  value: unknown,
  fallback = "",
): DeviceAnalysisYUnit | "" => {
  const raw = String(value ?? "").trim();
  const normalizeFallback = (): DeviceAnalysisYUnit | "" => {
    if (fallback === "") return "";
    const fallbackRaw = String(fallback).trim().toLowerCase();
    return DEVICE_ANALYSIS_Y_UNIT_ALIAS_MAP[fallbackRaw] ?? "";
  };
  if (!raw) return normalizeFallback();

  const normalized =
    DEVICE_ANALYSIS_Y_UNIT_ALIAS_MAP[raw.toLowerCase()] ?? null;
  if (normalized) return normalized;

  return normalizeFallback();
};

export const getDeviceAnalysisYUnitMeta = (value: unknown) => {
  const normalized = normalizeDeviceAnalysisYUnit(value, "A");
  if (normalized === "mA") {
    return { value: "mA" as const, label: "mA", factor: 1e3 };
  }
  if (normalized === "uA") {
    return { value: "uA" as const, label: "uA", factor: 1e6 };
  }
  if (normalized === "nA") {
    return { value: "nA" as const, label: "nA", factor: 1e9 };
  }
  if (normalized === "pA") {
    return { value: "pA" as const, label: "pA", factor: 1e12 };
  }
  return { value: "A" as const, label: "A", factor: 1 };
};

export const normalizeDeviceAnalysisXUnit = (
  value: unknown,
  fallback = "",
): DeviceAnalysisXUnit | "" => {
  const raw = String(value ?? "").trim();
  const normalizeFallback = (): DeviceAnalysisXUnit | "" => {
    if (fallback === "") return "";
    const fallbackRaw = String(fallback).trim().toLowerCase();
    return DEVICE_ANALYSIS_X_UNIT_ALIAS_MAP[fallbackRaw] ?? "";
  };
  if (!raw) return normalizeFallback();

  const normalized =
    DEVICE_ANALYSIS_X_UNIT_ALIAS_MAP[raw.toLowerCase()] ?? null;
  if (normalized) return normalized;

  return normalizeFallback();
};

export const getDeviceAnalysisXUnitMeta = (value: unknown) => {
  const normalized = normalizeDeviceAnalysisXUnit(value, "V");
  if (normalized === "mV") {
    return { value: "mV" as const, label: "mV", factor: 1e3 };
  }
  return { value: "V" as const, label: "V", factor: 1 };
};
