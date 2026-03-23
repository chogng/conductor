import type { TemplateConfig } from "./templateManagerUtils";
import type { LooseTranslateFn as TranslateFn } from "../../shared/lib/translateTypes";
import { normalizeDeviceAnalysisYUnit } from "../../analysis/lib/deviceAnalysisUnits";

const CELL_REF_RE = /^([A-Z]+)([1-9][0-9]*)$/;

export const Y_COLUMNS_REQUIRED_MESSAGE =
  "Y Data must be selected from the columns in the preview header.";

type ValidationConfig = Partial<TemplateConfig> &
  Partial<{
    vgKeyword: string;
    vdKeyword: string;
    vgFileKeywords: string;
    vdFileKeywords: string;
  }>;

type NormalizedTemplateForSave<T extends ValidationConfig> = T & {
  bottomTitle: string;
  fileNameVdKeywords: string;
  fileNameVgKeywords: string;
  legendPrefix: string;
  selectedColumns: number[];
  vdKeyword: string;
  vgKeyword: string;
  xUnit: string;
  yUnit: string;
};

type NormalizedTemplateForApply<T extends ValidationConfig> = T & {
  bottomTitle: string;
  fileNameVdKeywords: string;
  fileNameVgKeywords: string;
  leftTitle: string;
  legendPrefix: string;
  vdKeyword: string;
  vgKeyword: string;
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
  return String(raw ?? "")
    .split(/[,;\n]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function normalizeKeywordList(raw: unknown): string {
  return splitKeywordList(raw).join(", ");
}

export function normalizeAxisUnit(raw: unknown): string {
  return String(raw ?? "").trim();
}

export function validateVarPair(
  bottomTitleRaw: unknown,
  legendPrefixRaw: unknown,
  t?: TranslateFn,
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
      message:
        typeof t === "function"
          ? t("da_varPairCellOrText")
          : "Var1 and Var2 must both be cell refs (e.g. A1) or both be text (e.g. Vg). Do not mix.",
    };
  }

  const mode = vgMode !== "empty" ? vgMode : vdMode;
  return { ok: true, mode, vg, vd, message: "" };
}

export function validateCurveTaggingMode(
  config: ValidationConfig,
  t?: TranslateFn,
): CurveTaggingValidation {
  const varPair = validateVarPair(
    config?.bottomTitle ?? config?.vgKeyword,
    config?.legendPrefix ?? config?.vdKeyword,
    t,
  );
  if (!varPair.ok) return { ok: false, message: varPair.message };

  const fileNameVgKeywords = normalizeKeywordList(
    config?.fileNameVgKeywords ?? config?.vgFileKeywords ?? "",
  );
  const fileNameVdKeywords = normalizeKeywordList(
    config?.fileNameVdKeywords ?? config?.vdFileKeywords ?? "",
  );
  const hasFileNameRules = Boolean(fileNameVgKeywords) || Boolean(fileNameVdKeywords);
  const hasVarRules = varPair.mode !== "empty";

  if (hasFileNameRules && hasVarRules) {
    return {
      ok: false,
      message:
        typeof t === "function"
          ? t("da_curveTaggingModeExclusive")
          : "Curve tagging must use either Var1/Var2 or file-name keywords, not both.",
    };
  }

  if (hasFileNameRules && (!fileNameVgKeywords || !fileNameVdKeywords)) {
    return {
      ok: false,
      message:
        typeof t === "function"
          ? t("da_curveTaggingFileNameBothRequired")
          : "When using file-name tagging, please provide keywords for both Vg and Vd.",
    };
  }

  return {
    ok: true,
    varPair,
    fileNameVgKeywords,
    fileNameVdKeywords,
    mode: hasFileNameRules ? "filename" : hasVarRules ? "var" : "auto",
  };
}

export function validateTemplateForSave<T extends ValidationConfig>(
  config: T,
  t?: TranslateFn,
): {
  ok: boolean;
  message?: string;
  normalized?: NormalizedTemplateForSave<T>;
} {
  const selectedColumns = Array.isArray(config?.selectedColumns)
    ? config.selectedColumns
    : [];

  if (selectedColumns.length === 0) {
    return {
      ok: false,
      message:
        typeof t === "function" ? t("da_yColumnsRequired") : Y_COLUMNS_REQUIRED_MESSAGE,
    };
  }

  const curveTagging = validateCurveTaggingMode(config, t);
  if (!curveTagging.ok) return { ok: false, message: curveTagging.message };

  const varPair = curveTagging.varPair;

  return {
    ok: true,
    normalized: {
      ...config,
      selectedColumns,
      bottomTitle: varPair.vg,
      legendPrefix: varPair.vd,
      xUnit: normalizeAxisUnit(config?.xUnit),
      yUnit: normalizeDeviceAnalysisYUnit(config?.yUnit, "A"),
      fileNameVgKeywords: curveTagging.fileNameVgKeywords,
      fileNameVdKeywords: curveTagging.fileNameVdKeywords,
      // Back-compat with older backend/template field names.
      vgKeyword: varPair.vg,
      vdKeyword: varPair.vd,
    },
  };
}

export function validateTemplateForApply<T extends ValidationConfig>(
  config: T,
  t?: TranslateFn,
): {
  ok: boolean;
  message?: string;
  normalized?: NormalizedTemplateForApply<T>;
} {
  const curveTagging = validateCurveTaggingMode(config, t);
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
      yUnit: normalizeDeviceAnalysisYUnit(config?.yUnit, "A"),
      fileNameVgKeywords: curveTagging.fileNameVgKeywords,
      fileNameVdKeywords: curveTagging.fileNameVdKeywords,
      // Back-compat with older backend/template field names.
      vgKeyword: varPair.vg,
      vdKeyword: varPair.vd,
    },
  };
}
