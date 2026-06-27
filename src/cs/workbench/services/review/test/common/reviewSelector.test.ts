/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { evaluateReviewSelector } from "src/cs/workbench/services/review/common/reviewSelector";
import {
	createEmptyTableProjectionStructure,
	type MeasurementBlockRecord,
	type MeasurementColumnRef,
} from "src/cs/workbench/services/table/common/tableProjection";
import { builtinRecipes } from "src/cs/workbench/services/recipe/common/builtinRecipes.generated";
import type { Recipe } from "src/cs/workbench/services/recipe/common/recipe";
import { createRecipeSnapshot } from "src/cs/workbench/services/recipe/common/recipeCodec";
import type { ReviewEvidence } from "src/cs/workbench/services/review/common/reviewModel";

suite("workbench/services/review/test/common/reviewSelector", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("matches builtin IV transfer recipe against review evidence", () => {
		const recipe = getBuiltinRecipe("builtin.iv.transfer");

		const evaluation = evaluateReviewSelector(recipe, createReviewEvidence({
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
		const recipe = getBuiltinRecipe("builtin.iv.transfer");

		const evaluation = evaluateReviewSelector(recipe, createReviewEvidence({
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

const builtinRecipeSnapshot = createRecipeSnapshot(builtinRecipes);

const getBuiltinRecipe = (id: string): Recipe => {
	const recipe = builtinRecipeSnapshot.recipes.find(candidate => candidate.id === id);
	assert.ok(recipe);
	return recipe;
};

const createReviewEvidence = ({
	columns,
	family,
	ivMode,
}: {
	readonly columns: readonly MeasurementColumnRef[];
	readonly family: MeasurementBlockRecord["family"];
	readonly ivMode?: MeasurementBlockRecord["ivMode"];
}): ReviewEvidence => ({
	sourceMetadata: {
		fileName: "transfer.csv",
		rowCount: 2,
		columnCount: 2,
	},
	tableProjection: {
		structure: {
			...createEmptyTableProjectionStructure(),
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
	},
});
