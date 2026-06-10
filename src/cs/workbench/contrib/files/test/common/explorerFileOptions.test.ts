/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { createExplorerFileOptionsFromRecords } from "src/cs/workbench/contrib/files/common/explorerFileOptions";
import type { FileRecord } from "src/cs/workbench/services/session/common/sessionModel";

suite("workbench/contrib/files/common/explorerFileOptions", () => {
	test("createExplorerFileOptionsFromRecords projects canonical files in order", () => {
		assert.deepEqual(
			createExplorerFileOptionsFromRecords(
				{
					"file-a": createFileRecord("file-a"),
					"file-b": createFileRecord("file-b"),
					"raw-only": createFileRecord("raw-only", false),
				},
				["file-b", "file-a", "raw-only"],
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
	hasAnalysisData = true,
): FileRecord {
	return {
		assessmentsByRawTableId: {},
		curvesByKey: hasAnalysisData
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
		measurementBlockOrder: [],
		measurementBlocksById: {},
		metricsByKey: {},
		raw: {
			fileId,
			fileName: `${fileId}.csv`,
			tableOrder: [],
			tablesById: {},
		},
		rawTableVersionsById: {},
		seriesById: hasAnalysisData
			? {
				"series-a": {
					fileId,
					groupIndex: 0,
					id: "series-a",
					y: [1],
				},
			}
			: {},
		seriesOrder: hasAnalysisData ? ["series-a"] : [],
		templateRunsById: {},
	};
}
