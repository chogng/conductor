/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { ColumnDisplayProfile } from "src/cs/workbench/services/table/common/tableDisplayProfile";
import {
	DEFAULT_TABLE_DISPLAY_SIGNIFICANT_DIGITS,
} from "src/cs/workbench/services/table/common/tableDisplayProfile";

const NUMERIC_CELL_PATTERN = /^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;
const SUPERSCRIPT_DIGITS: Record<string, string> = {
	"+": "⁺",
	"-": "⁻",
	"0": "⁰",
	"1": "¹",
	"2": "²",
	"3": "³",
	"4": "⁴",
	"5": "⁵",
	"6": "⁶",
	"7": "⁷",
	"8": "⁸",
	"9": "⁹",
};

export const parseNumericCell = (value: unknown): number | null => {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}

	if (typeof value !== "string") {
		return null;
	}

	const text = value.trim();
	if (!text || !NUMERIC_CELL_PATTERN.test(text)) {
		return null;
	}

	const numericValue = Number(text);
	return Number.isFinite(numericValue) ? numericValue : null;
};

export const chooseColumnScaleExponent = (
	values: readonly number[],
): number => {
	const magnitudes = values
		.map(value => Math.abs(value))
		.filter(value => Number.isFinite(value) && value > 0)
		.sort((left, right) => left - right);

	if (!magnitudes.length) {
		return 0;
	}

	const median = magnitudes[Math.floor(magnitudes.length / 2)];
	if (!median || !Number.isFinite(median)) {
		return 0;
	}

	return Math.floor(Math.log10(median) / 3) * 3;
};

export const toSuperscriptExponent = (exponent: number): string => {
	const normalized = Math.trunc(Number(exponent) || 0);
	return String(normalized)
		.split("")
		.map(char => SUPERSCRIPT_DIGITS[char] ?? char)
		.join("");
};

export const toScaleHeaderSuffix = (scaleExponent: number): string | undefined => {
	const exponent = Math.trunc(Number(scaleExponent) || 0);
	return exponent === 0 ? undefined : `×10${toSuperscriptExponent(exponent)}`;
};

export const formatScaledNumber = (
	rawValue: unknown,
	profile: Pick<ColumnDisplayProfile, "scaleExponent" | "significantDigits">,
): string | null => {
	const numericValue = parseNumericCell(rawValue);
	if (numericValue === null) {
		return null;
	}

	const scaledValue = numericValue / Math.pow(10, profile.scaleExponent);
	if (!Number.isFinite(scaledValue)) {
		return null;
	}

	const fixedDecimals = getScientificMantissaDecimalPlaces(rawValue);
	if (fixedDecimals !== null) {
		return scaledValue.toFixed(fixedDecimals);
	}

	return toPlainPrecision(
		scaledValue,
		Math.max(1, Math.floor(Number(profile.significantDigits) || DEFAULT_TABLE_DISPLAY_SIGNIFICANT_DIGITS)),
	);
};

export const formatCell = (
	rawValue: unknown,
	profile: ColumnDisplayProfile,
): string => {
	if (profile.mode !== "columnScale" || !profile.isNumericColumn) {
		return formatRawCell(rawValue);
	}

	return formatScaledNumber(rawValue, profile) ?? formatRawCell(rawValue);
};

export const formatRawCell = (value: unknown): string => {
	if (value === null || value === undefined) {
		return "";
	}
	return String(value);
};

const getScientificMantissaDecimalPlaces = (value: unknown): number | null => {
	if (typeof value !== "string") {
		return null;
	}

	const text = value.trim();
	const exponentIndex = text.search(/[eE]/);
	if (exponentIndex < 0) {
		return null;
	}

	const mantissa = text.slice(0, exponentIndex);
	const decimalIndex = mantissa.indexOf(".");
	if (decimalIndex < 0) {
		return 0;
	}

	return Math.min(12, Math.max(0, mantissa.length - decimalIndex - 1));
};

const toPlainPrecision = (value: number, significantDigits: number): string => {
	const precisionText = value.toPrecision(significantDigits);
	if (!/[eE]/.test(precisionText)) {
		return precisionText;
	}

	const fixedDigits = Math.max(
		0,
		significantDigits - Math.floor(Math.log10(Math.abs(value) || 1)) - 1,
	);
	return value.toFixed(Math.min(12, fixedDigits));
};

