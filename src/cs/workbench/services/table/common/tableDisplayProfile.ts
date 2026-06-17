/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type NumericDisplayMode = "raw" | "smart";

export type ColumnDisplayMode = "raw" | "columnScale";

export type ColumnDisplayProfile = {
	readonly rawTableId: string;
	readonly columnId: string;
	readonly mode: ColumnDisplayMode;
	readonly isNumericColumn: boolean;
	readonly scaleExponent: number;
	readonly headerSuffix?: string;
	readonly significantDigits: number;
	readonly sourceVersion: number;
	readonly settingsVersion: number;
};

export type TableDisplayProfile = {
	readonly rawTableId: string;
	readonly columns: readonly ColumnDisplayProfile[];
	readonly sourceVersion: number;
	readonly settingsVersion: number;
};

export const DEFAULT_NUMERIC_DISPLAY_MODE: NumericDisplayMode = "raw";
export const DEFAULT_TABLE_DISPLAY_SIGNIFICANT_DIGITS = 6;

