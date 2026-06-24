/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	Template,
	TemplateApplicability,
	TemplateAxisBinding,
	TemplateBlock,
	TemplateColumnRange,
	TemplateLegend,
	TemplateRowRange,
	TemplateSegmentation,
} from "src/cs/workbench/services/template/common/templateSpec";
import type {
	TemplateEditorRecord,
} from "src/cs/workbench/services/template/common/template";
import {
	createEmptyTemplateEditorConfig,
	normalizeTemplateEditorConfigRecord,
	type TemplateEditorConfig,
} from "src/cs/workbench/services/template/common/templateEditorConfig";
import {
	toCellLabel,
} from "src/cs/workbench/services/template/common/templateCellRef";
import { resolveTemplateXRange } from "src/cs/workbench/services/template/common/templateXRange";

export const createTemplateFromEditorRecord = (
	record: TemplateEditorRecord,
): Template | null => {
	const canonicalTemplate = readCanonicalTemplate(record);
	if (canonicalTemplate) {
		return canonicalTemplate;
	}

	const config = normalizeTemplateEditorConfigRecord(record);
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

export const createTemplateEditorRecordFromTemplate = (
	template: Template,
): TemplateEditorRecord => {
	const block = template.blocks[0];
	const config = createEmptyTemplateEditorConfig({
		name: template.name,
		stopOnError: template.stopOnError,
		...(block ? createTemplateEditorConfigFromBlock(block) : {}),
	});

	return {
		...config,
		...(normalizeOptionalText(template.id) ? { id: normalizeOptionalText(template.id) } : {}),
		version: normalizeTemplateVersion(template.version),
		...(template.applicability ? { applicability: template.applicability } : {}),
		template,
	};
};

const readCanonicalTemplate = (
	record: TemplateEditorRecord,
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
	config: TemplateEditorConfig,
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
	config: TemplateEditorConfig,
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

const createTemplateEditorConfigFromBlock = (
	block: TemplateBlock,
): Partial<TemplateEditorConfig> => {
	const xRanges = createTemplateXRangesFromAxis(block.x, block.rowRange);
	const segmentation = getTemplateEditorSegmentationFields(block.segmentation);
	const titles = block.titles;
	return {
		bottomTitle: titles?.bottom ?? "",
		leftTitle: titles?.left ?? "",
		legendPrefix: block.legend.prefix ?? "",
		xColumns: [...block.x.columns],
		xRanges,
		...getTemplateEditorRowFields(block.x, block.rowRange),
		...segmentation,
		xUnit: block.x.unit ?? "V",
		yColumns: [...block.y.columns],
		yLegendTarget: getTemplateEditorLegendTarget(block.legend),
		yUnit: block.y.unit ?? "A",
	};
};

const createTemplateXRangesFromAxis = (
	axis: TemplateAxisBinding,
	rowRange: TemplateRowRange,
) =>
	(axis.ranges?.length ? axis.ranges : axis.columns.map((column): TemplateColumnRange => ({
		column,
		startRow: rowRange.startRow,
		endRow: rowRange.endRow,
	}))).map(range => ({
		start: toCellLabel(range.startRow, range.column),
		end: range.endRow === "end" ? "End" : toCellLabel(range.endRow, range.column),
	}));

const getTemplateEditorRowFields = (
	axis: TemplateAxisBinding,
	rowRange: TemplateRowRange,
): Pick<TemplateEditorConfig, "xDataEnd" | "xDataStart"> => {
	const firstColumn = axis.columns[0] ?? axis.ranges?.[0]?.column ?? 0;
	return {
		xDataStart: toCellLabel(rowRange.startRow, firstColumn),
		xDataEnd: rowRange.endRow === "end" ? "" : toCellLabel(rowRange.endRow, firstColumn),
	};
};

const getTemplateEditorSegmentationFields = (
	segmentation: TemplateSegmentation,
): Pick<TemplateEditorConfig, "xPointsPerGroup" | "xSegmentCount" | "xSegmentationMode"> => {
	switch (segmentation.kind) {
		case "fixedPoints":
			return {
				xPointsPerGroup: String(segmentation.pointsPerGroup),
				xSegmentCount: "",
				xSegmentationMode: "points",
			};
		case "fixedSegments":
			return {
				xPointsPerGroup: "",
				xSegmentCount: String(segmentation.segmentCount),
				xSegmentationMode: "segments",
			};
		case "auto":
		case "none":
			return {
				xPointsPerGroup: "",
				xSegmentCount: "",
				xSegmentationMode: "auto",
			};
	}
};

const getTemplateEditorLegendTarget = (
	legend: TemplateLegend,
): TemplateEditorConfig["yLegendTarget"] =>
	legend.target === "group" || legend.target === "yColumn"
		? legend.target
		: "auto";

const readTemplateApplicability = (
	record: TemplateEditorRecord,
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

const normalizeOptionalText = (value: unknown): string | undefined => {
	const text = String(value ?? "").trim();
	return text || undefined;
};
