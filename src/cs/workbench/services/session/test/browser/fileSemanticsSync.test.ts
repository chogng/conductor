/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
	getFileAxisSettingsByFileId,
} from "src/cs/workbench/services/session/browser/fileSemanticsSync";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import type { FileRecord } from "src/cs/workbench/services/session/common/sessionModel";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/session/test/browser/fileSemanticsSync", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("builds axis unit settings from settings first, then template records", () => {
		const file = createFileRecord();
		const snapshot = createSnapshot(file);

		const axisSettings = getFileAxisSettingsByFileId({
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
	assessmentsByRawTableId: {},
	curvesByKey: {},
	id: "file-a",
	kind: "unknown",
	latestTemplateRunId: "template-run:file-a",
	measurementBlockOrder: [],
	measurementBlocksById: {},
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
	templateRunsById: {
		"template-run:file-a": {
			appliedAt: 1,
			config: {
				name: "Template",
				stopOnError: true,
				xColumns: [0],
				xDataEnd: 2,
				xDataStart: 1,
				xSegmentationMode: "auto",
				xUnit: "V",
				yColumns: [1],
				yLegendTarget: "auto",
				yUnit: "A",
			},
			configFingerprint: "template",
			errors: [],
			fileId: "file-a",
			id: "template-run:file-a",
			mode: "auto",
			outputCurveKeys: [],
			outputSeriesIds: [],
			selection: { kind: "auto" },
			sourceBlockIds: [],
			warnings: [],
		},
	},
});
