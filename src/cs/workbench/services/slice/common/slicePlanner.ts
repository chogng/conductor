/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	CreateSlicePlanInput,
	SlicePlan,
	SlicePlanBlock,
	SliceRawTableRangeRef,
} from "src/cs/workbench/services/slice/common/slice";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type {
	Template,
	TemplateAxisBinding,
	TemplateBlock,
} from "src/cs/workbench/services/template/common/templateSpec";

export const createSlicePlan = (
	input: CreateSlicePlanInput,
): SlicePlan => {
	const templateFingerprint = input.templateFingerprint ?? createTemplateFingerprint(input.template);
	const blocks: SlicePlanBlock[] = [];
	const inputRanges: SliceRawTableRangeRef[] = [];
	const errors: string[] = [];

	input.template.blocks.forEach((block, blockIndex) => {
		const range = createBlockInputRange(input, block);
		if (!range) {
			errors.push("slicePlanner.blockRangeOutOfBounds");
			return;
		}
		if (!isAxisInBounds(block.x, input.columnCount) || !isAxisInBounds(block.y, input.columnCount)) {
			errors.push("slicePlanner.axisOutOfBounds");
			return;
		}

		inputRanges.push(range);
		blocks.push({
			blockIndex,
			inputRange: range,
			xColumns: block.x.columns,
			yColumns: block.y.columns,
		});
	});

	if (!blocks.length && !errors.length) {
		errors.push("slicePlanner.noBlocks");
	}

	return {
		ref: input.ref,
		mode: input.mode,
		selection: input.selection,
		sourceRawTableVersion: input.sourceRawTableVersion,
		sourceAssessmentSignature: input.sourceAssessmentSignature,
		measurement: input.measurement,
		template: input.template,
		templateFingerprint,
		blocks,
		inputRanges,
		warnings: [],
		errors,
	};
};

const createBlockInputRange = (
	input: CreateSlicePlanInput,
	block: TemplateBlock,
): SliceRawTableRangeRef | null => {
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

	return {
		fileId: input.ref.fileId,
		rawTableId: input.ref.rawTableId,
		range: {
			startRow,
			endRow,
			startCol,
			endCol,
		},
	};
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

export const createSliceAssessmentSignature = ({
	assessmentRuleVersion,
	schemaProfileVersion,
	sourceRawTableVersion,
}: {
	readonly assessmentRuleVersion: number;
	readonly schemaProfileVersion: number;
	readonly sourceRawTableVersion: number;
}, resolution?: {
	readonly recipeFingerprint?: string;
	readonly reviewSignature?: string;
	readonly templateCatalogVersion?: number;
}): string => JSON.stringify({
	assessmentRuleVersion,
	schemaProfileVersion,
	sourceRawTableVersion,
	recipeFingerprint: normalizeSignatureText(resolution?.recipeFingerprint),
	reviewSignature: normalizeSignatureText(resolution?.reviewSignature),
	templateCatalogVersion: normalizeSignatureInteger(resolution?.templateCatalogVersion),
});

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
