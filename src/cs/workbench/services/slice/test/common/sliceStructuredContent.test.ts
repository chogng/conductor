/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type {
	StructuredContentGridSnapshot,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import type {
	SlicePlan,
} from "src/cs/workbench/services/slice/common/slice";
import { executeSlicePlan } from "src/cs/workbench/services/slice/common/sliceExecutor";
import {
	createSliceExecutionRowsFromStructuredContent,
} from "src/cs/workbench/services/slice/common/sliceStructuredContent";

suite("workbench/services/slice/test/common/sliceStructuredContent", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("projects sparse Rust numeric runs directly into Slice execution rows", () => {
		const content: StructuredContentGridSnapshot = {
			columnCount: 2,
			columnFacts: [
				{
					column: 0,
					kind: "numeric",
					numericRuns: [{
						endRow: 3,
						pointCount: 3,
						startRow: 1,
						values: Float64Array.from([0, 1, 2]),
					}],
				},
				{
					column: 1,
					kind: "numeric",
					numericRuns: [{
						endRow: 3,
						pointCount: 3,
						startRow: 1,
						values: Float64Array.from([10, 20, 30]),
					}],
				},
			],
			maxCellLengths: [1, 2],
			rowCount: 5,
			rows: [],
			sparseRows: true,
		};
		const plan = createPlan();
		const rows = createSliceExecutionRowsFromStructuredContent(content, plan);
		const execution = executeSlicePlan({ plan, rows });

		assert.deepEqual(rows[1], [0, 10]);
		assert.deepEqual(rows[2], [1, 20]);
		assert.deepEqual(rows[3], [2, 30]);
		assert.deepEqual(execution.curves[0]?.points, [
			{ x: 0, y: 10 },
			{ x: 1, y: 20 },
			{ x: 2, y: 30 },
		]);
	});
});

const createPlan = (): SlicePlan => {
	const resource = URI.file("/workspace/source.csv");
	const inputRange = {
		range: {
			endCol: 1,
			endRow: 3,
			startCol: 0,
			startRow: 1,
		},
		resource,
		sheetId: null,
	};
	return {
		blocks: [{
			blockIndex: 0,
			inputRange,
			xColumns: [0],
			yColumns: [1],
		}],
		errors: [],
		inputRanges: [inputRange],
		measurement: {
			curveFamily: "iv",
			ivMode: "transfer",
		},
		mode: "auto",
		resource,
		selection: { kind: "auto" },
		sheetId: null,
		sourceContentSignature: "content-a",
		sourceVersion: 1,
		template: {
			blocks: [],
			name: "Transfer",
			schemaVersion: 1,
			version: 1,
		},
		templateFingerprint: "template-a",
		warnings: [],
	};
};
