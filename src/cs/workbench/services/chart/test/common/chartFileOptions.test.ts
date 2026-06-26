/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
	resolveActiveChartFileOption,
	resolveChartFileOptions,
} from "src/cs/workbench/services/chart/common/chartFileOptions";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/chart/common/chartFileOptions", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("resolveChartFileOptions returns canonical options", () => {
		assert.deepEqual(
			resolveChartFileOptions({
				chartFileOptions: [{ fileId: "record-file", fileName: "record.csv" }],
			}),
			[{ fileId: "record-file", fileName: "record.csv" }],
		);
	});

	test("resolveChartFileOptions returns empty options without canonical input", () => {
		assert.deepEqual(
			resolveChartFileOptions({}),
			[],
		);
	});

	test("resolveActiveChartFileOption falls back to first option", () => {
		assert.deepEqual(
			resolveActiveChartFileOption({
				activeFileId: "missing",
				chartFileOptions: [
					{ fileId: "file-a", fileName: "file-a.csv" },
					{ fileId: "file-b", fileName: "file-b.csv" },
				],
			}),
			{ fileId: "file-a", fileName: "file-a.csv" },
		);
	});

});
