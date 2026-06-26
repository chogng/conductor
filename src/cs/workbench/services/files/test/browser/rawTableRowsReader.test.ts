/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
	readRawTableRows,
} from "src/cs/workbench/services/files/browser/rawTableRowsReader";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/files/test/browser/rawTableRowsReader", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("reads inline raw table rows", async () => {
		const rows = await readRawTableRows({
			rowStore: {
				kind: "memory",
				rows: [["Vg", "Id"], [0, 1e-9]],
			},
		});

		assert.deepEqual(rows, [["Vg", "Id"], ["0", "1e-9"]]);
	});

	test("limits inline raw table rows", async () => {
		const rows = await readRawTableRows({
			maxRows: 2,
			rowStore: {
				kind: "memory",
				rows: [["Vg", "Id"], [0, 1e-9], [1, 2e-9]],
			},
		});

		assert.deepEqual(rows, [["Vg", "Id"], ["0", "1e-9"]]);
	});

	test("reads fallback file rows for external raw table stores", async () => {
		const rows = await readRawTableRows({
			fallbackFile: new File(["\"Vg\",\"Id\"\n0,1e-9"], "converted.csv"),
			fileName: "converted.csv",
			maxRows: 2,
			rowStore: {
				kind: "external",
				normalizedCsvPath: "C:/tmp/converted.csv",
			},
		});

		assert.deepEqual(rows, [["Vg", "Id"], ["0", "1e-9"]]);
	});
});
