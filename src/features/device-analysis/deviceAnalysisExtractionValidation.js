import { validateTemplateForApply } from "./components/templateValidation";

const CELL_REF_RE = /^([A-Z]+)(\d+)$/;

function parseCellRef(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return null;

  const match = trimmed.match(CELL_REF_RE);
  if (!match) return null;

  const colLabel = match[1];
  const rowNumber = Number(match[2]);
  if (!Number.isInteger(rowNumber) || rowNumber < 1) return null;

  let colIndex = 0;
  for (let i = 0; i < colLabel.length; i++) {
    colIndex = colIndex * 26 + (colLabel.charCodeAt(i) - 64);
  }
  colIndex -= 1;

  return { rowIndex: rowNumber - 1, colIndex };
}

function parseNumberStrict(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

export function prepareDeviceAnalysisExtraction({
  rawData,
  config,
  previewFile,
  getPreviewRow,
  t,
}) {
  const msg = (key, vars, fallback) => {
    if (typeof t !== "function") return fallback;
    return t(key, vars);
  };

  if (!rawData || rawData.length === 0) {
    return {
      ok: false,
      type: "warning",
      message: msg(
        "da_extractImportCsvFirst",
        null,
        "Please import at least one CSV file first.",
      ),
    };
  }

  const templateValidation = validateTemplateForApply(config, t);
  if (!templateValidation.ok) {
    return {
      ok: false,
      type: "warning",
      message:
        templateValidation.message ||
        msg("da_extractInvalidConfig", null, "Invalid configuration."),
    };
  }

  const normalizedConfig = templateValidation.normalized;
  const warnings = [];

  const xStart = parseCellRef(normalizedConfig?.xDataStart || "");
  if (!xStart) {
    return {
      ok: false,
      type: "warning",
      message: msg(
        "da_extractSetXStart",
        null,
        "Please set X Data start cell (e.g. A2).",
      ),
    };
  }

  const xEndRaw = String(normalizedConfig?.xDataEnd ?? "").trim();
  const useEndKeyword = !xEndRaw || xEndRaw.toLowerCase() === "end";

  if (!previewFile || !Number.isFinite(previewFile.rowCount)) {
    return {
      ok: false,
      type: "warning",
      message: msg(
        "da_extractPreviewLoading",
        null,
        "Preview is still loading. Please wait a moment and try again.",
      ),
    };
  }

  const previewRowCount = Math.max(0, Math.floor(previewFile.rowCount));

  const xEnd = useEndKeyword ? null : parseCellRef(xEndRaw);
  if (!useEndKeyword && !xEnd) {
    return {
      ok: false,
      type: "warning",
      message: msg(
        "da_extractSetXEndOrUseEnd",
        null,
        "Please set X Data end cell (e.g. A1408) or use 'End' to read until the last preview row.",
      ),
    };
  }

  if (!useEndKeyword && xStart.colIndex !== xEnd.colIndex) {
    return {
      ok: false,
      type: "warning",
      message: msg(
        "da_extractXSameColumn",
        null,
        "X Data start/end must be in the same column.",
      ),
    };
  }

  const xCol = xStart.colIndex;
  const endRow = useEndKeyword ? "end" : Math.max(xStart.rowIndex, xEnd.rowIndex);
  const startRow = useEndKeyword
    ? xStart.rowIndex
    : Math.min(xStart.rowIndex, xEnd.rowIndex);

  const total = useEndKeyword
    ? Math.max(0, previewRowCount - startRow)
    : endRow - startRow + 1;
  if (total <= 0) {
    return {
      ok: false,
      type: "warning",
      message: msg("da_extractInvalidXRange", null, "Invalid X row range."),
    };
  }

  const pointsRaw = String(normalizedConfig?.xPoints ?? "").trim();

  let groupSize = null;
  let groups = null;
  let groupSizeCell = null;
  let groupSizePreview = null;

  if (pointsRaw) {
    const pointsCell = parseCellRef(pointsRaw);
    if (pointsCell) {
      groupSizeCell = pointsCell;

      // Best-effort validation using the currently previewed file (may vary per file).
      const previewRow = typeof getPreviewRow === "function"
        ? getPreviewRow(pointsCell.rowIndex)
        : null;
      if (previewRow) {
        const raw = previewRow?.[pointsCell.colIndex];
        const parsed = parseNumberStrict(raw);
        const asInt = parsed !== null && Number.isInteger(parsed) ? parsed : null;

        if (asInt === null || asInt <= 0) {
          return {
            ok: false,
            type: "warning",
            message: msg(
              "da_extractPointsCellPositiveInt",
              { cell: String(pointsRaw).toUpperCase() },
              `Points cell ${String(pointsRaw).toUpperCase()} must contain a positive integer.`,
            ),
          };
        }
        if (asInt > total) {
          return {
            ok: false,
            type: "warning",
            message: msg(
              "da_extractPointsCellTooLarge",
              { cell: String(pointsRaw).toUpperCase(), points: asInt, total },
              `Points from ${String(pointsRaw).toUpperCase()} (${asInt}) cannot be larger than the X range length (${total}).`,
            ),
          };
        }
        if (total % asInt !== 0) {
          return {
            ok: false,
            type: "warning",
            message: msg(
              "da_extractXNotDivisibleByPointsFromCell",
              {
                total,
                points: asInt,
                cell: String(pointsRaw).toUpperCase(),
              },
              `X range has ${total} points, which is not divisible by points=${asInt} (from ${String(pointsRaw).toUpperCase()}).`,
            ),
          };
        }
        groupSizePreview = asInt;
      }
    } else {
      const points = Number(pointsRaw);
      if (!Number.isInteger(points) || points <= 0) {
        return {
          ok: false,
          type: "warning",
          message: msg(
            "da_extractXPointsPositiveIntOrCell",
            null,
            "X Points must be a positive integer (or a cell like B2).",
          ),
        };
      }
      if (points > total) {
        return {
          ok: false,
          type: "warning",
          message: msg(
            "da_extractXPointsTooLarge",
            { points, total },
            `X Points (${points}) cannot be larger than the X range length (${total}).`,
          ),
        };
      }
      groupSize = points;
    }
  }

  if (!groupSizeCell) {
    groupSize = groupSize ?? total;
    if (total % groupSize !== 0) {
      return {
        ok: false,
        type: "warning",
        message: msg(
          "da_extractXNotDivisibleByPoints",
          { total, points: groupSize },
          `X range has ${total} points, which is not divisible by points=${groupSize}.`,
        ),
      };
    }
    groups = total / groupSize;
  }

  const yColsFromToggle = Array.isArray(normalizedConfig?.selectedColumns)
    ? normalizedConfig.selectedColumns
    : [];
  let yCols = yColsFromToggle;

  if (yCols.length === 0 && (normalizedConfig?.yDataStart || normalizedConfig?.yDataEnd)) {
    const yStart = parseCellRef(normalizedConfig?.yDataStart || "");
    const yEnd = parseCellRef(normalizedConfig?.yDataEnd || "");
    if (!yStart || !yEnd) {
      return {
        ok: false,
        type: "warning",
        message: msg(
          "da_extractYStartEndValidCells",
          null,
          "Y Data start/end must be valid cells (e.g. B2 and D2).",
        ),
      };
    }
    const yStartCol = Math.min(yStart.colIndex, yEnd.colIndex);
    const yEndCol = Math.max(yStart.colIndex, yEnd.colIndex);
    yCols = Array.from({ length: yEndCol - yStartCol + 1 }, (_, i) => yStartCol + i);
  }

  const uniqueYCols = Array.from(new Set(yCols)).sort((a, b) => a - b);

  if (uniqueYCols.length === 0) {
    return {
      ok: false,
      type: "warning",
      message: msg(
        "da_extractSelectYColumn",
        null,
        "Please select at least one Y column (click column headers in the preview).",
      ),
    };
  }
  if (uniqueYCols.includes(xCol)) {
    return {
      ok: false,
      type: "warning",
      message: msg(
        "da_extractYCannotIncludeX",
        null,
        "Y columns cannot include the X column.",
      ),
    };
  }

  const extractionConfig = {
    xCol,
    startRow,
    endRow,
    yCols: uniqueYCols,
    autoDetectCurveType: Boolean(normalizedConfig?.autoDetectCurveType),
    bottomTitle: normalizedConfig?.bottomTitle ?? "",
    legendPrefix: normalizedConfig?.legendPrefix ?? "",
    leftTitle: normalizedConfig?.leftTitle ?? "",
    fileNameVgKeywords: normalizedConfig?.fileNameVgKeywords ?? "",
    fileNameVdKeywords: normalizedConfig?.fileNameVdKeywords ?? "",
  };

  // Optional: use Y Data start/count/step for plot legend labels.
  const yLegendStartRaw = String(normalizedConfig?.yDataStart ?? "").trim();
  const yLegendCountRaw = String(normalizedConfig?.yCount ?? "").trim();
  const yLegendStepRaw = String(normalizedConfig?.yStep ?? "").trim();

  if (yLegendStartRaw && (yLegendCountRaw || yLegendStepRaw)) {
    const yLegendStartCell = parseCellRef(yLegendStartRaw);

    if (yLegendStartCell) {
      extractionConfig.yLegendStartCell = yLegendStartCell;
    } else {
      extractionConfig.yLegendStartValue = yLegendStartRaw;
    }

    const parsePositiveIntOrCell = (raw, warningKey, warningFallback) => {
      if (!raw) return null;
      const asCell = parseCellRef(raw);
      if (asCell) return { type: "cell", value: asCell };

      const asNumber = Number(raw);
      if (!Number.isInteger(asNumber) || asNumber <= 0) {
        warnings.push(msg(warningKey, null, warningFallback));
        return null;
      }
      return { type: "number", value: asNumber };
    };

    const parsePositiveNumberOrCell = (raw, warningKey, warningFallback) => {
      if (!raw) return null;
      const asCell = parseCellRef(raw);
      if (asCell) return { type: "cell", value: asCell };

      const asNumber = Number(raw);
      if (!Number.isFinite(asNumber) || asNumber <= 0) {
        warnings.push(msg(warningKey, null, warningFallback));
        return null;
      }
      return { type: "number", value: asNumber };
    };

    const countParsed = parsePositiveIntOrCell(
      yLegendCountRaw,
      "da_extractYCountPositiveIntOrCell",
      "Y Data Count must be a positive integer (or a cell like B2).",
    );
    if (countParsed?.type === "cell") {
      extractionConfig.yLegendCountCell = countParsed.value;
    } else if (countParsed?.type === "number") {
      extractionConfig.yLegendCount = countParsed.value;
    }

    const stepParsed = parsePositiveNumberOrCell(
      yLegendStepRaw,
      "da_extractYStepPositiveNumberOrCell",
      "Y Data Step must be a positive number (or a cell like B2).",
    );
    if (stepParsed?.type === "cell") {
      extractionConfig.yLegendStepCell = stepParsed.value;
    } else if (stepParsed?.type === "number") {
      extractionConfig.yLegendStep = stepParsed.value;
    }

    // Best-effort validation using the currently previewed file (may vary per file).
    if (extractionConfig.yLegendCountCell) {
      const previewRow = typeof getPreviewRow === "function"
        ? getPreviewRow(extractionConfig.yLegendCountCell.rowIndex)
        : null;
      if (previewRow) {
        const raw = previewRow?.[extractionConfig.yLegendCountCell.colIndex];
        const parsed = parseNumberStrict(raw);
        const asInt = parsed !== null && Number.isInteger(parsed) ? parsed : null;
        if (asInt === null || asInt <= 0) {
          warnings.push(
            msg(
              "da_extractYCountCellPositiveInt",
              { cell: yLegendCountRaw.toUpperCase() },
              `Y Data Count cell ${yLegendCountRaw.toUpperCase()} must contain a positive integer.`,
            ),
          );
        }
      }
    }

    if (extractionConfig.yLegendStepCell) {
      const previewRow = typeof getPreviewRow === "function"
        ? getPreviewRow(extractionConfig.yLegendStepCell.rowIndex)
        : null;
      if (previewRow) {
        const raw = previewRow?.[extractionConfig.yLegendStepCell.colIndex];
        const parsed = parseNumberStrict(raw);
        if (parsed === null || parsed <= 0) {
          warnings.push(
            msg(
              "da_extractYStepCellPositiveNumber",
              { cell: yLegendStepRaw.toUpperCase() },
              `Y Data Step cell ${yLegendStepRaw.toUpperCase()} must contain a positive number.`,
            ),
          );
        }
      }
    }
  }

  if (groupSizeCell) {
    extractionConfig.groupSizeCell = groupSizeCell;
  } else {
    extractionConfig.groupSize = groupSize;
    extractionConfig.groups = groups;
  }

  return {
    ok: true,
    type: "success",
    warnings,
    normalizedConfig,
    extractionConfig,
    meta: {
      pointsRawUpper: String(pointsRaw).toUpperCase(),
      groupSizeCell: Boolean(groupSizeCell),
      groupSize,
      groups,
      total,
      groupSizePreview,
    },
  };
}
