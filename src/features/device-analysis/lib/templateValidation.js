const CELL_REF_RE = /^([A-Z]+)([1-9][0-9]*)$/;

export const Y_COLUMNS_REQUIRED_MESSAGE =
  "Y Data must be selected from the columns in the preview header.";

export function isA1CellRef(value) {
  return CELL_REF_RE.test(String(value || "").trim().toUpperCase());
}

export function normalizeVarKeyword(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";

  const upper = trimmed.toUpperCase();
  if (CELL_REF_RE.test(upper)) return upper;
  return trimmed;
}

export function splitKeywordList(raw) {
  return String(raw ?? "")
    .split(/[,;\n]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function normalizeKeywordList(raw) {
  return splitKeywordList(raw).join(", ");
}

export function validateVarPair(bottomTitleRaw, legendPrefixRaw, t) {
  const vg = normalizeVarKeyword(bottomTitleRaw);
  const vd = normalizeVarKeyword(legendPrefixRaw);

  const vgMode = vg ? (isA1CellRef(vg) ? "cell" : "text") : "empty";
  const vdMode = vd ? (isA1CellRef(vd) ? "cell" : "text") : "empty";

  if (vgMode === "empty" && vdMode === "empty") {
    return { ok: true, mode: "empty", vg, vd, message: "" };
  }

  if (vgMode === "empty" || vdMode === "empty") {
    return {
      ok: false,
      mode: "invalid",
      vg,
      vd,
      message:
        typeof t === "function"
          ? t("da_varPairBothOrNeither")
          : "Var1 and Var2 must both be empty or both filled.",
    };
  }

  if (vgMode !== vdMode) {
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

  return { ok: true, mode: vgMode, vg, vd, message: "" };
}

export function validateCurveTaggingMode(config, t) {
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

  if (hasFileNameRules) {
    if (!fileNameVgKeywords || !fileNameVdKeywords) {
      return {
        ok: false,
        message:
          typeof t === "function"
            ? t("da_curveTaggingFileNameBothRequired")
            : "When using file-name tagging, please provide keywords for both Vg and Vd.",
      };
    }
  }

  return {
    ok: true,
    varPair,
    fileNameVgKeywords,
    fileNameVdKeywords,
    mode: hasFileNameRules ? "filename" : hasVarRules ? "var" : "auto",
  };
}

export function validateTemplateForSave(config, t) {
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
      fileNameVgKeywords: curveTagging.fileNameVgKeywords,
      fileNameVdKeywords: curveTagging.fileNameVdKeywords,
      // Back-compat with older backend/template field names.
      vgKeyword: varPair.vg,
      vdKeyword: varPair.vd,
    },
  };
}

export function validateTemplateForApply(config, t) {
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
      fileNameVgKeywords: curveTagging.fileNameVgKeywords,
      fileNameVdKeywords: curveTagging.fileNameVdKeywords,
      // Back-compat with older backend/template field names.
      vgKeyword: varPair.vg,
      vdKeyword: varPair.vd,
    },
  };
}
