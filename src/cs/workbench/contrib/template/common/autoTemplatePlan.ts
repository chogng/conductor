import {
  classifyCurve,
  extractCurveMetadata,
} from "../../../common/curveClassification.ts";
import {
  inferGenericPlan,
  inferStrippedChannelPlan,
} from "./autoTemplatePlanBuilders.ts";
import {
  findHeaderRowIndex,
  getNormalizedRow,
} from "./autoTemplateRows.ts";
import type {
  AutoExtractionResult,
  TemplateRows,
} from "./autoTemplateTypes.ts";

export type {
  AutoExtractionBlock,
  AutoExtractionPlan,
  AutoExtractionResult,
} from "./autoTemplateTypes.ts";
export { inferMetadataGroupShapeFromRows } from "./autoTemplateMetadata.ts";

// Public entry point for preview-time auto inference. Keep this thin so future
// layout rules can stay inside the dedicated helpers above.
export const inferAutoExtraction = ({
  fileName,
  rows,
  totalRowCount,
}: {
  fileName?: unknown;
  rows: TemplateRows;
  totalRowCount?: number | null;
}): AutoExtractionResult => {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (!safeRows.length) {
    return {
      message: `${String(fileName ?? "file")}: no rows available for auto extraction.`,
      ok: false,
      reasons: [],
    };
  }

  const headerRowIndex = findHeaderRowIndex(safeRows);
  const headers = getNormalizedRow(safeRows, headerRowIndex);
  const dataStartRowIndex = Math.min(headerRowIndex + 1, safeRows.length);
  const metadata = extractCurveMetadata(safeRows);
  const classification = classifyCurve({
    fileName,
    metadata,
  });

  if (metadata.isStrippedChannelSweep) {
    return inferStrippedChannelPlan({
      classification,
      dataStartRowIndex,
      fileName,
      headers,
      metadata,
      rows: safeRows,
      totalRowCount,
    });
  }

  return inferGenericPlan({
    classification,
    dataStartRowIndex,
    fileName,
    headers,
    metadata,
    rows: safeRows,
    totalRowCount,
  });
};

export const createAutoTemplatePlan = inferAutoExtraction;

