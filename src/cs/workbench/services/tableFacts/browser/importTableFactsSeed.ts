/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import Papa from "papaparse";
import type {
  ImportTableFactsSeed,
  RawTableFactsFileInput,
  RawTableFactsRows,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";
import type {
  IvSweepMode,
  MeasurementFamily,
} from "src/cs/workbench/services/tableFacts/common/measurement";
import {
  createImportTableFactsSeedHeuristic,
  extractImportTableFactsSeedMetadata,
  type CurveKind,
} from "src/cs/workbench/services/tableFacts/common/importTableFactsSeedHeuristics";

const FILE_TABLE_FACTS_PREVIEW_BYTES = 128 * 1024;
const FILE_TABLE_FACTS_PREVIEW_ROWS = 256;

export const createImportTableFactsSeedFromRows = async (
  fileName: string,
  rows: RawTableFactsRows,
): Promise<ImportTableFactsSeed> => {
  const heuristic = createImportTableFactsSeedHeuristic({
    fileName,
    metadata: extractImportTableFactsSeedMetadata(rows.map(row => [...row])),
  });
  return {
    curveFamily: getMeasurementFamily(heuristic.curveType),
    curveType: heuristic.curveTypeLabel,
    curveTypeConfidence: heuristic.confidence,
    curveTypeNeedsReview: heuristic.needsReview,
    curveTypeReasons: heuristic.reasons,
    ivMode: getIvMode(heuristic.curveType),
    xAxisRole: heuristic.xAxisRole,
    xAxisRoleSource: heuristic.xAxisRoleSource,
  };
};

const getMeasurementFamily = (
  curveType: CurveKind,
): MeasurementFamily => {
  if (curveType === "transfer" || curveType === "output") {
    return "iv";
  }
  if (curveType === "cv" || curveType === "cf" || curveType === "pv") {
    return curveType;
  }
  return "unknown";
};

const getIvMode = (
  curveType: CurveKind,
): IvSweepMode | null => {
  if (curveType === "transfer" || curveType === "output") {
    return curveType;
  }
  return null;
};

export const createImportTableFactsSeedFromFile = async (
  file: RawTableFactsFileInput,
): Promise<ImportTableFactsSeed> => {
  const previewText = await file
    .slice(0, FILE_TABLE_FACTS_PREVIEW_BYTES)
    .text();
  const parsed = Papa.parse(previewText, {
    preview: FILE_TABLE_FACTS_PREVIEW_ROWS,
    skipEmptyLines: false,
  });
  const rows = Array.isArray(parsed.data)
    ? (parsed.data as Array<Array<unknown>>).map(row =>
        row.map(value => String(value ?? ""))
      )
    : [];
  return createImportTableFactsSeedFromRows(file?.name ?? "", rows);
};
