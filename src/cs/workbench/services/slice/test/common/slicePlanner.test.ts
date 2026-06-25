/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	createSlicePlan,
	createSliceTableModelSignature,
} from "src/cs/workbench/services/slice/common/slicePlanner";
import type { Template } from "src/cs/workbench/services/template/common/template";

suite("workbench/services/slice/test/common/slicePlanner", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("creates input ranges from a block-aware template", () => {
		const plan = createSlicePlan({
			ref: {
				fileId: "file-a",
				rawTableId: "table-a",
			},
			mode: "auto",
			selection: { kind: "auto" },
			sourceRawTableVersion: 3,
			sourceTableModelSignature: "tableModel-a",
			template: createTemplate(),
			rowCount: 5,
			columnCount: 3,
		});

		assert.deepEqual(plan.errors, []);
		assert.deepEqual(plan.inputRanges, [{
			fileId: "file-a",
			rawTableId: "table-a",
			range: {
				startRow: 1,
				endRow: 4,
				startCol: 0,
				endCol: 2,
			},
		}]);
		assert.deepEqual(plan.blocks.map(block => ({
			blockIndex: block.blockIndex,
			xColumns: block.xColumns,
			yColumns: block.yColumns,
		})), [{
			blockIndex: 0,
			xColumns: [0],
			yColumns: [1, 2],
		}]);
		assert.ok(plan.templateFingerprint);
	});

	test("reports out-of-bounds template blocks without producing executable ranges", () => {
		const plan = createSlicePlan({
			ref: {
				fileId: "file-a",
				rawTableId: "table-a",
			},
			mode: "manual",
			selection: { kind: "inline", template: createTemplate() },
			sourceRawTableVersion: 1,
			template: {
				...createTemplate(),
				blocks: [{
					...createTemplate().blocks[0]!,
					y: {
						columns: [4],
						unit: "A",
					},
				}],
			},
			rowCount: 5,
			columnCount: 3,
		});

		assert.deepEqual(plan.blocks, []);
		assert.deepEqual(plan.inputRanges, []);
		assert.deepEqual(plan.errors, ["slicePlanner.blockRangeOutOfBounds"]);
	});

	test("includes URI-backed table model versions in table model signatures", () => {
		const baseSignature = createSliceTableModelSignature({
			tableModelRuleVersion: 2,
			schemaProfileVersion: 3,
			sourceRawTableVersion: 4,
		});
		const uriSignature = createSliceTableModelSignature({
			tableModelRuleVersion: 2,
			schemaProfileVersion: 3,
			sourceModelVersion: 6,
			sourceRawTableVersion: 4,
			sourceUri: "file:///workspace/data/source.csv",
			sourceVersion: 5,
		});

		assert.notEqual(baseSignature, uriSignature);
		assert.deepEqual(JSON.parse(uriSignature).sourceModel, {
			modelVersion: 6,
			sourceUri: "file:///workspace/data/source.csv",
			sourceVersion: 5,
		});
	});
});

const createTemplate = (): Template => ({
	schemaVersion: 1,
	name: "Transfer",
	version: 1,
	blocks: [{
		rowRange: {
			startRow: 1,
			endRow: "end",
		},
		x: {
			columns: [0],
			unit: "V",
		},
		y: {
			columns: [1, 2],
			unit: "A",
		},
		segmentation: {
			kind: "auto",
		},
		legend: {
			target: "auto",
		},
	}],
	stopOnError: false,
});
