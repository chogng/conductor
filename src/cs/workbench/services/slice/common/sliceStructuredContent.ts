/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	readStructuredContentRows,
	type StructuredContentGridSnapshot,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import type {
	SlicePlan,
} from "src/cs/workbench/services/slice/common/slice";

export const createSliceExecutionRowsFromStructuredContent = (
	content: StructuredContentGridSnapshot,
	plan: SlicePlan,
): readonly (readonly unknown[])[] => {
	const rows: unknown[][] = [];
	if (!content.sparseRows) {
		for (const range of plan.inputRanges) {
			const startRow = range.range.startRow;
			const endRowExclusive = range.range.endRow + 1;
			const rangeRows = readStructuredContentRows(
				content,
				startRow,
				endRowExclusive,
			);
			for (let index = 0; index < rangeRows.length; index += 1) {
				rows[startRow + index] = [...(rangeRows[index] ?? [])];
			}
		}
	}

	const requiredColumns = collectSlicePlanColumns(plan);
	const columnFacts = content.columnFacts?.length === content.columnCount
		? content.columnFacts
		: [];
	for (const range of plan.inputRanges) {
		const startRow = range.range.startRow;
		const endRow = range.range.endRow;
		for (const column of requiredColumns) {
			for (const run of columnFacts[column]?.numericRuns ?? []) {
				const overlapStart = Math.max(startRow, run.startRow);
				const overlapEnd = Math.min(endRow, run.endRow);
				for (
					let rowIndex = overlapStart;
					rowIndex <= overlapEnd;
					rowIndex += 1
				) {
					const value = run.values[rowIndex - run.startRow];
					if (!Number.isFinite(value)) {
						continue;
					}
					const row = rows[rowIndex] ??= [];
					row[column] = value;
				}
			}
		}
	}

	return rows;
};

const collectSlicePlanColumns = (
	plan: SlicePlan,
): readonly number[] => {
	const columns = new Set<number>();
	for (const block of plan.blocks) {
		for (const column of [...block.xColumns, ...block.yColumns]) {
			if (Number.isInteger(column) && column >= 0) {
				columns.add(column);
			}
		}
	}
	return [...columns].sort((left, right) => left - right);
};
