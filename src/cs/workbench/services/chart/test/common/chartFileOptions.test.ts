/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
	createChartFileOptionsFromRecords,
	resolveActiveChartFileOption,
	resolveChartFileOptions,
} from "src/cs/workbench/services/chart/common/chartFileOptions";
import type { FileRecord } from "src/cs/workbench/services/session/common/sessionModel";
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

	test("createChartFileOptionsFromRecords projects canonical chart files in order", () => {
		assert.deepEqual(
			createChartFileOptionsFromRecords(
				{
					"file-a": createFileRecord("file-a"),
					"file-b": createFileRecord("file-b"),
					"raw-only": createFileRecord("raw-only", false),
					"series-only": createFileRecord("series-only", true, false),
				},
				["file-b", "file-a", "raw-only", "series-only"],
			),
			[
				{
					fileId: "file-b",
					fileName: "file-b.csv",
				},
				{
					fileId: "file-a",
					fileName: "file-a.csv",
				},
			],
		);
	});
});

function createFileRecord(
	fileId: string,
	hasChartData = true,
	hasBaseCurve = hasChartData,
): FileRecord {
	return {
		assessmentsByRawTableId: {},
		curvesByKey: hasBaseCurve
			? {
				"base:iv:transfer:series-a": {
					curveFamily: "iv",
					curveGeneration: "base",
					fileId,
					ivMode: "transfer",
					lineage: {
						baseFamily: "iv",
						baseSeries: { fileId, seriesId: "series-a" },
						curveGeneration: "base",
						ivMode: "transfer",
					},
					points: [{ x: 0, y: 1 }],
					seriesId: "series-a",
					signature: "base-signature",
				},
			}
			: {},
		id: fileId,
		kind: "csv",
		measurementBlockOrder: [],
		measurementBlocksById: {},
		metricsByKey: {},
		name: `${fileId}.csv`,
		raw: {
			fileId,
			fileName: `${fileId}.csv`,
			tableOrder: [],
			tablesById: {},
		},
		rawTableVersionsById: {},
		seriesById: hasChartData
			? {
				"series-a": {
					fileId,
					groupIndex: 0,
					id: "series-a",
					y: [1],
				},
			}
			: {},
		seriesOrder: hasChartData ? ["series-a"] : [],
	};
}
