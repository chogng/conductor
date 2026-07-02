/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export const TABLE_COLUMN_DEFAULT_WIDTH = 90;
export const TABLE_COLUMN_MIN_WIDTH = 0;
export const TABLE_COLUMN_MAX_WIDTH = 640;
export const TABLE_COLUMN_AUTO_FIT_MIN_WIDTH = 48;

export type TableColumnSizingMode = "fixed" | "autoFit";

export const TableColumnLayout = {
	defaultWidth: TABLE_COLUMN_DEFAULT_WIDTH,
	minWidth: TABLE_COLUMN_MIN_WIDTH,
	maxWidth: TABLE_COLUMN_MAX_WIDTH,
	autoFitMinWidth: TABLE_COLUMN_AUTO_FIT_MIN_WIDTH,
	defaultSizingMode: "fixed" as TableColumnSizingMode,
	clampWidth: (width: number): number =>
		Math.min(
			TABLE_COLUMN_MAX_WIDTH,
			Math.max(TABLE_COLUMN_MIN_WIDTH, Math.round(Number(width) || 0)),
		),
} as const;

export type TableColumnWidth = {
	readonly colIndex: number;
	readonly width: number;
};

export type TableColumnLayoutState = {
	readonly widths: readonly TableColumnWidth[];
};

export type StoredTableColumnLayout = {
	readonly version?: number;
	readonly widths?: Record<string, unknown>;
};

const TABLE_COLUMN_LAYOUT_STORAGE_VERSION = 2;

export const toStoredTableColumnLayout = (
	layout: TableColumnLayoutState,
): StoredTableColumnLayout => {
	const storedWidths: Record<string, number> = {};
	for (const width of layout.widths) {
		const colIndex = normalizeTableColumnIndex(width.colIndex);
		if (colIndex === null) {
			continue;
		}

		const normalizedWidth = TableColumnLayout.clampWidth(width.width);
		if (normalizedWidth === TableColumnLayout.defaultWidth) {
			continue;
		}

		storedWidths[String(colIndex)] = normalizedWidth;
	}

	return {
		version: TABLE_COLUMN_LAYOUT_STORAGE_VERSION,
		widths: storedWidths,
	};
};

export const toTableColumnLayoutState = (
	stored: StoredTableColumnLayout,
): TableColumnLayoutState => {
	if (!stored || stored.version !== TABLE_COLUMN_LAYOUT_STORAGE_VERSION || !stored.widths) {
		return {
			widths: [],
		};
	}

	const result: TableColumnWidth[] = [];
	for (const [colIndexKey, width] of Object.entries(stored.widths)) {
		const colIndex = normalizeTableColumnIndex(colIndexKey);
		if (colIndex === null) {
			continue;
		}

		const normalizedWidth = TableColumnLayout.clampWidth(Number(width));
		if (normalizedWidth === TableColumnLayout.defaultWidth) {
			continue;
		}

		result.push({
			colIndex,
			width: normalizedWidth,
		});
	}

	return {
		widths: result.sort((left, right) => left.colIndex - right.colIndex),
	};
};

const normalizeTableColumnIndex = (colIndex: unknown): number | null => {
	const value = Math.floor(Number(colIndex));
	return Number.isFinite(value) && value >= 0 ? value : null;
};
