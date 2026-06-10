/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import type { TemplateConfig } from "./templateConfigUtils";
import { normalizeYUnit } from "src/cs/workbench/services/plot/common/units";
import { isCellLabel } from "./templateCellRef.ts";

export const Y_COLUMNS_REQUIRED_MESSAGE =
  "Y Data must be selected from the columns in the preview header.";

type ValidationConfig = Partial<TemplateConfig>;

type NormalizedTemplateForSave<T extends ValidationConfig> = T & {
  bottomTitle: string;
  legendPrefix: string;
  yColumns: number[];
  xUnit: string;
  yUnit: string;
};

type NormalizedTemplateForApply<T extends ValidationConfig> = T & {
  bottomTitle: string;
  leftTitle: string;
  legendPrefix: string;
  xUnit: string;
  yUnit: string;
};

type VarMode = "cell" | "text" | "empty" | "invalid";

type VarPairValidation = {
  ok: boolean;
  mode: VarMode;
  vg: string;
  vd: string;
  message: string;
};

export function isA1CellRef(value: unknown): boolean {
  return isCellLabel(value);
}

export function normalizeVarKeyword(raw: unknown): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";

  const upper = trimmed.toUpperCase();
  if (isCellLabel(upper)) return upper;
  return trimmed;
}

export function normalizeAxisUnit(raw: unknown): string {
  return String(raw ?? "").trim();
}

export function validateVarPair(
  bottomTitleRaw: unknown,
  legendPrefixRaw: unknown,
): VarPairValidation {
  const vg = normalizeVarKeyword(bottomTitleRaw);
  const vd = normalizeVarKeyword(legendPrefixRaw);

  const vgMode: VarMode = vg ? (isA1CellRef(vg) ? "cell" : "text") : "empty";
  const vdMode: VarMode = vd ? (isA1CellRef(vd) ? "cell" : "text") : "empty";

  if (vgMode === "empty" && vdMode === "empty") {
    return { ok: true, mode: "empty", vg, vd, message: "" };
  }

  if (vgMode !== "empty" && vdMode !== "empty" && vgMode !== vdMode) {
    return {
      ok: false,
      mode: "invalid",
      vg,
      vd,
      message: localize("varPairCellOrText", "Var1 and Var2 must both be cell refs (e.g. A1) or both be text (e.g. Vg). Do not mix."),
    };
  }

  const mode = vgMode !== "empty" ? vgMode : vdMode;
  return { ok: true, mode, vg, vd, message: "" };
}

export function validateTemplateForSave<T extends ValidationConfig>(
  config: T,
): {
  ok: boolean;
  message?: string;
  normalized?: NormalizedTemplateForSave<T>;
} {
  const yColumns = Array.isArray(config?.yColumns)
    ? config.yColumns
    : [];

  if (yColumns.length === 0) {
    return {
      ok: false,
      message: localize("yColumnsRequired", "Please select Y data from the preview header columns."),
    };
  }

  const varPair = validateVarPair(config?.bottomTitle, config?.legendPrefix);
  if (!varPair.ok) return { ok: false, message: varPair.message };

  return {
    ok: true,
    normalized: {
      ...config,
      yColumns,
      bottomTitle: varPair.vg,
      legendPrefix: varPair.vd,
      xUnit: normalizeAxisUnit(config?.xUnit),
      yUnit: normalizeYUnit(config?.yUnit, "A"),
    },
  };
}

export function validateTemplateForApply<T extends ValidationConfig>(
  config: T,
): {
  ok: boolean;
  message?: string;
  normalized?: NormalizedTemplateForApply<T>;
} {
  const varPair = validateVarPair(config?.bottomTitle, config?.legendPrefix);
  if (!varPair.ok) return { ok: false, message: varPair.message };

  return {
    ok: true,
    normalized: {
      ...config,
      bottomTitle: varPair.vg,
      leftTitle: config?.leftTitle ?? "",
      legendPrefix: varPair.vd,
      xUnit: normalizeAxisUnit(config?.xUnit),
      yUnit: normalizeYUnit(config?.yUnit, "A"),
    },
  };
}
