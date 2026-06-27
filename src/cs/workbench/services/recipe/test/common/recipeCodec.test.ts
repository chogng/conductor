/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { builtinRecipes } from "src/cs/workbench/services/recipe/common/builtinRecipes.generated";
import {
	createRecipeSnapshot,
	normalizeRecipes,
} from "src/cs/workbench/services/recipe/common/recipeCodec";

suite("workbench/services/recipe/test/common/recipeCodec", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("normalizes builtin derivation recipes into a fingerprinted snapshot", () => {
		const snapshot = createRecipeSnapshot(builtinRecipes);

		assert.equal(snapshot.version, 1);
		assert.equal(snapshot.diagnostics.length, 0);
		assert.deepEqual(snapshot.recipes.map(recipe => recipe.id), [
			"builtin.iv.transfer.x-y-group",
			"builtin.iv.output.x-y-group",
			"builtin.iv.transfer",
			"builtin.iv.output",
			"builtin.capacitance.cf",
			"builtin.capacitance.cv",
			"builtin.currentTime.it",
		]);
		assert.equal(snapshot.fingerprint.startsWith("recipe:"), true);
	});

	test("rejects malformed recipe staging fields", () => {
		const result = normalizeRecipes([{
			...createRecipe(),
			label: "",
			dataRange: {
				kind: "table",
			},
			blockPartition: {
				kind: "rows",
				select: "all",
				minConfidence: 2,
			},
			withinBlock: {
				physicalLayout: "simpleXY",
				rowRange: "table.dataRange",
			},
			logicalRelation: "groupedXY",
			stopOnError: "yes",
		}]);

		assert.deepEqual(result.recipes, []);
		assert.deepEqual(result.diagnostics.map(diagnostic => diagnostic.code), [
			"recipe.missingLabel",
			"recipe.invalidDataRange",
			"recipe.invalidBlockPartition",
			"recipe.invalidPhysicalLayout",
			"recipe.invalidWithinBlockRowRange",
			"recipe.invalidLogicalRelation",
			"recipe.invalidStopOnError",
		]);
	});

	test("rejects malformed domain and role fields", () => {
		const result = normalizeRecipes([{
			...createRecipe(),
			domain: {
				family: "transistor",
				ivMode: "sweep",
				itMode: "hold",
				minConfidence: -1,
			},
			roles: {
				x: {
					roleAny: ["mystery"],
					canonicalUnit: "watts",
					count: "maybe",
					minConfidence: 1.5,
				},
				y: {
					roleAny: [],
					count: "one",
				},
				group: {
					roleAny: ["group"],
					canonicalUnit: "count",
					count: "optional",
					minConfidence: 1.5,
				},
			},
		}]);

		assert.deepEqual(result.recipes, []);
		assert.deepEqual(result.diagnostics.map(diagnostic => diagnostic.code), [
			"recipe.invalidDomainFamily",
			"recipe.invalidDomainIvMode",
			"recipe.invalidDomainItMode",
			"recipe.invalidDomainConfidence",
			"recipe.invalidRole",
			"recipe.invalidRole",
			"recipe.invalidGroupRole",
			"recipe.invalidGroupRoleCount",
			"recipe.invalidGroupRoleUnit",
			"recipe.invalidGroupRoleConfidence",
		]);
	});

	test("rejects duplicate recipe id/version pairs", () => {
		const result = normalizeRecipes([
			createRecipe(),
			createRecipe(),
		]);

		assert.deepEqual(result.recipes.map(recipe => recipe.id), ["workspace.valid"]);
		assert.deepEqual(result.diagnostics.map(diagnostic => diagnostic.code), [
			"recipe.duplicateIdVersion",
		]);
	});

	test("expands physical layout variants into concrete recipes", () => {
		const baseRecipe = createRecipe();
		const result = normalizeRecipes([{
			id: "workspace.iv.xy",
			version: 1,
			dataRange: baseRecipe.dataRange,
			blockPartition: baseRecipe.blockPartition,
			withinBlock: baseRecipe.withinBlock,
			logicalRelation: baseRecipe.logicalRelation,
			variants: [{
				id: "workspace.iv.transfer",
				priority: 100,
				label: "Workspace Transfer",
				domain: baseRecipe.domain,
				roles: baseRecipe.roles,
			}, {
				id: "workspace.iv.output",
				priority: 90,
				label: "Workspace Output",
				domain: {
					family: "iv",
					ivMode: "output",
					minConfidence: 0.75,
				},
				roles: {
					...baseRecipe.roles,
					x: {
						roleAny: ["vd", "voltage"],
						canonicalUnit: "V",
						count: "one",
					},
				},
			}],
		}]);

		assert.deepEqual(result.diagnostics, []);
		assert.deepEqual(result.recipes.map(recipe => recipe.id), [
			"workspace.iv.transfer",
			"workspace.iv.output",
		]);
		assert.deepEqual(result.recipes.map(recipe => recipe.withinBlock.physicalLayout), [
			"xy",
			"xy",
		]);
	});
});

const createRecipe = () => ({
	id: "workspace.valid",
	version: 1,
	priority: 1,
	label: "Workspace Valid",
	dataRange: {
		kind: "detectedDataRegion",
	},
	blockPartition: {
		kind: "measurementBlocks",
		select: "each",
	},
	withinBlock: {
		physicalLayout: "xy",
		rowRange: "block.dataRange",
	},
	logicalRelation: "oneX-oneY",
	domain: {
		family: "iv",
		ivMode: "transfer",
		minConfidence: 0.75,
	},
	roles: {
		x: {
			roleAny: ["vg", "voltage"],
			canonicalUnit: "V",
			count: "one",
		},
		y: {
			roleAny: ["id", "current"],
			canonicalUnit: "A",
			count: "one",
		},
	},
});
