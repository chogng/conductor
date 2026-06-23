/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	Template,
	TemplateApplicability,
	TemplateAxisBinding,
	TemplateBlock,
	TemplateSegmentation,
} from "src/cs/workbench/services/template/common/templateSpec";
import type {
	TemplateApplyPresetRecord,
	TemplateSnapshot,
} from "src/cs/workbench/services/template/common/template";
import {
	normalizeTemplateApplyConfigRecord,
	type TemplateApplyConfig,
} from "src/cs/workbench/services/template/common/templateApplyConfigUtils";
import { resolveTemplateXRange } from "src/cs/workbench/services/template/common/templateXRange";

export const createTemplateSnapshotFromApplyPresets = (
	templates: readonly TemplateApplyPresetRecord[],
	version: number,
): TemplateSnapshot => ({
	version: normalizeNonNegativeInteger(version),
	templates: templates
		.map(createTemplateFromApplyPresetRecord)
		.filter((template): template is Template => Boolean(template)),
});

export const createTemplateFromApplyPresetRecord = (
	record: TemplateApplyPresetRecord,
): Template | null => {
	const canonicalTemplate = readCanonicalTemplate(record);
	if (canonicalTemplate) {
		return canonicalTemplate;
	}

	const config = normalizeTemplateApplyConfigRecord(record);
	if (!config.xColumns.length || !config.yColumns.length) {
		return null;
	}

	const rowRange = getTemplateRowRange(config);
	const xRanges = config.xRanges
		.map(range => resolveTemplateXRange(range))
		.filter((range): range is NonNullable<ReturnType<typeof resolveTemplateXRange>> => Boolean(range));
	const x: TemplateAxisBinding = {
		columns: config.xColumns,
		...(xRanges.length
			? {
				ranges: xRanges.map(range => ({
					column: range.column,
					startRow: range.startRow,
					endRow: range.endRow,
				})),
			}
			: {}),
		...(config.xUnit ? { unit: config.xUnit } : {}),
	};
	const y: TemplateAxisBinding = {
		columns: config.yColumns,
		...(config.yUnit ? { unit: config.yUnit } : {}),
	};
	const block: TemplateBlock = {
		rowRange,
		x,
		y,
		segmentation: getTemplateSegmentation(config),
		legend: {
			target: config.yLegendTarget,
			...(config.legendPrefix ? { prefix: config.legendPrefix } : {}),
		},
		...(config.bottomTitle || config.leftTitle
			? {
				titles: {
					...(config.bottomTitle ? { bottom: config.bottomTitle } : {}),
					...(config.leftTitle ? { left: config.leftTitle } : {}),
				},
			}
			: {}),
	};
	const id = normalizeOptionalText(record.id);

	return {
		schemaVersion: 1,
		...(id ? { id } : {}),
		name: config.name || id || "Untitled Template",
		version: normalizeTemplateVersion(record.version),
		blocks: [block],
		stopOnError: config.stopOnError,
		...(readTemplateApplicability(record) ? { applicability: readTemplateApplicability(record) } : {}),
	};
};

const readCanonicalTemplate = (
	record: TemplateApplyPresetRecord,
): Template | null => {
	const value = record.template;
	if (!isTemplate(value)) {
		return null;
	}

	return value;
};

const isTemplate = (value: unknown): value is Template => {
	if (!value || typeof value !== "object") {
		return false;
	}

	const record = value as Partial<Template>;
	return record.schemaVersion === 1 &&
		typeof record.name === "string" &&
		typeof record.version === "number" &&
		Array.isArray(record.blocks) &&
		typeof record.stopOnError === "boolean";
};

const getTemplateRowRange = (
	config: TemplateApplyConfig,
): TemplateBlock["rowRange"] => {
	const firstRange = config.xRanges
		.map(range => resolveTemplateXRange(range))
		.find((range): range is NonNullable<ReturnType<typeof resolveTemplateXRange>> => Boolean(range));
	if (firstRange) {
		return {
			startRow: firstRange.startRow,
			endRow: firstRange.endRow,
		};
	}

	return {
		startRow: normalizeCellRow(config.xDataStart),
		endRow: normalizeCellRowOrEnd(config.xDataEnd),
	};
};

const getTemplateSegmentation = (
	config: TemplateApplyConfig,
): TemplateSegmentation => {
	switch (config.xSegmentationMode) {
		case "points": {
			const pointsPerGroup = normalizePositiveInteger(config.xPointsPerGroup);
			return pointsPerGroup
				? { kind: "fixedPoints", pointsPerGroup }
				: { kind: "auto" };
		}
		case "segments": {
			const segmentCount = normalizePositiveInteger(config.xSegmentCount);
			return segmentCount
				? { kind: "fixedSegments", segmentCount }
				: { kind: "auto" };
		}
		case "auto":
			return { kind: "auto" };
	}
};

const readTemplateApplicability = (
	record: TemplateApplyPresetRecord,
): TemplateApplicability | undefined => {
	const value = record.applicability;
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}

	const source = value as Record<string, unknown>;
	const schemaFingerprint = normalizeOptionalText(source.schemaFingerprint);
	const columnCount = normalizePositiveInteger(source.columnCount);
	return schemaFingerprint || columnCount
		? {
			...(schemaFingerprint ? { schemaFingerprint } : {}),
			...(columnCount ? { columnCount } : {}),
		}
		: undefined;
};

const normalizeTemplateVersion = (value: unknown): number => {
	const version = normalizePositiveInteger(value);
	return version ?? 1;
};

const normalizeCellRow = (value: unknown): number => {
	const match = /^[A-Z]+([0-9]+)$/i.exec(String(value ?? "").trim());
	if (!match) {
		return 0;
	}

	return Math.max(0, Number(match[1]) - 1);
};

const normalizeCellRowOrEnd = (value: unknown): number | "end" => {
	const text = String(value ?? "").trim();
	return text ? normalizeCellRow(text) : "end";
};

const normalizePositiveInteger = (value: unknown): number | undefined => {
	const numberValue = Math.floor(Number(value));
	return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
};

const normalizeNonNegativeInteger = (value: unknown): number => {
	const numberValue = Math.floor(Number(value));
	return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
};

const normalizeOptionalText = (value: unknown): string | undefined => {
	const text = String(value ?? "").trim();
	return text || undefined;
};
