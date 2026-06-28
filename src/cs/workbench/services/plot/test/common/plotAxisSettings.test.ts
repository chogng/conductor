/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { getPlotFileAxisSettings } from "src/cs/workbench/services/plot/common/plotAxisSettings";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import type { FileRecord } from "src/cs/workbench/services/session/common/sessionModel";

suite("workbench/services/plot/test/common/plotAxisSettings", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("builds axis unit settings from settings first, then template records", () => {
		const file = createFileRecord();
		const snapshot = createSnapshot(file);

		const axisSettings = getPlotFileAxisSettings({
			axisSettings: {
				xUnitByFileId: { "file-a": "mV" },
				yScaleByFileId: { "file-a": "log" },
			},
			snapshot,
		});

		assert.deepEqual(axisSettings, {
			xUnitByFileId: { "file-a": "mV" },
			yScaleByFileId: { "file-a": "log" },
			yUnitByFileId: { "file-a": "A" },
		});
	});
});

const createSnapshot = (file: FileRecord): SessionSnapshot => ({
	fileOrder: [file.id],
	filesById: {
		[file.id]: file,
	},
	schemaVersion: 1,
	sessionVersion: 1,
});

const createFileRecord = (): FileRecord => ({
	curvesByKey: {},
	id: "file-a",
	kind: "unknown",
	metricsByKey: {},
	name: "raw.csv",
	raw: {
		fileId: "file-a",
		fileName: "raw.csv",
		tableOrder: [],
		tablesById: {},
	},
	rawTableVersionsById: {},
	seriesById: {},
	seriesOrder: ["series-a"],
	latestSliceRunId: "template-run:file-a",
	sliceRunsById: {
		"template-run:file-a": {
			fileId: "file-a",
			id: "template-run:file-a",
			mode: "auto",
			rawTableId: "file-a",
			selection: { kind: "auto" },
			sourceRawTableVersion: 0,
			template: {
				schemaVersion: 1,
				name: "Template",
				version: 1,
				stopOnError: true,
				blocks: [{
					rowRange: { startRow: 1, endRow: 2 },
					x: { columns: [0], unit: "V" },
					y: { columns: [1], unit: "A" },
					segmentation: { kind: "auto" },
					legend: { target: "auto" },
				}],
			},
			templateFingerprint: "template",
			inputRanges: [],
			outputCurveKeys: [],
			outputSeriesIds: [],
			warnings: [],
			errors: [],
		},
	},
});
