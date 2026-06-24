/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type ColumnSelection = {
  readonly columns: readonly number[];
};

export type TemplateXYBinding = {
  readonly x: ColumnSelection;
  readonly y: ColumnSelection;
};

export type ResolveTemplateXYBindingResult =
  | {
      readonly ok: true;
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
    return {
      ok: true,
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
  };
}
