/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	areTableSourcesEqual,
	createTableDecorationResource,
	normalizeTableSource,
	parseTableDecorationResource,
	resolveTableColumnDisplayScaleTarget,
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

	test("round trips table decoration resources without losing source identity", () => {
		const resource = URI.from({
			fragment: "table-view",
			path: "/workspace/data/workbook.xlsx",
			query: "revision=2",
			scheme: "table-memory",
		});
		const decorationResource = createTableDecorationResource({
			resource,
			sheetId: " Sheet 1 ",
		});

		assert.ok(decorationResource);
		assert.deepStrictEqual(parseTableDecorationResource(decorationResource), {
			resource,
			sheetId: "Sheet 1",
		});
	});

	test("rejects malformed table decoration resources", () => {
		const resource = URI.from({
			fragment: "conductor.tableDecoration=%",
			path: "/workspace/data/workbook.xlsx",
			scheme: "table-memory",
		});

		assert.equal(parseTableDecorationResource(resource), null);
	});

	test("resolves a unique column display scale target from table selection", () => {
		assert.deepStrictEqual({
			activeCell: resolveTableColumnDisplayScaleTarget({
				activeCell: { colIndex: 3, rowIndex: 4 },
			}),
			multipleColumns: resolveTableColumnDisplayScaleTarget({
				activeCell: { colIndex: 3, rowIndex: 4 },
				selectedColumns: [1, 2],
			}),
			selectedColumn: resolveTableColumnDisplayScaleTarget({
				activeCell: { colIndex: 3, rowIndex: 4 },
				selectedColumns: [1, 1],
			}),
			withoutSelection: resolveTableColumnDisplayScaleTarget({}),
		}, {
			activeCell: 3,
			multipleColumns: null,
			selectedColumn: 1,
			withoutSelection: null,
		});
	});
});
