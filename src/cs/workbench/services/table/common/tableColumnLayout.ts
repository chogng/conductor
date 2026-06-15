/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

const TABLE_COLUMN_DEFAULT_WIDTH = 160;
const TABLE_COLUMN_MIN_WIDTH = 0;
const TABLE_COLUMN_MAX_WIDTH = 640;

export const TableColumnLayout = {
	defaultWidth: TABLE_COLUMN_DEFAULT_WIDTH,
	minWidth: TABLE_COLUMN_MIN_WIDTH,
	maxWidth: TABLE_COLUMN_MAX_WIDTH,
	clampWidth: (width: number): number =>
		Math.min(
			TABLE_COLUMN_MAX_WIDTH,
			Math.max(TABLE_COLUMN_MIN_WIDTH, Math.round(Number(width) || 0)),
		),
} as const;
