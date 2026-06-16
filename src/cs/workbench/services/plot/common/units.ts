/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Defines supported plot units and resolves axis unit labels from raw metadata.
export const CURRENT_Y_UNIT_VALUES = [
  "A",
  "mA",
  "uA",
  "nA",
  "pA",
] as const;

export const CAPACITANCE_Y_UNIT_VALUES = [
  "F",
  "mF",
  "uF",
  "nF",
  "pF",
] as const;

export const Y_UNIT_VALUES = [
  ...CURRENT_Y_UNIT_VALUES,
  ...CAPACITANCE_Y_UNIT_VALUES,
] as const;

export const X_UNIT_VALUES = ["V", "mV"] as const;

export type YUnit =
  (typeof Y_UNIT_VALUES)[number];
export type CurrentYUnit =
  (typeof CURRENT_Y_UNIT_VALUES)[number];
export type CapacitanceYUnit =
  (typeof CAPACITANCE_Y_UNIT_VALUES)[number];
export type XUnit =
  (typeof X_UNIT_VALUES)[number];

export const isCurrentYUnit = (
  value: unknown,
): value is (typeof CURRENT_Y_UNIT_VALUES)[number] =>
  CURRENT_Y_UNIT_VALUES.includes(value as never);

export const isCapacitanceYUnit = (
  value: unknown,
): value is (typeof CAPACITANCE_Y_UNIT_VALUES)[number] =>
  CAPACITANCE_Y_UNIT_VALUES.includes(value as never);

export const getYUnitValuesForFamily = (
  value: unknown,
): readonly YUnit[] =>
  isCapacitanceYUnit(value)
    ? CAPACITANCE_Y_UNIT_VALUES
    : CURRENT_Y_UNIT_VALUES;

const Y_UNIT_ALIAS_MAP: Record<string, YUnit> = {
  a: "A",
  ma: "mA",
  "ua": "uA",
  "µa": "uA",
  "μa": "uA",
  na: "nA",
  pa: "pA",
  f: "F",
  mf: "mF",
  uf: "uF",
  nf: "nF",
  pf: "pF",
};

const X_UNIT_ALIAS_MAP: Record<string, XUnit> = {
  v: "V",
  mv: "mV",
};

export const normalizeYUnit = (
  value: unknown,
  fallback = "",
): YUnit | "" => {
  const raw = String(value ?? "").trim();
  const normalizeFallback = (): YUnit | "" => {
    if (fallback === "") return "";
    const fallbackRaw = String(fallback).trim().toLowerCase();
    return Y_UNIT_ALIAS_MAP[fallbackRaw] ?? "";
  };
  if (!raw) return normalizeFallback();

  const normalized =
    Y_UNIT_ALIAS_MAP[raw.toLowerCase()] ?? null;
  if (normalized) return normalized;

  return normalizeFallback();
};

export const normalizeYUnitForFamily = (
  value: unknown,
  familyUnit: unknown,
): YUnit | "" => {
  const normalized = normalizeYUnit(value);
  if (!normalized) return "";

  const familyValues = getYUnitValuesForFamily(familyUnit);
  return familyValues.includes(normalized) ? normalized : "";
};

export const getYUnitMeta = (value: unknown) => {
  const normalized = normalizeYUnit(value, "A");
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
  if (normalized === "mF") {
    return { value: "mF" as const, label: "mF", factor: 1e3 };
  }
  if (normalized === "uF") {
    return { value: "uF" as const, label: "uF", factor: 1e6 };
  }
  if (normalized === "nF") {
    return { value: "nF" as const, label: "nF", factor: 1e9 };
  }
  if (normalized === "pF") {
    return { value: "pF" as const, label: "pF", factor: 1e12 };
  }
  if (normalized === "F") {
    return { value: "F" as const, label: "F", factor: 1 };
  }
  return { value: "A" as const, label: "A", factor: 1 };
};

export const normalizeXUnit = (
  value: unknown,
  fallback = "",
): XUnit | "" => {
  const raw = String(value ?? "").trim();
  const normalizeFallback = (): XUnit | "" => {
    if (fallback === "") return "";
    const fallbackRaw = String(fallback).trim().toLowerCase();
    return X_UNIT_ALIAS_MAP[fallbackRaw] ?? "";
  };
  if (!raw) return normalizeFallback();

  const normalized =
    X_UNIT_ALIAS_MAP[raw.toLowerCase()] ?? null;
  if (normalized) return normalized;

  return normalizeFallback();
};

export const getXUnitMeta = (value: unknown) => {
  const normalized = normalizeXUnit(value, "V");
  if (normalized === "mV") {
    return { value: "mV" as const, label: "mV", factor: 1e3 };
  }
  return { value: "V" as const, label: "V", factor: 1 };
};
