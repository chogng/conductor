/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	createSlicePlan,
	createSliceTableModelSignature,
} from "src/cs/workbench/services/slice/common/slicePlanner";
import type { Template } from "src/cs/workbench/services/template/common/template";

suite("workbench/services/slice/test/common/slicePlanner", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("creates input ranges from a block-aware template", () => {
		const resource = URI.file("/workspace/source.csv");
		const plan = createSlicePlan({
			target: {
				kind: "uri",
				target: { resource, sheetId: "sheet-a" },
			},
			mode: "auto",
			selection: { kind: "auto" },
			sourceTableModelSignature: "tableModel-a",
			template: createTemplate(),
			rowCount: 5,
			columnCount: 3,
		});

		assert.deepEqual(plan.errors, []);
		assert.deepEqual(plan.inputRanges, [{
			resource,
			sheetId: "sheet-a",
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
		const resource = URI.file("/workspace/source.csv");
		const plan = createSlicePlan({
			target: {
				kind: "uri",
				target: { resource, sheetId: "sheet-a" },
			},
			mode: "manual",
			selection: { kind: "inline", template: createTemplate() },
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
		assert.deepEqual(plan.errors, ["slicePlanner.axisOutOfBounds"]);
	});

	test("creates URI input ranges without raw-table identity", () => {
		const resource = URI.file("/workspace/source.csv");
		const plan = createSlicePlan({
			target: {
				kind: "uri",
				target: {
					resource,
					sheetId: "sheet-a",
				},
			},
			mode: "auto",
			selection: { kind: "auto" },
			sourceVersion: 3,
			sourceTableModelSignature: "tableModel-a",
			template: createTemplate(),
			rowCount: 5,
			columnCount: 3,
		});

		assert.deepEqual(plan.inputRanges, [{
			resource,
			sheetId: "sheet-a",
			range: {
				startRow: 1,
				endRow: 4,
				startCol: 0,
				endCol: 2,
			},
		}]);
	});

	test("expands fixed template segments into executable plan blocks", () => {
		const resource = URI.file("/workspace/source.csv");
		const plan = createSlicePlan({
			target: {
				kind: "uri",
				target: { resource, sheetId: "sheet-a" },
			},
			mode: "auto",
			selection: { kind: "auto" },
			sourceTableModelSignature: "tableModel-a",
			template: {
				...createTemplate(),
				blocks: [{
					...createTemplate().blocks[0]!,
					rowRange: {
						startRow: 1,
						endRow: 5,
					},
					segmentation: {
						kind: "fixedSegments",
						segmentCount: 2,
					},
				}],
			},
			rowCount: 6,
			columnCount: 3,
		});

		assert.deepEqual(plan.errors, []);
		assert.deepEqual(plan.inputRanges.map(inputRange => inputRange.range), [{
			startRow: 1,
			endRow: 3,
			startCol: 0,
			endCol: 2,
		}, {
			startRow: 4,
			endRow: 5,
			startCol: 0,
			endCol: 2,
		}]);
		assert.deepEqual(plan.blocks.map(block => ({
			blockIndex: block.blockIndex,
			segmentIndex: block.segmentIndex,
			range: block.inputRange.range,
		})), [{
			blockIndex: 0,
			segmentIndex: 0,
			range: {
				startRow: 1,
				endRow: 3,
				startCol: 0,
				endCol: 2,
			},
		}, {
			blockIndex: 0,
			segmentIndex: 1,
			range: {
				startRow: 4,
				endRow: 5,
				startCol: 0,
				endCol: 2,
			},
		}]);
	});

	test("includes URI-backed source versions in source signatures", () => {
		const baseSignature = createSliceTableModelSignature({
			sourceUri: "file:///workspace/data/source.csv",
			sourceVersion: 4,
		});
		const uriSignature = createSliceTableModelSignature({
			sourceModelVersion: 6,
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

	test("includes URI sheet targets in source signatures", () => {
		const firstSheetSignature = createSliceTableModelSignature({
			sourceModelVersion: 6,
			sourceSheetId: "sheet-a",
			sourceUri: "file:///workspace/data/source.xlsx",
			sourceVersion: 5,
		});
		const secondSheetSignature = createSliceTableModelSignature({
			sourceModelVersion: 6,
			sourceSheetId: "sheet-b",
			sourceUri: "file:///workspace/data/source.xlsx",
			sourceVersion: 5,
		});

		assert.notEqual(firstSheetSignature, secondSheetSignature);
		assert.deepEqual(JSON.parse(firstSheetSignature).sourceModel, {
			modelVersion: 6,
			sheetId: "sheet-a",
			sourceUri: "file:///workspace/data/source.xlsx",
			sourceVersion: 5,
		});
	});

	test("omits raw-table version from URI-only source signatures", () => {
		const signature = createSliceTableModelSignature({
			sourceModelVersion: 6,
			sourceUri: "file:///workspace/data/source.csv",
			sourceVersion: 5,
		});

		assert.equal(JSON.parse(signature).sourceRawTableVersion, undefined);
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
