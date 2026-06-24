/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { RawTableEvidence } from "src/cs/workbench/services/assessment/common/assessmentEvidence";
import { evaluateRecipeSelector } from "src/cs/workbench/services/templateResolution/common/recipeSelectorEvaluator";
import type {
	MeasurementBlockRecord,
	MeasurementColumnRef,
} from "src/cs/workbench/services/assessment/common/measurement";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/assessment/common/rawTableStructure";
import { builtinRecipes } from "src/cs/workbench/services/recipe/common/builtinRecipes.generated";
import { materializeRecipeTemplate } from "src/cs/workbench/services/templateResolution/common/recipeTemplateMaterializer";

suite("workbench/services/templateResolution/test/common/recipeTemplateMaterializer", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("materializes builtin IV transfer recipe into a block-aware template", () => {
		const recipe = builtinRecipes.find(candidate => candidate.id === "builtin.iv.transfer");
		assert.ok(recipe);

		const evidence = createEvidence();
		const evaluation = evaluateRecipeSelector(recipe, evidence);
		const materializedTemplate = materializeRecipeTemplate({
			recipe,
			evidence,
			evaluation,
		});

		assert.ok(materializedTemplate);
		assert.equal(materializedTemplate.state, "ready");
		assert.equal(materializedTemplate.recipeId, "builtin.iv.transfer");
		assert.equal(materializedTemplate.template.schemaVersion, 1);
		assert.equal(materializedTemplate.template.blocks.length, 1);
		assert.deepEqual(materializedTemplate.template.blocks[0]?.rowRange, {
			startRow: 1,
			endRow: 3,
		});
		assert.deepEqual(materializedTemplate.template.blocks[0]?.x, {
			columns: [0],
			unit: "V",
		});
		assert.deepEqual(materializedTemplate.template.blocks[0]?.y, {
			columns: [1],
			unit: "A",
		});
		assert.equal(materializedTemplate.template.blocks[0]?.segmentation.kind, "auto");
		assert.ok(materializedTemplate.templateFingerprint);
	});
});

const createEvidence = (): RawTableEvidence => ({
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
