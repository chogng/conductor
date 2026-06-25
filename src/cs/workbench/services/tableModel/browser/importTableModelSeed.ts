/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import Papa from "papaparse";
import type {
  ImportTableModelSeed,
  TableModelFileInput,
  TableModelRows,
} from "src/cs/workbench/services/tableModel/common/tableModel";
import type {
  IvSweepMode,
  MeasurementFamily,
} from "src/cs/workbench/services/tableModel/common/measurement";
import {
  createImportTableModelSeedHeuristic,
  extractImportTableModelSeedMetadata,
  type CurveKind,
} from "src/cs/workbench/services/tableModel/common/importTableModelSeedHeuristics";

const FILE_TABLE_MODEL_PREVIEW_BYTES = 128 * 1024;
const FILE_TABLE_MODEL_PREVIEW_ROWS = 256;

export const createImportTableModelSeedFromRows = async (
  fileName: string,
  rows: TableModelRows,
): Promise<ImportTableModelSeed> => {
  const heuristic = createImportTableModelSeedHeuristic({
    fileName,
    metadata: extractImportTableModelSeedMetadata(rows.map(row => [...row])),
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

export const createImportTableModelSeedFromFile = async (
  file: TableModelFileInput,
): Promise<ImportTableModelSeed> => {
  const previewText = await file
    .slice(0, FILE_TABLE_MODEL_PREVIEW_BYTES)
    .text();
  const parsed = Papa.parse(previewText, {
    preview: FILE_TABLE_MODEL_PREVIEW_ROWS,
    skipEmptyLines: false,
  });
  const rows = Array.isArray(parsed.data)
    ? (parsed.data as Array<Array<unknown>>).map(row =>
        row.map(value => String(value ?? ""))
      )
    : [];
  return createImportTableModelSeedFromRows(file?.name ?? "", rows);
};
