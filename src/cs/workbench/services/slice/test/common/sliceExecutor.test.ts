/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { executeSlicePlan } from "src/cs/workbench/services/slice/common/sliceExecutor";
import { createSlicePlan } from "src/cs/workbench/services/slice/common/slicePlanner";
import type { Template } from "src/cs/workbench/services/template/common/template";

suite("workbench/services/slice/test/common/sliceExecutor", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("executes fixed point template segmentation as distinct series and curves", () => {
		const resource = URI.file("/workspace/source.csv");
		const template = createTemplate({
			segmentation: {
				kind: "fixedPoints",
				pointsPerGroup: 2,
			},
		});
		const plan = createSlicePlan({
			resource,
			sheetId: "sheet-a",
			mode: "auto",
			selection: { kind: "auto" },
			sourceVersion: 3,
			sourceContentSignature: "source-content-a",
			template,
			templateFingerprint: "template-a",
			rowCount: 5,
			columnCount: 2,
		});

		const result = executeSlicePlan({
			plan,
			rows: [
				["CH1 Voltage", "CH1 Current"],
				["0", "1"],
				["1", "2"],
				["2", "3"],
				["3", "4"],
			],
		});

		assert.deepEqual(result.run.errors, []);
		assert.deepEqual(result.run.warnings, []);
		assert.deepEqual(result.run.outputSeriesIds, [
			"series-b0-s0-y1",
			"series-b0-s1-y1",
		]);
		assert.deepEqual(result.series.map(series => ({
			id: series.id,
			groupIndex: series.groupIndex,
			legendValue: series.legendValue,
			y: series.y,
		})), [{
			id: "series-b0-s0-y1",
			groupIndex: 0,
			legendValue: "#1",
			y: [1, 2],
		}, {
			id: "series-b0-s1-y1",
			groupIndex: 1,
			legendValue: "#2",
			y: [3, 4],
		}]);
		assert.deepEqual(result.curves.map(curve => ({
			seriesId: curve.seriesId,
			points: curve.points,
			signature: curve.signature,
		})), [{
			seriesId: "series-b0-s0-y1",
			points: [{
				x: 0,
				y: 1,
			}, {
				x: 1,
				y: 2,
			}],
			signature: "slice:template-a:series-b0-s0-y1:2",
		}, {
			seriesId: "series-b0-s1-y1",
			points: [{
				x: 2,
				y: 3,
			}, {
				x: 3,
				y: 4,
			}],
			signature: "slice:template-a:series-b0-s1-y1:2",
		}]);
		assert.deepEqual(result.run.outputCurveKeys, [
			"base:iv:transfer:series-b0-s0-y1",
			"base:iv:transfer:series-b0-s1-y1",
		]);
	});

	test("derives resource run ids from resource components after structured clone", () => {
		const resource = URI.file("/workspace/source.xlsx").toJSON() as unknown as URI;
		const plan = createSlicePlan({
			resource,
			sheetId: "sheet-a",
			mode: "manual",
			selection: { kind: "auto" },
			sourceVersion: 7,
			sourceContentSignature: "source-content-a",
			template: createTemplate({
				segmentation: {
					kind: "none",
				},
			}),
			templateFingerprint: "template-a",
			rowCount: 2,
			columnCount: 2,
		});

		const result = executeSlicePlan({
			plan,
			rows: [
				["CH1 Voltage", "CH1 Current"],
				["0", "1"],
			],
		});

		assert.equal(
			result.run.id,
			"slice:resource:file:///workspace/source.xlsx:sheet-a:template-a:7",
		);
		assert.equal(result.run.id.includes("[object Object]"), false);
	});
});

const createTemplate = ({
	segmentation,
}: {
	readonly segmentation: Template["blocks"][number]["segmentation"];
}): Template => ({
	schemaVersion: 1,
	name: "Transfer",
	version: 1,
	measurement: {
		curveFamily: "iv",
		ivMode: "transfer",
	},
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
			columns: [1],
			unit: "A",
		},
		segmentation,
		legend: {
			target: "auto",
		},
	}],
});
