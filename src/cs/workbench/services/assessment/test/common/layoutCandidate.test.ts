/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { createColumnProfiles } from "src/cs/workbench/services/tableFacts/common/columnProfile";
import {
	detectLayoutCandidates,
} from "src/cs/workbench/services/tableFacts/common/layoutCandidate";
import { detectRawTableStructure } from "src/cs/workbench/services/tableFacts/common/rawTableStructure";

suite("workbench/services/assessment/common/layoutCandidate", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("detects adjacent pairwise X/Y columns without semantic roles", () => {
		const rows = [
			["X", "Y", "X", "Y", "X", "Y"],
			["0", "1e-9", "0", "2e-9", "0", "3e-9"],
			["1", "1.1e-9", "1", "2.1e-9", "1", "3.1e-9"],
			["2", "1.2e-9", "2", "2.2e-9", "2", "3.2e-9"],
		];
		const structure = detectRawTableStructure(rows);
		const candidates = detectLayoutCandidates({
			columnProfiles: createColumnProfiles({
				rows,
				structure,
			}),
			structure,
		});

		assert.equal(candidates[0]?.layoutKind, "pairwiseXY");
		assert.ok((candidates[0]?.confidence ?? 0) >= 0.89);
		assert.deepEqual(candidates[0]?.bindings.map(binding => ({
			xCol: binding.xCol,
			yCols: binding.yCols,
		})), [
			{ xCol: 0, yCols: [1] },
			{ xCol: 2, yCols: [3] },
			{ xCol: 4, yCols: [5] },
		]);
	});

	test("detects grouped sweep layout from point and numeric sweep columns", () => {
		const rows = [
			["Repeat", "VAR2", "Point", "CH1 Voltage", "CH1 Current", "CH2 Voltage"],
			["1", "1", "1", "-3", "1e-12", "-60"],
			["1", "1", "2", "-2", "1e-10", "-60"],
			["1", "2", "1", "-3", "2e-12", "-40"],
			["1", "2", "2", "-2", "2e-10", "-40"],
		];
		const structure = detectRawTableStructure(rows);
		const candidates = detectLayoutCandidates({
			columnProfiles: createColumnProfiles({
				rows,
				structure,
			}),
			structure,
		});

		assert.equal(candidates[0]?.layoutKind, "groupedSweep");
		assert.deepEqual(candidates[0]?.bindings.map(binding => ({
			groupByCol: binding.groupByCol,
			pointCol: binding.pointCol,
			xCol: binding.xCol,
			yCols: binding.yCols,
			biasCols: binding.biasCols,
		})), [{
			groupByCol: 1,
			pointCol: 2,
			xCol: 3,
			yCols: [4],
			biasCols: [5],
		}]);
	});

	test("detects wide matrix layout before pairwise numeric columns", () => {
		const rows = [
			["Vg/Vbg", "-2", "-1", "0", "1", "2"],
			["-3", "1e-12", "2e-12", "3e-12", "4e-12", "5e-12"],
			["-2", "1.1e-12", "2.1e-12", "3.1e-12", "4.1e-12", "5.1e-12"],
			["-1", "1.2e-12", "2.2e-12", "3.2e-12", "4.2e-12", "5.2e-12"],
		];
		const structure = detectRawTableStructure(rows);
		const candidates = detectLayoutCandidates({
			columnProfiles: createColumnProfiles({
				rows,
				structure,
			}),
			structure,
		});

		assert.equal(candidates[0]?.layoutKind, "wideMatrix");
		assert.deepEqual(candidates[0]?.bindings.map(binding => ({
			xCol: binding.xCol,
			yCols: binding.yCols,
		})), [{
			xCol: 0,
			yCols: [1, 2, 3, 4, 5],
		}]);
	});

	test("detects time-series layout from a time-like X column", () => {
		const rows = [
			["Time", "Current", "Gate Current"],
			["0", "1e-9", "2e-12"],
			["1", "1.2e-9", "2.1e-12"],
			["2", "1.5e-9", "2.3e-12"],
		];
		const structure = detectRawTableStructure(rows);
		const candidates = detectLayoutCandidates({
			columnProfiles: createColumnProfiles({
				rows,
				structure,
			}),
			structure,
		});

		assert.equal(candidates[0]?.layoutKind, "timeSeries");
		assert.deepEqual(candidates[0]?.bindings.map(binding => ({
			xCol: binding.xCol,
			yCols: binding.yCols,
		})), [{
			xCol: 0,
			yCols: [1, 2],
		}]);
	});
});
