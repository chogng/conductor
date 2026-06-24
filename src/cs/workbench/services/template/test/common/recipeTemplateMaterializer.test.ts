/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { evaluateRecipeSelector } from "src/cs/workbench/services/template/common/recipeSelectorEvaluator";
import type {
	MeasurementBlockRecord,
	MeasurementColumnRef,
} from "src/cs/workbench/services/tableFacts/common/measurement";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/tableFacts/common/rawTableStructure";
import { builtinRecipes } from "src/cs/workbench/services/recipe/common/builtinRecipes.generated";
import { materializeRecipeTemplateDraft } from "src/cs/workbench/services/template/common/recipeTemplateMaterializer";
import type { RawTableFacts } from "src/cs/workbench/services/template/common/tableFacts";

suite("workbench/services/template/test/common/recipeTemplateMaterializer", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("materializes builtin IV transfer recipe into a block-aware template", () => {
		const recipe = builtinRecipes.find(candidate => candidate.id === "builtin.iv.transfer");
		assert.ok(recipe);

		const tableFacts = createTableFacts();
		const evaluation = evaluateRecipeSelector(recipe, tableFacts);
		const draft = materializeRecipeTemplateDraft({
			recipe,
			tableFacts,
			evaluation,
		});

		assert.ok(draft);
		assert.equal(draft.source.kind, "recipe");
		assert.equal(draft.source.kind === "recipe" && draft.source.recipeId, "builtin.iv.transfer");
		assert.equal(draft.derivationDiagnostics.length, 0);
		assert.equal(draft.template.schemaVersion, 1);
		assert.equal(draft.template.blocks.length, 1);
		assert.deepEqual(draft.template.blocks[0]?.rowRange, {
			startRow: 1,
			endRow: 3,
		});
		assert.deepEqual(draft.template.blocks[0]?.x, {
			columns: [0],
			unit: "V",
		});
		assert.deepEqual(draft.template.blocks[0]?.y, {
			columns: [1],
			unit: "A",
		});
		assert.equal(draft.template.blocks[0]?.segmentation.kind, "auto");
		assert.ok(draft.templateFingerprint);
	});
});

const createTableFacts = (): RawTableFacts => ({
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
	blocks: [{
		id: "block-a",
		fileId: "file-a",
		rawTableId: "table-a",
		label: "Transfer",
		family: "iv",
		ivMode: "transfer",
		source: {
			fullRange: {
				startRow: 0,
				endRow: 3,
				startCol: 0,
				endCol: 1,
			},
			dataRange: {
				startRow: 1,
				endRow: 3,
				startCol: 0,
				endCol: 1,
			},
		},
		columns: {
			columns: [
				createColumn(0, "vg", "V"),
				createColumn(1, "id", "A"),
			],
		},
		rowCount: 4,
		columnCount: 2,
		confidence: 0.95,
		diagnosticCodes: [],
	}],
	sourceMetadata: {
		fileId: "file-a",
		rawTableId: "table-a",
		sourceRawTableVersion: 1,
		rowCount: 4,
		columnCount: 2,
	},
});

const createColumn = (
	rawCol: number,
	role: MeasurementColumnRef["role"],
	unit: string,
): MeasurementColumnRef => ({
	rawCol,
	role,
	unit,
	headerText: role,
	confidence: 0.95,
	sourceRange: {
		startRow: 0,
		endRow: 3,
		startCol: rawCol,
		endCol: rawCol,
	},
});
