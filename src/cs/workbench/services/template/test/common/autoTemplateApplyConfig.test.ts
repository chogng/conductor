/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	buildAutoTemplateApplyConfig,
	buildAutoWorkerConfig,
	type AutoTemplateApplyPlan,
} from "src/cs/workbench/services/template/common/autoTemplateApplyConfig";
import { AUTO_TEMPLATE_APPLY_CONFIG_FIELD } from "src/cs/workbench/services/template/common/autoTemplate";

suite("workbench/services/template/test/common/autoTemplateApplyConfig", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("serializes legacy auto extraction plans into editable apply configs", () => {
		const config = buildAutoTemplateApplyConfig(createPlan());

		assert.equal(config[AUTO_TEMPLATE_APPLY_CONFIG_FIELD], true);
		assert.equal(config.xDataStart, "D2");
		assert.equal(config.xDataEnd, "");
		assert.deepEqual(config.xColumns, [3]);
		assert.deepEqual(config.xRanges, [{
			start: "D2",
			end: "End",
		}]);
		assert.equal(config.xPointsPerGroup, "4");
		assert.equal(config.xSegmentationMode, "points");
		assert.deepEqual(config.yColumns, [4]);
		assert.equal(config.yLegendStart, "H2");
		assert.equal(config.yLegendCount, "2");
		assert.equal(config.yLegendStep, "0.95");
		assert.equal(config.yLegendTarget, "group");
	});

	test("serializes legacy auto extraction plans into worker configs", () => {
		const config = buildAutoWorkerConfig(createPlan());

		assert.equal(config.autoDetectCurveType, true);
		assert.equal(config.startRow, 1);
		assert.equal(config.endRow, "end");
		assert.equal(config.groupSize, 4);
		assert.equal(config.groups, 2);
		assert.deepEqual(config.seriesBindings, [{ xCol: 3, yCol: 4 }]);
		assert.deepEqual(config.yLegendStartCell, {
			colIndex: 7,
			rowIndex: 1,
		});
		assert.deepEqual(config.blocks, [{
			bottomTitle: "Vg",
			endCol: 4,
			legendStartCell: {
				colIndex: 7,
				rowIndex: 1,
			},
			legendStep: 0.95,
			legendTarget: "group",
			startCol: 3,
			xAxisRole: "vg",
			xCol: 3,
			yCols: [4],
		}]);
	});
});

const createPlan = (): AutoTemplateApplyPlan => ({
	bottomTitle: "Vg",
	blocks: [{
		bottomTitle: "Vg",
		endCol: 4,
		legendStartColIndex: 7,
		legendStartRowIndex: 1,
		legendStep: 0.95,
		legendTarget: "group",
		startCol: 3,
		xAxisRole: "vg",
		xCol: 3,
		yCols: [4],
	}],
	dataStartRowIndex: 1,
	groups: 2,
	leftTitle: "Id",
	legendPrefix: "Vd",
	legendStartColIndex: 7,
	legendStartRowIndex: 1,
	legendStartValue: null,
	legendCount: 2,
	legendStep: 0.95,
	legendTarget: "group",
	xAxisRole: "vg",
	xCol: 3,
	xPointsPerGroup: 4,
	xSegmentationMode: "points",
	xUnit: "V",
	yCols: [4],
	yUnit: "A",
});
