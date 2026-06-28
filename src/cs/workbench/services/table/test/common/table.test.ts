/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	areTableSourcesEqual,
	normalizeTableSource,
	toTableSheetKey,
} from "src/cs/workbench/services/table/common/table";

suite("workbench/services/table/test/common/table", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("normalizes resource-backed table sources", () => {
		const resource = URI.file("/workspace/data/workbook.xlsx");

		assert.deepStrictEqual(normalizeTableSource({
			resource,
			sheetId: " Sheet 1 ",
		}), {
			resource,
			sheetId: "Sheet 1",
		});
		assert.equal(normalizeTableSource({ resource: null }), null);
	});

	test("keys table sources by resource and optional sheet id", () => {
		const resource = URI.file("/workspace/data/workbook.xlsx");

		assert.equal(toTableSheetKey({ resource }), resource.toString());
		assert.equal(
			toTableSheetKey({ resource, sheetId: "2:Reverse" }),
			`${resource.toString()}::2%3AReverse`,
		);
	});

	test("compares table sources by resource and sheet id", () => {
		const resource = URI.file("/workspace/data/workbook.xlsx");

		assert.equal(areTableSourcesEqual(
			{ resource, sheetId: "Forward" },
			{ resource, sheetId: "Forward" },
		), true);
		assert.equal(areTableSourcesEqual(
			{ resource, sheetId: "Forward" },
			{ resource, sheetId: "Reverse" },
		), false);
	});
});
