/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { evaluateTableReviewSelector } from "src/cs/workbench/services/review/common/reviewSelector";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/tableModel/common/rawTableStructure";
import type {
	MeasurementBlockRecord,
	MeasurementColumnRef,
} from "src/cs/workbench/services/tableModel/common/measurement";
import { builtinRecipes } from "src/cs/workbench/services/recipe/common/builtinRecipes.generated";
import type { TableReviewEvidence } from "src/cs/workbench/services/review/common/reviewModel";

suite("workbench/services/review/test/common/reviewSelector", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("matches builtin IV transfer recipe against table review evidence", () => {
		const recipe = builtinRecipes.find(candidate => candidate.id === "builtin.iv.transfer");
		assert.ok(recipe);

		const evaluation = evaluateTableReviewSelector(recipe, createTableReviewEvidence({
			family: "iv",
			ivMode: "transfer",
			columns: [{
				rawCol: 0,
				headerText: "Vg",
				role: "vg",
				unit: "V",
			}, {
				rawCol: 1,
				headerText: "Id",
				role: "id",
				unit: "A",
			}],
		}));

		assert.equal(evaluation.matched, true);
		assert.deepEqual(evaluation.matches.map(match => match.blockId), ["block-a"]);
		assert.deepEqual(evaluation.matches[0]?.captures, {
			x: {
				kind: "columns",
				columns: [0],
				unit: "V",
			},
			y: {
				kind: "columns",
				columns: [1],
				unit: "A",
			},
		});
	});

	test("rejects a recipe when required canonical units are missing", () => {
		const recipe = builtinRecipes.find(candidate => candidate.id === "builtin.iv.transfer");
		assert.ok(recipe);

		const evaluation = evaluateTableReviewSelector(recipe, createTableReviewEvidence({
			family: "iv",
			ivMode: "transfer",
			columns: [{
				rawCol: 0,
				headerText: "Vg",
				role: "vg",
				unit: "V",
			}, {
				rawCol: 1,
				headerText: "Id",
				role: "id",
				unit: "mA",
			}],
		}));

		assert.equal(evaluation.matched, false);
		assert.deepEqual(evaluation.diagnosticCodes, ["recipeSelector.columnRoleMismatch"]);
	});
});

const createTableReviewEvidence = ({
	columns,
	family,
	ivMode,
}: {
	readonly columns: readonly MeasurementColumnRef[];
	readonly family: MeasurementBlockRecord["family"];
	readonly ivMode?: MeasurementBlockRecord["ivMode"];
}): TableReviewEvidence => ({
	structure: {
		...createEmptyRawTableStructure(),
		fingerprint: "schema-a",
	},
	columnProfiles: [],
	layoutCandidates: [{
		id: "layout-a",
		layoutKind: "simpleXY",
		confidence: 0.9,
		bindings: [{
			xCol: 0,
			yCols: [1],
		}],
		reasons: [],
	}],
	semanticCandidates: [],
	groups: [],
	blocks: [{
		id: "block-a",
		fileId: "file-a",
		rawTableId: "table-a",
		label: "Block A",
		family,
		ivMode,
		source: {
			fullRange: {
				startRow: 0,
				endRow: 1,
				startCol: 0,
				endCol: 1,
			},
		},
		columns: {
			columns,
		},
		rowCount: 2,
		columnCount: 2,
		confidence: 0.95,
		diagnosticCodes: [],
	}],
	diagnostics: [],
	sourceMetadata: {
		fileName: "transfer.csv",
		rowCount: 2,
		columnCount: 2,
	},
});
