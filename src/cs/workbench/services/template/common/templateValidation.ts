/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import type { TemplateApplyConfig } from "./templateApplyConfigUtils";
import { normalizeYUnit } from "src/cs/workbench/services/plot/common/units";
import { isCellLabel, parseCellLabel } from "./templateCellRef.ts";
import {
  normalizeColumnIndexes,
  resolveTemplateXYBinding,
} from "src/cs/workbench/services/template/common/templateXYBinding";
import {
  getTemplateXRangeColumns,
  getTemplateXRangeLegacyFields,
  haveTemplateXRangesSameRows,
  normalizeTemplateXRanges,
  type TemplateXRange,
} from "src/cs/workbench/services/template/common/templateXRange";

export const Y_COLUMNS_REQUIRED_MESSAGE =
  "Y Data must be selected from the columns in the preview header.";

type ValidationConfig = Partial<TemplateApplyConfig>;

type NormalizedTemplateForSave<T extends ValidationConfig> = T & {
  bottomTitle: string;
  legendPrefix: string;
  xColumns: number[];
  xRanges: TemplateXRange[];
  yColumns: number[];
  xUnit: string;
  yUnit: string;
};

type NormalizedTemplateForApply<T extends ValidationConfig> = T & {
  bottomTitle: string;
  leftTitle: string;
  legendPrefix: string;
  xColumns: number[];
  xRanges: TemplateXRange[];
  yColumns: number[];
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
      message: localize("template.validation.varPairCellOrText", "Var1 and Var2 must both be cell refs (e.g. A1) or both be text (e.g. Vg). Do not mix."),
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
  const xRanges = normalizeXRangesForValidation(config);
  const xColumns = normalizeXColumnsForValidation(config, xRanges);
  const yColumns = normalizeColumnIndexes(config?.yColumns);
  const xRangeRowsValidation = validateXRangeRows(xRanges);
  if (!xRangeRowsValidation.ok) {
    return xRangeRowsValidation;
  }

  if (yColumns.length === 0) {
    return {
      ok: false,
      message: localize("template.validation.yColumnsRequired", "Please select Y data from the preview header columns."),
    };
  }

  const xyBinding = resolveTemplateXYBinding({
    x: { columns: xColumns },
    y: { columns: yColumns },
  });
  if (!xyBinding.ok) {
    return {
      ok: false,
      message: getXYBindingValidationMessage(xyBinding),
    };
  }

  const varPair = validateVarPair(config?.bottomTitle, config?.legendPrefix);
  if (!varPair.ok) return { ok: false, message: varPair.message };

  return {
    ok: true,
    normalized: {
      ...config,
      xColumns,
      xRanges,
      ...getTemplateXRangeLegacyFields(xRanges),
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
  const xRanges = normalizeXRangesForValidation(config);
  const xColumns = normalizeXColumnsForValidation(config, xRanges);
  const yColumns = normalizeColumnIndexes(config?.yColumns);
  const xRangeRowsValidation = validateXRangeRows(xRanges);
  if (!xRangeRowsValidation.ok) {
    return xRangeRowsValidation;
  }
  if (yColumns.length > 0) {
    const xyBinding = resolveTemplateXYBinding({
      x: { columns: xColumns },
      y: { columns: yColumns },
    });
    if (!xyBinding.ok) {
      return {
        ok: false,
        message: getXYBindingValidationMessage(xyBinding),
      };
    }
  }

  const varPair = validateVarPair(config?.bottomTitle, config?.legendPrefix);
  if (!varPair.ok) return { ok: false, message: varPair.message };

  return {
    ok: true,
    normalized: {
      ...config,
      bottomTitle: varPair.vg,
      leftTitle: config?.leftTitle ?? "",
      legendPrefix: varPair.vd,
      xColumns,
      xRanges,
      ...getTemplateXRangeLegacyFields(xRanges),
      yColumns,
      xUnit: normalizeAxisUnit(config?.xUnit),
      yUnit: normalizeYUnit(config?.yUnit, "A"),
    },
  };
}

function getXYBindingValidationMessage(result: Exclude<ReturnType<typeof resolveTemplateXYBinding>, { ok: true }>): string {
  if (result.code === "pairedCountMismatch") {
    return localize(
      "template.validation.xyColumnCountMismatch",
      "X column count {xCount} does not match Y column count {yCount}.",
      { xCount: result.xCount, yCount: result.yCount },
    );
  }

  if (result.code === "missingXColumns") {
    return localize("template.validation.xColumnsRequired", "Please select at least one X column.");
  }

  return localize("template.validation.yColumnsRequired", "Please select Y data from the preview header columns.");
}

function normalizeXColumnsForValidation(
  config: ValidationConfig,
  xRanges: readonly TemplateXRange[],
): number[] {
  const xColumnsFromRanges = getTemplateXRangeColumns(xRanges);
  if (xColumnsFromRanges.length) {
    return xColumnsFromRanges;
  }

  const xColumns = normalizeColumnIndexes(config?.xColumns);
  if (xColumns.length) {
    return xColumns;
  }

  const xStart = parseCellLabel(config?.xDataStart);
  return xStart ? [xStart.colIndex] : [];
}

function normalizeXRangesForValidation(config: ValidationConfig): TemplateXRange[] {
  return normalizeTemplateXRanges(
    config?.xRanges,
    config?.xDataStart,
    config?.xDataEnd,
    config?.xColumns,
  );
}

function validateXRangeRows(xRanges: readonly TemplateXRange[]): {
  readonly ok: true;
} | {
  readonly ok: false;
  readonly message: string;
} {
  if (xRanges.length <= 1 || haveTemplateXRangesSameRows(xRanges)) {
    return { ok: true };
  }

  return {
    ok: false,
    message: localize("template.validation.xRangesSameRows", "X ranges must use the same row range."),
  };
}
