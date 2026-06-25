/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { ImportTableModelSeed } from "src/cs/workbench/services/tableModel/common/tableModel";
import { detectMeasurementBlocks } from "src/cs/workbench/services/tableModel/common/blockDetector";

suite("workbench/services/tableModel/common/blockDetector", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("creates a measurement block from table model seed evidence", () => {
		const tableModelSeed: ImportTableModelSeed = {
			curveFamily: "iv",
			curveType: "output (vd)",
			curveTypeConfidence: "high",
			curveTypeNeedsReview: false,
			curveTypeReasons: ["Output graph uses Vd as the x-axis."],
			ivMode: "output",
			xAxisRole: "vd",
			xAxisRoleSource: "metadata",
		};
		const blocks = detectMeasurementBlocks({
			columnCount: 3,
			columnProfile: {
				headerRange: {
					startRow: 0,
					endRow: 0,
					startCol: 0,
					endCol: 2,
				},
				dataRange: {
					startRow: 1,
					endRow: 4,
					startCol: 0,
					endCol: 2,
				},
				columns: [{
					rawCol: 0,
					headerText: "Vd",
					role: "vd",
					unit: "V",
					confidence: 0.82,
				}, {
					rawCol: 1,
					headerText: "Id",
					role: "id",
					unit: "A",
					confidence: 0.82,
				}],
			},
			diagnosticCodes: ["tableModel.reason.1"],
			fileId: "file-a",
			fileName: "output.csv",
			rawTableId: "raw-a",
			rowCount: 5,
			tableModelConfidence: 0.9,
			tableModelSeed,
		});

		assert.equal(blocks.length, 1);
		assert.equal(blocks[0].id, "raw-a:block:0");
		assert.equal(blocks[0].family, "iv");
		assert.equal(blocks[0].ivMode, "output");
		assert.equal(blocks[0].confidence, 0.9);
		assert.deepEqual(blocks[0].source.fullRange, {
			startRow: 0,
			endRow: 4,
			startCol: 0,
			endCol: 2,
		});
		assert.deepEqual(blocks[0].source.dataRange, {
			startRow: 1,
			endRow: 4,
			startCol: 0,
			endCol: 2,
		});
		assert.deepEqual(blocks[0].columns.columns.map(column => ({
			rawCol: column.rawCol,
			role: column.role,
			unit: column.unit,
		})), [{
			rawCol: 0,
			role: "vd",
			unit: "V",
		}, {
			rawCol: 1,
			role: "id",
			unit: "A",
		}]);
		assert.deepEqual(blocks[0].diagnosticCodes, ["tableModel.reason.1"]);
	});
});
