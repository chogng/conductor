/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { TableFactsSourceRange } from "src/cs/workbench/services/tableFacts/common/diagnostics";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import type {
  CurveKey,
  FileId,
  FileRecord,
  MetricKey,
  SheetId,
  TableRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import type {
  RawTableRangeRef,
  SearchIndex,
  SearchResult,
} from "src/cs/workbench/services/search/common/search";

export const buildSearchIndex = (
  snapshot: SessionSnapshot,
): SearchIndex => {
  const results: SearchResult[] = [];

  for (const file of getOrderedFiles(snapshot)) {
    pushRawTableResults(results, file);
    pushMeasurementBlockResults(results, file);
    pushCurveResults(results, file);
    pushMetricResults(results, file);
  }

  return {
    results,
    signature: [
      snapshot.schemaVersion,
      snapshot.sessionVersion,
      snapshot.fileOrder.join(","),
      results.length,
    ].join(":"),
  };
};

const pushRawTableResults = (
  results: SearchResult[],
  file: FileRecord,
): void => {
  for (const tableId of getOrderedTableIds(file)) {
    const table = file.raw.tablesById[tableId];
    if (!table) {
      continue;
    }

    results.push({
      fileId: file.id,
      id: `rawTable:${file.id}:${table.sheetId}`,
      kind: "rawTable",
      preview: createRawTablePreview(table),
      rawTableId: table.sheetId,
      score: 80,
      title: table.sheetName || table.sheetId || file.raw.fileName,
    });

    const rows = table.rowStore?.kind === "memory" ? table.rowStore.rows : [];
    rows.forEach((row, rowIndex) => {
      row.forEach((cell, columnIndex) => {
        const text = String(cell ?? "").trim();
        if (!text) {
          return;
        }

        results.push({
          fileId: file.id,
          id: `rawCell:${file.id}:${table.sheetId}:${rowIndex}:${columnIndex}`,
          kind: "rawCell",
          preview: text,
          rawTableId: table.sheetId,
          score: 50,
          sourceRange: {
            columnEnd: columnIndex,
            columnStart: columnIndex,
            fileId: file.id,
            rawTableId: table.sheetId,
            rowEnd: rowIndex,
            rowStart: rowIndex,
          },
          title: `${table.sheetName || table.sheetId} R${rowIndex + 1}C${columnIndex + 1}`,
        });
      });
    });
  }
};

const pushMeasurementBlockResults = (
  results: SearchResult[],
  file: FileRecord,
): void => {
  const blockIds = file.measurementBlockOrder?.length
    ? file.measurementBlockOrder
    : Object.keys(file.measurementBlocksById ?? {});
  for (const blockId of blockIds) {
    const block = file.measurementBlocksById?.[blockId];
    if (!block) {
      continue;
    }

    results.push({
      fileId: file.id,
      groupId: block.groupId,
      id: `block:${file.id}:${block.id}`,
      kind: "block",
      measurementBlockId: block.id,
      preview: [
        block.family,
        block.ivMode,
        `${block.rowCount} rows`,
        ...block.diagnosticCodes,
      ].filter(Boolean).join(" · "),
      rawTableId: block.rawTableId,
      score: 70,
      sourceRange: toRawTableRange(file.id, block.rawTableId, block.source.fullRange),
      title: block.label || block.id,
    });
  }
};

const pushCurveResults = (
  results: SearchResult[],
  file: FileRecord,
): void => {
  for (const [curveKey, curve] of Object.entries(file.curvesByKey) as Array<[CurveKey, FileRecord["curvesByKey"][CurveKey]]>) {
    const series = file.seriesById[curve.seriesId];
    results.push({
      curveKey,
      fileId: file.id,
      id: `curve:${file.id}:${curveKey}`,
      kind: "curve",
      preview: [
        curve.curveGeneration,
        curve.curveFamily,
        curve.ivMode,
        `${curve.points.length} points`,
      ].filter(Boolean).join(" · "),
      score: 90,
      title: series?.labelOverride ?? series?.legendValue ?? series?.name ?? curve.seriesId,
    });
  }
};

const pushMetricResults = (
  results: SearchResult[],
  file: FileRecord,
): void => {
  for (const [metricKey, metric] of Object.entries(file.metricsByKey) as Array<[MetricKey, FileRecord["metricsByKey"][MetricKey]]>) {
    const series = file.seriesById[metric.seriesId];
    results.push({
      fileId: file.id,
      id: `metric:${file.id}:${metricKey}`,
      kind: "metric",
      metricKey,
      preview: [
        metric.metricFamily,
        metric.contextKey,
        formatMetricValue(metric.value),
      ].filter(Boolean).join(" · "),
      score: 85,
      title: series?.labelOverride ?? series?.legendValue ?? series?.name ?? metric.seriesId,
    });
  }
};

const getOrderedFiles = (
  snapshot: SessionSnapshot,
): FileRecord[] => {
  const files: FileRecord[] = [];
  const seen = new Set<FileId>();
  const pushFile = (fileId: FileId): void => {
    if (seen.has(fileId)) {
      return;
    }
    seen.add(fileId);
    const file = snapshot.filesById[fileId];
    if (file) {
      files.push(file);
    }
  };

  for (const fileId of snapshot.fileOrder) {
    pushFile(fileId);
  }
  for (const fileId of Object.keys(snapshot.filesById)) {
    pushFile(fileId);
  }
  return files;
};

const getOrderedTableIds = (
  file: FileRecord,
): SheetId[] => {
  const tableIds: SheetId[] = [];
  const seen = new Set<SheetId>();
  const pushTable = (tableId: SheetId): void => {
    if (seen.has(tableId)) {
      return;
    }
    seen.add(tableId);
    if (file.raw.tablesById[tableId]) {
      tableIds.push(tableId);
    }
  };

  for (const tableId of file.raw.tableOrder) {
    pushTable(tableId);
  }
  for (const tableId of Object.keys(file.raw.tablesById)) {
    pushTable(tableId);
  }
  return tableIds;
};

const createRawTablePreview = (table: TableRecord): string =>
  `${table.rowCount} rows · ${table.columnCount} columns`;

const toRawTableRange = (
  fileId: FileId,
  rawTableId: SheetId,
  range: TableFactsSourceRange | undefined,
): RawTableRangeRef | undefined =>
  range
    ? {
        columnEnd: range.endCol,
        columnStart: range.startCol,
        fileId,
        rawTableId,
        rowEnd: range.endRow,
        rowStart: range.startRow,
      }
    : undefined;

const formatMetricValue = (value: unknown): string => {
  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;
  for (const key of ["ion", "ioff", "ionIoff", "maxAbs", "vth", "ss"]) {
    const metricValue = record[key];
    if (typeof metricValue === "number" && Number.isFinite(metricValue)) {
      return `${key}: ${metricValue}`;
    }
  }
  return "";
};
