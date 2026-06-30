/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	CreateSlicePlanInput,
	SlicePlan,
	SlicePlanBlock,
	SlicePlanRangeRef,
	SliceMeasurementBinding,
} from "src/cs/workbench/services/slice/common/slice";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type {
	Template,
	TemplateMeasurementBinding,
	TemplateAxisBinding,
	TemplateBlock,
	TemplateSegmentation,
} from "src/cs/workbench/services/template/common/templateSpec";

export const createSlicePlan = (
	input: CreateSlicePlanInput,
): SlicePlan => {
	const templateFingerprint = input.templateFingerprint ?? createTemplateFingerprint(input.template);
	const measurement = toSliceMeasurementBinding(input.template.measurement);
	const blocks: SlicePlanBlock[] = [];
	const inputRanges: SlicePlanRangeRef[] = [];
	const errors: string[] = [];

	input.template.blocks.forEach((block, blockIndex) => {
		if (!isAxisInBounds(block.x, input.columnCount) || !isAxisInBounds(block.y, input.columnCount)) {
			errors.push("slicePlanner.axisOutOfBounds");
			return;
		}

		const segmentedRanges = createBlockInputRanges(input, block);
		if (!segmentedRanges) {
			errors.push("slicePlanner.blockRangeOutOfBounds");
			return;
		}
		if (!segmentedRanges.length) {
			errors.push("slicePlanner.invalidSegmentation");
			return;
		}

		for (const [segmentIndex, range] of segmentedRanges.entries()) {
			inputRanges.push(range);
			blocks.push({
				blockIndex,
				inputRange: range,
				...(segmentedRanges.length > 1 ? { segmentIndex } : {}),
				xColumns: block.x.columns,
				yColumns: block.y.columns,
			});
		}
	});

	if (!blocks.length && !errors.length) {
		errors.push("slicePlanner.noBlocks");
	}

	return {
		resource: input.resource,
		sheetId: input.sheetId ?? null,
		mode: input.mode,
		selection: input.selection,
		...(input.sourceVersion !== undefined ? { sourceVersion: input.sourceVersion } : {}),
		sourceContentSignature: input.sourceContentSignature,
		measurement,
		template: input.template,
		templateFingerprint,
		blocks,
		inputRanges,
		warnings: [],
		errors,
	};
};

const createBlockInputRanges = (
	input: CreateSlicePlanInput,
	block: TemplateBlock,
): readonly SlicePlanRangeRef[] | null => {
	const columns = [...block.x.columns, ...block.y.columns];
	const startCol = Math.min(...columns);
	const endCol = Math.max(...columns);
	const startRow = block.rowRange.startRow;
	const endRow = block.rowRange.endRow === "end"
		? input.rowCount - 1
		: block.rowRange.endRow;
	if (
		!Number.isInteger(startRow) ||
		!Number.isInteger(endRow) ||
		!Number.isInteger(startCol) ||
		!Number.isInteger(endCol) ||
		startRow < 0 ||
		endRow < startRow ||
		startRow >= input.rowCount ||
		endRow >= input.rowCount ||
		startCol < 0 ||
		endCol < startCol ||
		endCol >= input.columnCount
	) {
		return null;
	}

	const ranges = createSegmentedRowRanges({
		endRow,
		segmentation: block.segmentation,
		startRow,
	});
	return ranges.map(range => createPlanRange(input, {
		...range,
		startCol,
		endCol,
	}));
};

const createPlanRange = (
	input: CreateSlicePlanInput,
	range: {
		readonly startRow: number;
		readonly endRow: number;
		readonly startCol: number;
		readonly endCol: number;
	},
): SlicePlanRangeRef => {
	return {
		resource: input.resource,
		sheetId: input.sheetId ?? null,
		range,
	};
};

const createSegmentedRowRanges = ({
	endRow,
	segmentation,
	startRow,
}: {
	readonly endRow: number;
	readonly segmentation: TemplateSegmentation;
	readonly startRow: number;
}): ReadonlyArray<{ readonly startRow: number; readonly endRow: number }> => {
	const rowCount = endRow - startRow + 1;
	if (rowCount <= 0) {
		return [];
	}

	switch (segmentation.kind) {
		case "fixedPoints":
			return createFixedPointRowRanges(startRow, endRow, segmentation.pointsPerGroup);
		case "fixedSegments":
			return createFixedSegmentRowRanges(startRow, endRow, segmentation.segmentCount);
		case "auto":
		case "none":
			return [{
				startRow,
				endRow,
			}];
	}
};

const createFixedPointRowRanges = (
	startRow: number,
	endRow: number,
	pointsPerGroup: number,
): ReadonlyArray<{ readonly startRow: number; readonly endRow: number }> => {
	const groupSize = Math.floor(Number(pointsPerGroup));
	if (!Number.isInteger(groupSize) || groupSize <= 0) {
		return [];
	}

	const ranges: Array<{ readonly startRow: number; readonly endRow: number }> = [];
	for (let segmentStart = startRow; segmentStart <= endRow; segmentStart += groupSize) {
		ranges.push({
			startRow: segmentStart,
			endRow: Math.min(endRow, segmentStart + groupSize - 1),
		});
	}
	return ranges;
};

const createFixedSegmentRowRanges = (
	startRow: number,
	endRow: number,
	segmentCount: number,
): ReadonlyArray<{ readonly startRow: number; readonly endRow: number }> => {
	const requestedSegments = Math.floor(Number(segmentCount));
	if (!Number.isInteger(requestedSegments) || requestedSegments <= 0) {
		return [];
	}

	const rowCount = endRow - startRow + 1;
	const actualSegments = Math.min(requestedSegments, rowCount);
	const baseSize = Math.floor(rowCount / actualSegments);
	const remainder = rowCount % actualSegments;
	const ranges: Array<{ readonly startRow: number; readonly endRow: number }> = [];
	let segmentStart = startRow;
	for (let segmentIndex = 0; segmentIndex < actualSegments; segmentIndex += 1) {
		const segmentSize = baseSize + (segmentIndex < remainder ? 1 : 0);
		const segmentEnd = segmentStart + segmentSize - 1;
		ranges.push({
			startRow: segmentStart,
			endRow: segmentEnd,
		});
		segmentStart = segmentEnd + 1;
	}
	return ranges;
};

const isAxisInBounds = (
	axis: TemplateAxisBinding,
	columnCount: number,
): boolean =>
	axis.columns.length > 0 &&
	axis.columns.every(column => isColumnInBounds(column, columnCount)) &&
	(axis.ranges ?? []).every(range =>
		isColumnInBounds(range.column, columnCount)
	);

const isColumnInBounds = (
	column: number,
	columnCount: number,
): boolean =>
	Number.isInteger(column) &&
	column >= 0 &&
	column < columnCount;

export const createSliceSourceContentSignature = ({
	sourceSheetId,
	sourceModelVersion,
	sourceUri,
	sourceVersion,
}: {
	readonly sourceSheetId?: string | null;
	readonly sourceModelVersion?: number;
	readonly sourceUri?: string;
	readonly sourceVersion?: number;
}, resolution?: {
	readonly reviewSignature?: string;
	readonly templateCatalogVersion?: number;
}): string => JSON.stringify({
	...createSourceContentSignature({
		sourceSheetId,
		sourceModelVersion,
		sourceUri,
		sourceVersion,
	}),
	reviewSignature: normalizeSignatureText(resolution?.reviewSignature),
	templateCatalogVersion: normalizeSignatureInteger(resolution?.templateCatalogVersion),
});

const toSliceMeasurementBinding = (
	measurement: TemplateMeasurementBinding | undefined,
): SliceMeasurementBinding | undefined => {
	if (!measurement) {
		return undefined;
	}

	return {
		curveFamily: measurement.curveFamily,
		...(measurement.ivMode ? { ivMode: measurement.ivMode } : {}),
		...(measurement.itMode ? { itMode: measurement.itMode } : {}),
	};
};

const normalizeSignatureText = (
	value: unknown,
): string | undefined => {
	const normalized = String(value ?? "").trim();
	return normalized || undefined;
};

const normalizeSignatureInteger = (
	value: unknown,
): number | undefined => {
	const normalized = Math.floor(Number(value));
	return Number.isFinite(normalized) && normalized >= 0 ? normalized : undefined;
};

const createSourceContentSignature = ({
	sourceSheetId,
	sourceModelVersion,
	sourceUri,
	sourceVersion,
}: {
	readonly sourceSheetId?: string | null;
	readonly sourceModelVersion?: number;
	readonly sourceUri?: string;
	readonly sourceVersion?: number;
}): { readonly sourceContent?: { readonly sourceModelVersion?: number; readonly sheetId?: string; readonly sourceUri?: string; readonly sourceVersion?: number } } => {
	const normalizedSourceModelVersion = normalizeSignatureInteger(sourceModelVersion);
	const normalizedSheetId = normalizeSignatureText(sourceSheetId);
	const normalizedSourceUri = normalizeSignatureText(sourceUri);
	const normalizedSourceVersion = normalizeSignatureInteger(sourceVersion);
	return normalizedSourceModelVersion !== undefined || normalizedSheetId || normalizedSourceUri || normalizedSourceVersion !== undefined
		? {
				sourceContent: {
					sourceModelVersion: normalizedSourceModelVersion,
					sheetId: normalizedSheetId,
					sourceUri: normalizedSourceUri,
					sourceVersion: normalizedSourceVersion,
				},
			}
		: {};
};
