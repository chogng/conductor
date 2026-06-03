import { localize } from "src/cs/nls";
import type { TemplateConfig } from "./templateManagerUtils";
import { normalizeYUnit } from "src/cs/workbench/contrib/plot/common/units";
import {
  joinFileNameMatchInput,
  splitFileNameMatchInput,
} from "src/cs/workbench/contrib/template/common/fileNameMatching";

const CELL_REF_RE = /^([A-Z]+)([1-9][0-9]*)$/;

export const Y_COLUMNS_REQUIRED_MESSAGE =
  "Y Data must be selected from the columns in the preview header.";

type ValidationConfig = Partial<TemplateConfig>;

type NormalizedTemplateForSave<T extends ValidationConfig> = T & {
  bottomTitle: string;
  fileNameVdKeywords: string;
  fileNameVgKeywords: string;
  legendPrefix: string;
  yColumns: number[];
  xUnit: string;
  yUnit: string;
};

type NormalizedTemplateForApply<T extends ValidationConfig> = T & {
  bottomTitle: string;
  fileNameVdKeywords: string;
  fileNameVgKeywords: string;
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

type CurveTaggingValidation =
  | {
      ok: false;
      message: string;
    }
  | {
      ok: true;
      varPair: VarPairValidation;
      fileNameVgKeywords: string;
      fileNameVdKeywords: string;
      mode: "filename" | "var" | "auto";
    };

export function isA1CellRef(value: unknown): boolean {
  return CELL_REF_RE.test(String(value || "").trim().toUpperCase());
}

export function normalizeVarKeyword(raw: unknown): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";

  const upper = trimmed.toUpperCase();
  if (CELL_REF_RE.test(upper)) return upper;
  return trimmed;
}

export function splitKeywordList(raw: unknown): string[] {
  return splitFileNameMatchInput(raw, true);
}

export function normalizeKeywordList(raw: unknown): string {
  return joinFileNameMatchInput(splitKeywordList(raw));
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
      message: localize("da_varPairCellOrText", "Var1 and Var2 must both be cell refs (e.g. A1) or both be text (e.g. Vg). Do not mix."),
    };
  }

  const mode = vgMode !== "empty" ? vgMode : vdMode;
  return { ok: true, mode, vg, vd, message: "" };
}

export function validateCurveTaggingMode(
  config: ValidationConfig,
): CurveTaggingValidation {
  const varPair = validateVarPair(config?.bottomTitle, config?.legendPrefix);
  if (!varPair.ok) return { ok: false, message: varPair.message };

  const fileNameVgKeywords = normalizeKeywordList(config?.fileNameVgKeywords ?? "");
  const fileNameVdKeywords = normalizeKeywordList(config?.fileNameVdKeywords ?? "");
  const hasFileNameRules = Boolean(fileNameVgKeywords) || Boolean(fileNameVdKeywords);
  if (hasFileNameRules && (!fileNameVgKeywords || !fileNameVdKeywords)) {
    return {
      ok: false,
      message: localize("da_curveTaggingFileNameBothRequired", "When using file-name tagging, please provide keywords for both Vg and Vd."),
    };
  }

  return {
    ok: true,
    varPair,
    fileNameVgKeywords,
    fileNameVdKeywords,
    mode: hasFileNameRules ? "filename" : varPair.mode !== "empty" ? "var" : "auto",
  };
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
      message: localize("da_yColumnsRequired", "Please select Y data from the preview header columns."),
    };
  }

  const curveTagging = validateCurveTaggingMode(config);
  if (!curveTagging.ok) return { ok: false, message: curveTagging.message };

  const varPair = curveTagging.varPair;

  return {
    ok: true,
    normalized: {
      ...config,
      yColumns,
      bottomTitle: varPair.vg,
      legendPrefix: varPair.vd,
      xUnit: normalizeAxisUnit(config?.xUnit),
      yUnit: normalizeYUnit(config?.yUnit, "A"),
      fileNameVgKeywords: curveTagging.fileNameVgKeywords,
      fileNameVdKeywords: curveTagging.fileNameVdKeywords,
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
  const curveTagging = validateCurveTaggingMode(config);
  if (!curveTagging.ok) return { ok: false, message: curveTagging.message };

  const varPair = curveTagging.varPair;

  return {
    ok: true,
    normalized: {
      ...config,
      bottomTitle: varPair.vg,
      leftTitle: config?.leftTitle ?? "",
      legendPrefix: varPair.vd,
      xUnit: normalizeAxisUnit(config?.xUnit),
      yUnit: normalizeYUnit(config?.yUnit, "A"),
      fileNameVgKeywords: curveTagging.fileNameVgKeywords,
      fileNameVdKeywords: curveTagging.fileNameVdKeywords,
    },
  };
}
