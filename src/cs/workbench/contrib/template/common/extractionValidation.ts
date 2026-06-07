import { localize, type NLSVars } from "src/cs/nls";
import { parseCellLabel } from "src/cs/workbench/contrib/template/common/templateCellRef";
import { validateTemplateForApply } from "src/cs/workbench/contrib/template/common/templateValidation";
import {
  inferXSegmentationSuggestionFromPreview,
  resolveXSegmentationMode,
} from "src/cs/workbench/contrib/template/common/xSegmentation";

type CellRef = {
  rowIndex: number;
  colIndex: number;
};

type TemplateConfigLike = Partial<{
  xDataStart: string;
  xDataEnd: string;
  xSegmentationMode: "auto" | "points" | "segments";
  xSegmentCount: string;
  xPointsPerGroup: string;
  xUnit: string;
  yLegendStart: string;
  yLegendCount: string;
  yLegendStep: string;
  yLegendTarget: "auto" | "yColumn" | "group";
  yUnit: string;
  yColumns: number[];
  autoDetectCurveType: boolean;
  bottomTitle: string;
  legendPrefix: string;
  leftTitle: string;
  fileNameFieldSeparators: string;
}>;

type ExtractionConfig = {
  xCol: number;
  startRow: number;
  endRow: number | "end";
  xSegmentationMode?: "auto" | "points" | "segments";
  yCols: number[];
  autoDetectCurveType: boolean;
  bottomTitle: string;
  legendPrefix: string;
  leftTitle: string;
  xUnit: string;
  yUnit: string;
  fileNameFieldSeparators?: string;
  yLegendStartCell?: CellRef;
  yLegendStartValue?: string;
  yLegendCountCell?: CellRef;
  yLegendCount?: number;
  yLegendStepCell?: CellRef;
  yLegendStep?: number;
  yLegendTarget?: "auto" | "yColumn" | "group";
  groupSizeCell?: CellRef;
  segmentCountCell?: CellRef;
  groupSize?: number | null;
  groups?: number | null;
  segmentCount?: number | null;
};

type ExtractionMeta = {
  pointsRawUpper: string;
  segmentsRawUpper: string;
  groupSizeCell: boolean;
  segmentCountCell: boolean;
  groupSize: number | null;
  groups: number | null;
  segmentCount: number | null;
  total: number | null;
  groupSizePreview: number | null;
  segmentCountPreview: number | null;
};

type PrepareExtractionResult =
  | {
      ok: false;
      type: "warning";
      message: string;
    }
  | {
      ok: true;
      type: "success";
      warnings: string[];
      normalizedConfig: TemplateConfigLike;
      extractionConfig: ExtractionConfig;
      meta: ExtractionMeta;
    };

const parseCellRef = (value: unknown): CellRef | null => parseCellLabel(value);

function parseNumberStrict(raw: unknown): number | null {
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

export function prepareExtraction({
  rawData,
  config,
  previewFile,
  getPreviewRow,
}: {
  rawData: unknown[];
  config: TemplateConfigLike;
  previewFile: unknown;
  getPreviewRow: ((rowIndex: number) => unknown) | undefined;
}): PrepareExtractionResult {
  const msg = (key: string, vars: NLSVars | null, fallback: string) => {
    return localize(key, fallback, vars ?? undefined);
  };

  if (!rawData || rawData.length === 0) {
    return {
      ok: false,
      type: "warning",
      message: msg(
        "extractImportCsvFirst",
        null,
        "Please import at least one CSV file first.",
      ),
    };
  }

  const templateValidation = validateTemplateForApply(config);
  if (!templateValidation.ok || !templateValidation.normalized) {
    return {
      ok: false,
      type: "warning",
      message:
        templateValidation.message ||
        msg("extractInvalidConfig", null, "Invalid configuration."),
    };
  }

  const normalizedConfig = templateValidation.normalized as TemplateConfigLike;
  const warnings: string[] = [];

  const xStart = parseCellRef(normalizedConfig?.xDataStart || "");
  if (!xStart) {
    return {
      ok: false,
      type: "warning",
      message: msg(
        "extractSetXStart",
        null,
        "Please set X Data start cell (e.g. A2).",
      ),
    };
  }

  const xEndRaw = String(normalizedConfig?.xDataEnd ?? "").trim();
  const useEndKeyword = !xEndRaw || xEndRaw.toLowerCase() === "end";

  const xEnd = useEndKeyword ? null : parseCellRef(xEndRaw);
  if (!useEndKeyword && !xEnd) {
    return {
      ok: false,
      type: "warning",
      message: msg(
        "extractSetXEndOrUseEnd",
        null,
        "Please set X Data end cell (e.g. A1408) or leave it empty to read until the last preview row.",
      ),
    };
  }

  if (!useEndKeyword && xStart.colIndex !== (xEnd as CellRef).colIndex) {
    return {
      ok: false,
      type: "warning",
      message: msg(
        "extractXSameColumn",
        null,
        "X Data start/end must be in the same column.",
      ),
    };
  }

  const xCol = xStart.colIndex;
  const endRow = useEndKeyword
    ? "end"
    : Math.max(xStart.rowIndex, (xEnd as CellRef).rowIndex);
  const startRow = useEndKeyword
    ? xStart.rowIndex
    : Math.min(xStart.rowIndex, (xEnd as CellRef).rowIndex);

  const total = useEndKeyword ? null : (endRow as number) - startRow + 1;
  if (total !== null && total <= 0) {
    return {
      ok: false,
      type: "warning",
      message: msg("extractInvalidXRange", null, "Invalid X row range."),
    };
  }

  let groupSize: number | null = null;
  let groups: number | null = null;
  let segmentCount: number | null = null;
  let groupSizeCell: CellRef | null = null;
  let segmentCountCell: CellRef | null = null;
  let groupSizePreview: number | null = null;
  let segmentCountPreview: number | null = null;
  const pointsRaw = String(normalizedConfig?.xPointsPerGroup ?? "").trim();
  const segmentsRaw = String(normalizedConfig?.xSegmentCount ?? "").trim();
  const segmentationMode = resolveXSegmentationMode(
    normalizedConfig?.xSegmentationMode,
  );
  const autoSuggestion = inferXSegmentationSuggestionFromPreview({
    xDataStart: normalizedConfig?.xDataStart,
    xDataEnd: normalizedConfig?.xDataEnd,
    previewRowCount: (previewFile as Record<string, unknown> | null)?.rowCount,
    getPreviewRow,
  });
  if (segmentationMode === "segments") {
    const segmentsCell = parseCellRef(segmentsRaw);
    const totalForValidation = total ?? autoSuggestion?.total ?? null;
    if (segmentsCell) {
      segmentCountCell = segmentsCell;
      const previewRow =
        typeof getPreviewRow === "function" ? getPreviewRow(segmentsCell.rowIndex) : null;
      if (previewRow) {
        const previewCells = Array.isArray(previewRow) ? previewRow : [];
        const raw = previewCells[segmentsCell.colIndex];
        const parsed = parseNumberStrict(raw);
        const asInt = parsed !== null && Number.isInteger(parsed) ? parsed : null;

        if (asInt === null || asInt <= 0) {
          return {
            ok: false,
            type: "warning",
            message: msg(
              "extractSegmentsCellPositiveInt",
              { cell: segmentsRaw.toUpperCase() },
              `Segments cell ${segmentsRaw.toUpperCase()} must contain a positive integer.`,
            ),
          };
        }
        if (totalForValidation !== null) {
          if (asInt > totalForValidation || totalForValidation % asInt !== 0) {
            return {
              ok: false,
              type: "warning",
              message: msg(
                "extractXNotDivisibleBySegmentsFromCell",
                {
                  total: totalForValidation,
                  segments: asInt,
                  cell: segmentsRaw.toUpperCase(),
                },
                `X range has ${totalForValidation} points, which is not divisible by segments=${asInt} (from ${segmentsRaw.toUpperCase()}).`,
              ),
            };
          }
        }
        segmentCountPreview = asInt;
      }
    } else {
      const segments = Number(segmentsRaw);
      if (!Number.isInteger(segments) || segments <= 0) {
        return {
          ok: false,
          type: "warning",
          message: msg(
            "extractXSegmentsPositiveIntOrCell",
            null,
            "Segments must be a positive integer (or a cell like B2).",
          ),
        };
      }
      segmentCount = segments;
      if (totalForValidation !== null) {
        if (segments > totalForValidation || totalForValidation % segments !== 0) {
          return {
            ok: false,
            type: "warning",
            message: msg(
              "extractXNotDivisibleBySegments",
              { total: totalForValidation, segments },
              `X range has ${totalForValidation} points, which is not divisible by segments=${segments}.`,
            ),
          };
        }
        groups = segments;
        groupSize = totalForValidation / segments;
      }
    }
  } else if (segmentationMode === "auto") {
    if (
      autoSuggestion &&
      Number.isInteger(autoSuggestion.groupSize) &&
      autoSuggestion.groupSize > 0 &&
      Number.isInteger(autoSuggestion.groups) &&
      autoSuggestion.groups > 0
    ) {
      groupSize = autoSuggestion.groupSize;
      groups = autoSuggestion.groups;
      segmentCount = autoSuggestion.groups;
    } else if (total !== null && total > 0) {
      groupSize = total;
      groups = 1;
      segmentCount = 1;
    } else {
      groupSize = null;
      groups = null;
      segmentCount = null;
    }
  } else if (pointsRaw) {
    const pointsCell = parseCellRef(pointsRaw);
    if (pointsCell) {
      groupSizeCell = pointsCell;

      // Best-effort validation using the currently previewed file (may vary per file).
      const previewRow =
        typeof getPreviewRow === "function" ? getPreviewRow(pointsCell.rowIndex) : null;
      if (previewRow) {
        const previewCells = Array.isArray(previewRow) ? previewRow : [];
        const raw = previewCells[pointsCell.colIndex];
        const parsed = parseNumberStrict(raw);
        const asInt = parsed !== null && Number.isInteger(parsed) ? parsed : null;

        if (asInt === null || asInt <= 0) {
          return {
            ok: false,
            type: "warning",
            message: msg(
              "extractPointsCellPositiveInt",
              { cell: String(pointsRaw).toUpperCase() },
              `Points cell ${String(pointsRaw).toUpperCase()} must contain a positive integer.`,
            ),
          };
        }
        if (total !== null) {
          if (asInt > total) {
            return {
              ok: false,
              type: "warning",
              message: msg(
                "extractPointsCellTooLarge",
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
                "extractXNotDivisibleByPointsFromCell",
                {
                  total,
                  points: asInt,
                  cell: String(pointsRaw).toUpperCase(),
                },
                `X range has ${total} points, which is not divisible by points=${asInt} (from ${String(pointsRaw).toUpperCase()}).`,
              ),
            };
          }
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
            "extractXPointsPositiveIntOrCell",
            null,
            "X Points must be a positive integer (or a cell like B2).",
          ),
        };
      }
      if (total !== null && points > total) {
        return {
          ok: false,
          type: "warning",
          message: msg(
            "extractXPointsTooLarge",
            { points, total },
            `X Points (${points}) cannot be larger than the X range length (${total}).`,
          ),
        };
      }
      groupSize = points;
    }
  }

  if (!groupSizeCell && !segmentCountCell) {
    if (
      Number.isInteger(segmentCount) &&
      (segmentCount as number) > 0 &&
      total !== null
    ) {
      const normalizedSegments = Number(segmentCount);
      if (total % normalizedSegments !== 0) {
        return {
          ok: false,
          type: "warning",
          message: msg(
            "extractXNotDivisibleBySegments",
            { total, segments: normalizedSegments },
            `X range has ${total} points, which is not divisible by segments=${normalizedSegments}.`,
          ),
        };
      }
      groups = normalizedSegments;
      groupSize = total / normalizedSegments;
    }

    if (total !== null) {
      groupSize = groupSize ?? total;
      if (total % groupSize !== 0) {
        return {
          ok: false,
          type: "warning",
          message: msg(
            "extractXNotDivisibleByPoints",
            { total, points: groupSize },
            `X range has ${total} points, which is not divisible by points=${groupSize}.`,
          ),
        };
      }
      groups = total / groupSize;
    } else if (
      !Number.isInteger(groupSize) ||
      (groupSize as number) <= 0
    ) {
      // End-row mode with no fixed points: resolve to single full-range group in worker.
      groupSize = null;
      groups = null;
    }
  }

  const yColsFromToggle = Array.isArray(normalizedConfig?.yColumns)
    ? normalizedConfig.yColumns
    : [];
  let yCols = yColsFromToggle;

  const uniqueYCols = Array.from(new Set(yCols)).sort((a, b) => a - b);

  if (uniqueYCols.length === 0) {
    return {
      ok: false,
      type: "warning",
      message: msg(
        "extractSelectYColumn",
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
        "extractYCannotIncludeX",
        null,
        "Y columns cannot include the X column.",
      ),
    };
  }

  const extractionConfig: ExtractionConfig = {
    xCol,
    startRow,
    endRow,
    xSegmentationMode: segmentationMode,
    yCols: uniqueYCols,
    autoDetectCurveType: Boolean(normalizedConfig?.autoDetectCurveType),
    bottomTitle: normalizedConfig?.bottomTitle ?? "",
    legendPrefix: normalizedConfig?.legendPrefix ?? "",
    leftTitle: normalizedConfig?.leftTitle ?? "",
    xUnit: String(normalizedConfig?.xUnit ?? "").trim(),
    yUnit: String(normalizedConfig?.yUnit ?? "").trim(),
    fileNameFieldSeparators:
      typeof normalizedConfig?.fileNameFieldSeparators === "string"
        ? normalizedConfig.fileNameFieldSeparators
        : undefined,
    yLegendTarget: normalizedConfig?.yLegendTarget ?? "auto",
  };

  // Optional: use Y legend start/count/step for curve legend labels.
  const yLegendStartRaw = String(normalizedConfig?.yLegendStart ?? "").trim();
  const yLegendCountRaw = String(normalizedConfig?.yLegendCount ?? "").trim();
  const yLegendStepRaw = String(normalizedConfig?.yLegendStep ?? "").trim();

  if (yLegendStartRaw && (yLegendCountRaw || yLegendStepRaw)) {
    const yLegendStartCell = parseCellRef(yLegendStartRaw);

    if (yLegendStartCell) {
      extractionConfig.yLegendStartCell = yLegendStartCell;
    } else {
      extractionConfig.yLegendStartValue = yLegendStartRaw;
    }

    const parsePositiveIntOrCell = (
      raw: string,
      warningKey: string,
      warningFallback: string,
    ): { type: "cell"; value: CellRef } | { type: "number"; value: number } | null => {
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

    const parsePositiveNumberOrCell = (
      raw: string,
      warningKey: string,
      warningFallback: string,
    ): { type: "cell"; value: CellRef } | { type: "number"; value: number } | null => {
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
      "extractYCountPositiveIntOrCell",
      "Y Data Count must be a positive integer (or a cell like B2).",
    );
    if (countParsed?.type === "cell") {
      extractionConfig.yLegendCountCell = countParsed.value;
    } else if (countParsed?.type === "number") {
      extractionConfig.yLegendCount = countParsed.value;
    }

    const stepParsed = parsePositiveNumberOrCell(
      yLegendStepRaw,
      "extractYStepPositiveNumberOrCell",
      "Y Data Step must be a positive number (or a cell like B2).",
    );
    if (stepParsed?.type === "cell") {
      extractionConfig.yLegendStepCell = stepParsed.value;
    } else if (stepParsed?.type === "number") {
      extractionConfig.yLegendStep = stepParsed.value;
    }

    // Best-effort validation using the currently previewed file (may vary per file).
    if (extractionConfig.yLegendCountCell) {
      const previewRow =
        typeof getPreviewRow === "function"
          ? getPreviewRow(extractionConfig.yLegendCountCell.rowIndex)
          : null;
      if (previewRow) {
        const previewCells = Array.isArray(previewRow) ? previewRow : [];
        const raw = previewCells[extractionConfig.yLegendCountCell.colIndex];
        const parsed = parseNumberStrict(raw);
        const asInt = parsed !== null && Number.isInteger(parsed) ? parsed : null;
        if (asInt === null || asInt <= 0) {
          warnings.push(
            msg(
              "extractYCountCellPositiveInt",
              { cell: yLegendCountRaw.toUpperCase() },
              `Y Data Count cell ${yLegendCountRaw.toUpperCase()} must contain a positive integer.`,
            ),
          );
        }
      }
    }

    if (extractionConfig.yLegendStepCell) {
      const previewRow =
        typeof getPreviewRow === "function"
          ? getPreviewRow(extractionConfig.yLegendStepCell.rowIndex)
          : null;
      if (previewRow) {
        const previewCells = Array.isArray(previewRow) ? previewRow : [];
        const raw = previewCells[extractionConfig.yLegendStepCell.colIndex];
        const parsed = parseNumberStrict(raw);
        if (parsed === null || parsed <= 0) {
          warnings.push(
            msg(
              "extractYStepCellPositiveNumber",
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
  } else if (segmentCountCell) {
    extractionConfig.segmentCountCell = segmentCountCell;
    extractionConfig.groupSize = null;
    extractionConfig.groups = null;
    extractionConfig.segmentCount = null;
  } else if (segmentationMode === "auto") {
    // In auto mode, grouping must be inferred per file in the worker.
    // Do not freeze preview-derived group values into the shared batch config.
    extractionConfig.groupSize = null;
    extractionConfig.groups = null;
    extractionConfig.segmentCount = null;
  } else {
    extractionConfig.groupSize = groupSize;
    extractionConfig.groups = groups;
    extractionConfig.segmentCount = segmentCount;
  }

  return {
    ok: true,
    type: "success",
    warnings,
    normalizedConfig,
    extractionConfig,
    meta: {
      pointsRawUpper: String(pointsRaw).toUpperCase(),
      segmentsRawUpper: String(segmentsRaw).toUpperCase(),
      groupSizeCell: Boolean(groupSizeCell),
      segmentCountCell: Boolean(segmentCountCell),
      groupSize,
      groups,
      segmentCount,
      total,
      groupSizePreview,
      segmentCountPreview,
    },
  };
}
