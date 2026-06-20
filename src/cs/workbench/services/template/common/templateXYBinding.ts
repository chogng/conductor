/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { RawTableRangeRef } from "src/cs/workbench/services/files/common/rawTable";

export type ColumnSelection = {
  readonly columns: readonly number[];
};

export type GroupSpec = {
  readonly key?: string;
};

export type LegendSpec = {
  readonly labels?: readonly string[];
};

export type TemplateXYBinding = {
  readonly rowRange?: RawTableRangeRef;
  readonly x: ColumnSelection;
  readonly y: ColumnSelection;
  readonly group?: GroupSpec;
  readonly legend?: LegendSpec;
};

export type ResolvedSeriesBinding = {
  readonly xCol: number;
  readonly yCol: number;
  readonly xRange?: RawTableRangeRef;
  readonly yRange?: RawTableRangeRef;
  readonly legend?: string;
  readonly groupKey?: string;
};

export type ResolveTemplateXYBindingResult =
  | {
      readonly ok: true;
      readonly seriesBindings: readonly ResolvedSeriesBinding[];
    }
  | {
      readonly ok: false;
      readonly code: "missingXColumns" | "missingYColumns" | "pairedCountMismatch";
      readonly xCount: number;
      readonly yCount: number;
    };

export function normalizeColumnIndexes(columns: readonly unknown[] | undefined): number[] {
  const normalized: number[] = [];
  const seen = new Set<number>();
  for (const column of Array.isArray(columns) ? columns : []) {
    const index = Math.floor(Number(column));
    if (!Number.isInteger(index) || index < 0 || seen.has(index)) {
      continue;
    }

    seen.add(index);
    normalized.push(index);
  }
  return normalized;
}

export function resolveTemplateXYBinding(
  binding: TemplateXYBinding,
): ResolveTemplateXYBindingResult {
  const xColumns = normalizeColumnIndexes(binding.x.columns);
  const yColumns = normalizeColumnIndexes(binding.y.columns);

  if (!xColumns.length) {
    return {
      ok: false,
      code: "missingXColumns",
      xCount: 0,
      yCount: yColumns.length,
    };
  }
  if (!yColumns.length) {
    return {
      ok: false,
      code: "missingYColumns",
      xCount: xColumns.length,
      yCount: 0,
    };
  }

  if (xColumns.length === 1) {
    const xCol = xColumns[0] ?? 0;
    return {
      ok: true,
      seriesBindings: yColumns.map(yCol =>
        createResolvedSeriesBinding(binding, xCol, yCol),
      ),
    };
  }

  if (xColumns.length !== yColumns.length) {
    return {
      ok: false,
      code: "pairedCountMismatch",
      xCount: xColumns.length,
      yCount: yColumns.length,
    };
  }

  return {
    ok: true,
    seriesBindings: xColumns.map((xCol, index) =>
      createResolvedSeriesBinding(binding, xCol, yColumns[index] ?? yColumns[0] ?? xCol),
    ),
  };
}

function createResolvedSeriesBinding(
  binding: TemplateXYBinding,
  xCol: number,
  yCol: number,
): ResolvedSeriesBinding {
  return {
    xCol,
    yCol,
    xRange: createColumnRange(binding.rowRange, xCol),
    yRange: createColumnRange(binding.rowRange, yCol),
    groupKey: binding.group?.key,
  };
}

function createColumnRange(
  rowRange: RawTableRangeRef | undefined,
  column: number,
): RawTableRangeRef | undefined {
  if (!rowRange) {
    return undefined;
  }

  return {
    ...rowRange,
    range: {
      ...rowRange.range,
      startCol: column,
      endCol: column,
    },
  };
}
