/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import Papa from "papaparse";

import {
  inferXSegmentationSuggestionFromPreview,
  resolveXRangeForPreview,
  resolveXSegmentationMode,
} from "src/cs/workbench/services/template/common/xSegmentation";
import {
  normalizeTemplateConfigRecord,
  type TemplateConfig,
} from "src/cs/workbench/services/template/common/templateConfigUtils";
import type { TemplateRecord } from "src/cs/workbench/services/template/common/template";
import {
  normalizeColumnIndexes,
  resolveTemplateXYBinding,
} from "src/cs/workbench/services/template/common/templateXYBinding";

export type TemplateSliceOutput = {
  readonly content: string;
  readonly fileName: string;
  readonly index: number;
  readonly rowCount: number;
};

export type TemplateSlicePlan = {
  readonly groupSize: number;
  readonly slices: readonly TemplateSliceOutput[];
  readonly totalDataRows: number;
};

export type TemplateSlicePlanInput = {
  readonly csvText: string;
  readonly filePrefixName: string;
  readonly template: TemplateRecord;
};

const CSV_MIME_TYPE = "text/csv;charset=utf-8";
const ALL_COLUMNS_SLICE_GROUP: TemplateSliceColumnGroup = {
  columns: null,
};

export const TEMPLATE_SLICE_FILE_MIME_TYPE = CSV_MIME_TYPE;

type TemplateSliceColumnGroup = {
  readonly columns: readonly number[] | null;
};

export function createTemplateSlicePlan({
  csvText,
  filePrefixName,
  template,
}: TemplateSlicePlanInput): TemplateSlicePlan {
  const rows = parseCsvRows(csvText);
  if (!rows.length) {
    throw new Error("Slice target has no CSV rows.");
  }

  const config = normalizeTemplateConfigRecord(template as Partial<TemplateConfig> & Record<string, unknown>);
  const range = resolveXRangeForPreview({
    previewRowCount: rows.length,
    xDataEnd: config.xDataEnd,
    xDataStart: config.xDataStart,
  });
  if (!range) {
    throw new Error("Template must define a valid X data range.");
  }

  const { groupSize, groups } = resolveSliceGrouping(config, rows, range);
  const columnGroups = resolveSliceColumnGroups(config);
  const prefix = normalizeTemplateSliceFilePrefix(filePrefixName);
  const slices: TemplateSliceOutput[] = [];
  let sliceIndex = 1;

  for (const columnGroup of columnGroups) {
    const headerRows = sliceRowsByColumnGroup(rows.slice(0, range.startRow), columnGroup);
    for (let groupIndex = 0; groupIndex < groups; groupIndex += 1) {
      const startRow = range.startRow + groupIndex * groupSize;
      const dataRows = sliceRowsByColumnGroup(rows.slice(startRow, startRow + groupSize), columnGroup);
      const sliceRows = [...headerRows, ...dataRows];
      slices.push({
        content: serializeCsvRows(sliceRows),
        fileName: `${prefix}_${sliceIndex}.csv`,
        index: sliceIndex,
        rowCount: dataRows.length,
      });
      sliceIndex += 1;
    }
  }

  return {
    groupSize,
    slices,
    totalDataRows: range.total,
  };
}

export function normalizeTemplateSliceFilePrefix(value: unknown): string {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^\.+|\.+$/g, "")
    .replace(/^_+|_+$/g, "");

  return normalized || "slice";
}

export function getTemplateSliceCount(input: TemplateSlicePlanInput): number {
  return createTemplateSlicePlan(input).slices.length;
}

function resolveSliceGrouping(
  config: TemplateConfig,
  rows: readonly (readonly string[])[],
  range: NonNullable<ReturnType<typeof resolveXRangeForPreview>>,
): { readonly groupSize: number; readonly groups: number } {
  const mode = resolveXSegmentationMode(config.xSegmentationMode);

  if (mode === "segments") {
    const groups = readPositiveInteger(config.xSegmentCount);
    if (!groups) {
      throw new Error("Template segment count must be a positive integer.");
    }
    if (range.total % groups !== 0) {
      throw new Error(`X range has ${range.total} rows, which is not divisible by ${groups} segments.`);
    }
    return {
      groupSize: range.total / groups,
      groups,
    };
  }

  if (mode === "points") {
    const groupSize = readPositiveInteger(config.xPointsPerGroup);
    if (!groupSize) {
      throw new Error("Template points per group must be a positive integer.");
    }
    if (range.total % groupSize !== 0) {
      throw new Error(`X range has ${range.total} rows, which is not divisible by ${groupSize} points per group.`);
    }
    return {
      groupSize,
      groups: range.total / groupSize,
    };
  }

  const suggestion = inferXSegmentationSuggestionFromPreview({
    getPreviewRow: rowIndex => rows[rowIndex],
    previewRowCount: rows.length,
    xDataEnd: config.xDataEnd,
    xDataStart: config.xDataStart,
  });
  if (suggestion?.groupSize && suggestion.groups) {
    return {
      groupSize: suggestion.groupSize,
      groups: suggestion.groups,
    };
  }

  return {
    groupSize: range.total,
    groups: 1,
  };
}

function resolveSliceColumnGroups(config: TemplateConfig): readonly TemplateSliceColumnGroup[] {
  const xColumns = normalizeColumnIndexes(config.xColumns);
  const yColumns = normalizeColumnIndexes(config.yColumns);
  if (!xColumns.length && !yColumns.length) {
    return [ALL_COLUMNS_SLICE_GROUP];
  }
  if (!xColumns.length) {
    return [{
      columns: yColumns,
    }];
  }
  if (!yColumns.length) {
    return xColumns.map(column => ({
      columns: [column],
    }));
  }

  const xyBinding = resolveTemplateXYBinding({
    x: { columns: xColumns },
    y: { columns: yColumns },
  });
  if (!xyBinding.ok) {
    throw new Error("Template X/Y columns cannot be paired for slicing.");
  }

  const columnsByX = new Map<number, number[]>();
  for (const binding of xyBinding.seriesBindings) {
    const columns = columnsByX.get(binding.xCol) ?? [binding.xCol];
    columns.push(binding.yCol);
    columnsByX.set(binding.xCol, columns);
  }

  return xColumns
    .map(xColumn => columnsByX.get(xColumn))
    .filter((columns): columns is number[] => Boolean(columns?.length))
    .map(columns => ({
      columns: normalizeColumnIndexes(columns),
    }));
}

function sliceRowsByColumnGroup(
  rows: readonly (readonly string[])[],
  group: TemplateSliceColumnGroup,
): readonly (readonly string[])[] {
  if (group.columns === null) {
    return rows.map(row => [...row]);
  }

  return rows.map(row => group.columns.map(column => row[column] ?? ""));
}

function readPositiveInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function parseCsvRows(text: string): readonly (readonly string[])[] {
  const parsed = Papa.parse<unknown[]>(text, {
    skipEmptyLines: false,
  });
  return parsed.data.map(row => row.map(cell => cell == null ? "" : String(cell)));
}

function serializeCsvRows(rows: readonly (readonly string[])[]): string {
  return `${Papa.unparse(rows.map(row => [...row]), { newline: "\n" })}\n`;
}
