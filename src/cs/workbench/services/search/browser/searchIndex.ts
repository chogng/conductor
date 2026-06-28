/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { DataResourceStructuredContentSnapshot } from "src/cs/workbench/services/dataResource/common/dataResource";
import {
  readStructuredContentRows,
  type StructuredContentSourceRange,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import type {
  SearchIndex,
  SearchResult,
} from "src/cs/workbench/services/search/common/search";

export const buildStructuredContentSearchIndex = (
  snapshot: DataResourceStructuredContentSnapshot,
): SearchIndex => {
  const results: SearchResult[] = [];
  pushStructuredTableResults(results, snapshot);
  pushStructuredColumnResults(results, snapshot);
  pushStructuredGroupResults(results, snapshot);
  pushStructuredBlockResults(results, snapshot);

  return {
    results,
    signature: [
      snapshot.sourceUri,
      snapshot.sourceVersion,
      snapshot.sourceModelVersion,
      snapshot.contentHash ?? "",
      snapshot.sheetId ?? "",
      results.length,
    ].join(":"),
  };
};

const pushStructuredTableResults = (
  results: SearchResult[],
  snapshot: DataResourceStructuredContentSnapshot,
): void => {
  const sheetTitle = snapshot.sheetId || snapshot.fileName || snapshot.resource.toString();
  const tableRange = createResourceRange(snapshot, {
    startRow: 0,
    endRow: Math.max(0, snapshot.rowCount - 1),
    startCol: 0,
    endCol: Math.max(0, snapshot.columnCount - 1),
  });
  results.push({
    id: `resourceTable:${snapshot.resource.toString()}:${snapshot.sheetId ?? ""}`,
    kind: "rawTable",
    preview: `${snapshot.rowCount} rows | ${snapshot.columnCount} columns`,
    resource: snapshot.resource,
    resourceRange: tableRange,
    score: 80,
    sheetId: snapshot.sheetId ?? null,
    title: sheetTitle,
  });

  const rows = readStructuredContentRows(snapshot.content);
  rows.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      const text = String(cell ?? "").trim();
      if (!text) {
        return;
      }

      results.push({
        id: `resourceCell:${snapshot.resource.toString()}:${snapshot.sheetId ?? ""}:${rowIndex}:${columnIndex}`,
        kind: "rawCell",
        preview: text,
        resource: snapshot.resource,
        resourceRange: createResourceRange(snapshot, {
          startRow: rowIndex,
          endRow: rowIndex,
          startCol: columnIndex,
          endCol: columnIndex,
        }),
        score: 50,
        sheetId: snapshot.sheetId ?? null,
        title: `${sheetTitle} R${rowIndex + 1}C${columnIndex + 1}`,
      });
    });
  });
};

const pushStructuredColumnResults = (
  results: SearchResult[],
  snapshot: DataResourceStructuredContentSnapshot,
): void => {
  for (const column of snapshot.structuredContent.columnProfiles) {
    const title = column.headerText || `Column ${column.rawCol + 1}`;
    results.push({
      id: `resourceColumn:${snapshot.resource.toString()}:${snapshot.sheetId ?? ""}:${column.rawCol}`,
      kind: "column",
      preview: [
        column.kind,
        column.explicitUnitText,
        column.normalizedHeader && column.normalizedHeader !== column.headerText
          ? column.normalizedHeader
          : "",
      ].filter(Boolean).join(" | "),
      resource: snapshot.resource,
      resourceRange: createResourceRange(snapshot, {
        startRow: 0,
        endRow: Math.max(0, snapshot.rowCount - 1),
        startCol: column.rawCol,
        endCol: column.rawCol,
      }),
      score: 65,
      sheetId: snapshot.sheetId ?? null,
      title,
    });
  }
};

const pushStructuredGroupResults = (
  results: SearchResult[],
  snapshot: DataResourceStructuredContentSnapshot,
): void => {
  for (const group of snapshot.structuredContent.groups) {
    results.push({
      groupId: group.id,
      id: `resourceGroup:${snapshot.resource.toString()}:${snapshot.sheetId ?? ""}:${group.id}`,
      kind: "group",
      preview: `${group.blockIds.length} blocks`,
      resource: snapshot.resource,
      resourceRange: group.titleRange ? createResourceRange(snapshot, group.titleRange) : undefined,
      score: 70,
      sheetId: snapshot.sheetId ?? null,
      title: group.label,
    });
  }
};

const pushStructuredBlockResults = (
  results: SearchResult[],
  snapshot: DataResourceStructuredContentSnapshot,
): void => {
  for (const block of snapshot.structuredContent.blocks) {
    const sourceRange = block.source.dataRange ?? block.source.fullRange;
    results.push({
      groupId: block.groupId,
      id: `resourceBlock:${snapshot.resource.toString()}:${snapshot.sheetId ?? ""}:${block.id}`,
      kind: "block",
      measurementBlockId: block.id,
      preview: [
        block.family,
        block.ivMode,
        `${block.rowCount} rows`,
        `${block.columnCount} columns`,
      ].filter(Boolean).join(" | "),
      resource: snapshot.resource,
      resourceRange: createResourceRange(snapshot, sourceRange),
      score: 75,
      sheetId: snapshot.sheetId ?? null,
      title: block.label,
    });
  }
};

const createResourceRange = (
  snapshot: DataResourceStructuredContentSnapshot,
  range: StructuredContentSourceRange,
) => ({
  resource: snapshot.resource,
  sheetId: snapshot.sheetId ?? null,
  columnEnd: Math.max(0, Math.floor(range.endCol)),
  columnStart: Math.max(0, Math.floor(range.startCol)),
  rowEnd: Math.max(0, Math.floor(range.endRow)),
  rowStart: Math.max(0, Math.floor(range.startRow)),
});
