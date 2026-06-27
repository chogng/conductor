/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	Recipe,
	RecipeDiagnostic,
	RecipeSnapshot,
} from "src/cs/workbench/services/recipe/common/recipe";
import type {
	RecipeBlockPartition,
	RecipeDataRange,
	RecipeDomain,
	RecipeGroupRole,
	RecipeRole,
	RecipeRoles,
	RecipeSeriesPartition,
	RecipeWithinBlock,
} from "src/cs/workbench/services/recipe/common/recipeSchema";

type NormalizeRecipeResult = {
	readonly recipes: readonly Recipe[];
	readonly diagnostics: readonly RecipeDiagnostic[];
};

const RECIPE_DATA_RANGE_KINDS = new Set([
	"detectedDataRegion",
]);

const RECIPE_BLOCK_PARTITION_KINDS = new Set([
	"measurementBlocks",
]);

const RECIPE_BLOCK_PARTITION_SELECTS = new Set([
	"each",
	"first",
]);

const RECIPE_PHYSICAL_LAYOUTS = new Set([
	"xy",
	"xyyyy",
	"xyxyxy",
	"blocks.xy",
	"blocks.xyyyy",
]);

const RECIPE_LOGICAL_RELATIONS = new Set([
	"oneX-oneY",
	"oneX-manyY",
	"oneX-oneY-manyGroups",
	"manyXYpairs",
	"manyBlocks-oneX-oneY",
]);

const RECIPE_SERIES_PARTITION_KINDS = new Set([
	"none",
	"groupColumn",
]);

const RECIPE_LAYOUT_EVIDENCE_KINDS = new Set([
	"metadataPreamble",
	"repeatedBlock",
	"groupedSweep",
	"wideMatrix",
	"timeSeries",
	"pairwiseXY",
	"sharedXMultiY",
	"simpleXY",
	"unknown",
]);

const RECIPE_MEASUREMENT_FAMILIES = new Set([
	"iv",
	"cv",
	"cf",
	"pv",
	"it",
	"unknown",
]);

const RECIPE_IV_MODES = new Set([
	"transfer",
	"output",
	"unknown",
]);

const RECIPE_IT_MODES = new Set([
	"stability",
	"transient",
	"retention",
	"unknown",
]);

const RECIPE_COLUMN_ROLES = new Set([
	"vd",
	"vg",
	"vs",
	"id",
	"ig",
	"is",
	"capacitance",
	"conductance",
	"frequency",
	"time",
	"voltage",
	"current",
	"unknown",
]);

const RECIPE_CANONICAL_UNITS = new Set([
	"V",
	"A",
	"ohm",
	"s",
	"F",
	"Hz",
	"S",
]);

const RECIPE_ROLE_CARDINALITIES = new Set([
	"one",
	"oneOrMore",
]);

export const createRecipeSnapshot = (
	recipesInput: readonly unknown[],
	version = 1,
): RecipeSnapshot => {
	const { recipes, diagnostics } = normalizeRecipes(recipesInput);
	return {
		version,
		fingerprint: createRecipeSetFingerprint(recipes),
		recipes,
		diagnostics,
	};
};

export const normalizeRecipes = (
	recipesInput: readonly unknown[],
): NormalizeRecipeResult => {
	const recipes: Recipe[] = [];
	const diagnostics: RecipeDiagnostic[] = [];
	const seenIds = new Set<string>();

	for (const input of recipesInput) {
		const normalized = normalizeRecipe(input);
		diagnostics.push(...normalized.diagnostics);

		for (const recipe of normalized.recipes) {
			const duplicateKey = `${recipe.id}@${recipe.version}`;
			if (seenIds.has(duplicateKey)) {
				diagnostics.push({
					recipeId: recipe.id,
					severity: "error",
					code: "recipe.duplicateIdVersion",
					message: `Duplicate recipe id/version: ${duplicateKey}`,
				});
				continue;
			}

			seenIds.add(duplicateKey);
			recipes.push(recipe);
		}
	}

	return {
		recipes: recipes.sort((left, right) =>
			right.priority - left.priority ||
			left.id.localeCompare(right.id),
		),
		diagnostics,
	};
};

export const createRecipeSetFingerprint = (
	recipes: readonly Recipe[],
): string => `recipe:${hashString(stableStringify(recipes))}`;

export const stableStringify = (value: unknown): string =>
	JSON.stringify(sortJsonValue(value));

const normalizeRecipe = (
	input: unknown,
): {
	readonly recipes: readonly Recipe[];
	readonly diagnostics: readonly RecipeDiagnostic[];
} => {
	if (!isObjectRecord(input)) {
		return {
			recipes: [],
			diagnostics: [{
				severity: "error",
				code: "recipe.invalidRecipe",
				message: "Recipe must be an object.",
			}],
		};
	}

	if (input.variants !== undefined) {
		return normalizeRecipeWithVariants(input);
	}

	return normalizeConcreteRecipe(input);
};

const normalizeConcreteRecipe = (
	input: Record<string, unknown>,
): {
	readonly recipes: readonly Recipe[];
	readonly diagnostics: readonly RecipeDiagnostic[];
} => {
	const diagnostics: RecipeDiagnostic[] = [];
	const id = normalizeText(input.id);
	const version = normalizePositiveInteger(input.version);
	const priority = normalizeFiniteNumber(input.priority);
	const label = normalizeText(input.label);
	const dataRange = isObjectRecord(input.dataRange) ? input.dataRange as RecipeDataRange : null;
	const blockPartition = isObjectRecord(input.blockPartition) ? input.blockPartition as RecipeBlockPartition : null;
	const withinBlock = isObjectRecord(input.withinBlock) ? input.withinBlock as RecipeWithinBlock : null;
	const seriesPartition = readRecipeSeriesPartition(input.seriesPartition);
	const logicalRelation = normalizeText(input.logicalRelation);
	const domain = isObjectRecord(input.domain) ? input.domain as RecipeDomain : undefined;
	const roles = isObjectRecord(input.roles) ? input.roles as RecipeRoles : null;

	if (!id) {
		diagnostics.push(createRecipeDiagnostic(id, "recipe.missingId", "Recipe id is required."));
	}
	if (!version) {
		diagnostics.push(createRecipeDiagnostic(id, "recipe.invalidVersion", "Recipe version must be a positive integer."));
	}
	if (priority === null) {
		diagnostics.push(createRecipeDiagnostic(id, "recipe.invalidPriority", "Recipe priority must be a finite number."));
	}
	if (!label) {
		diagnostics.push(createRecipeDiagnostic(id, "recipe.missingLabel", "Recipe label is required."));
	}

	validateRecipeDataRange(dataRange, diagnostics, id);
	validateRecipeBlockPartition(blockPartition, diagnostics, id);
	validateRecipeWithinBlock(withinBlock, diagnostics, id);
	validateRecipeSeriesPartition(seriesPartition, diagnostics, id);
	validateRecipeLogicalRelation(logicalRelation, diagnostics, id);
	if (domain) {
		validateRecipeDomain(domain, diagnostics, id);
	}
	validateRecipeRoles(roles, diagnostics, id);
	validateRecipeStopOnError(input.stopOnError, diagnostics, id);

	const hasErrors = diagnostics.some(diagnostic => diagnostic.severity === "error");
	if (
		hasErrors ||
		!id ||
		!version ||
		priority === null ||
		!label ||
		!dataRange ||
		!blockPartition ||
		!withinBlock ||
		!seriesPartition ||
		!RECIPE_LOGICAL_RELATIONS.has(logicalRelation) ||
		!roles
	) {
		return { recipes: [], diagnostics };
	}

	return {
		recipes: [{
			id,
			version,
			priority,
			label,
			dataRange,
			blockPartition,
			withinBlock,
			seriesPartition,
			logicalRelation: logicalRelation as Recipe["logicalRelation"],
			...(domain ? { domain } : {}),
			roles,
			...(typeof input.stopOnError === "boolean" ? { stopOnError: input.stopOnError } : {}),
		}],
		diagnostics,
	};
};

const normalizeRecipeWithVariants = (
	input: Record<string, unknown>,
): {
	readonly recipes: readonly Recipe[];
	readonly diagnostics: readonly RecipeDiagnostic[];
} => {
	const diagnostics: RecipeDiagnostic[] = [];
	const id = normalizeText(input.id);
	const version = normalizePositiveInteger(input.version);
	const dataRange = isObjectRecord(input.dataRange) ? input.dataRange as RecipeDataRange : null;
	const blockPartition = isObjectRecord(input.blockPartition) ? input.blockPartition as RecipeBlockPartition : null;
	const withinBlock = isObjectRecord(input.withinBlock) ? input.withinBlock as RecipeWithinBlock : null;
	const seriesPartition = readRecipeSeriesPartition(input.seriesPartition);
	const logicalRelation = normalizeText(input.logicalRelation);
	const domain = isObjectRecord(input.domain) ? input.domain as RecipeDomain : undefined;
	const roles = input.roles === undefined
		? undefined
		: isObjectRecord(input.roles)
			? input.roles as RecipeRoles
			: null;
	const priority = input.priority === undefined ? undefined : normalizeFiniteNumber(input.priority);
	const label = input.label === undefined ? undefined : normalizeText(input.label);
	const variants = Array.isArray(input.variants) ? input.variants : null;

	if (!id) {
		diagnostics.push(createRecipeDiagnostic(id, "recipe.missingId", "Recipe id is required."));
	}
	if (!version) {
		diagnostics.push(createRecipeDiagnostic(id, "recipe.invalidVersion", "Recipe version must be a positive integer."));
	}
	if (input.priority !== undefined && priority === null) {
		diagnostics.push(createRecipeDiagnostic(id, "recipe.invalidPriority", "Recipe priority must be a finite number."));
	}
	if (input.label !== undefined && !label) {
		diagnostics.push(createRecipeDiagnostic(id, "recipe.missingLabel", "Recipe label is required."));
	}

	validateRecipeDataRange(dataRange, diagnostics, id);
	validateRecipeBlockPartition(blockPartition, diagnostics, id);
	validateRecipeWithinBlock(withinBlock, diagnostics, id);
	validateRecipeSeriesPartition(seriesPartition, diagnostics, id);
	validateRecipeLogicalRelation(logicalRelation, diagnostics, id);
	if (domain) {
		validateRecipeDomain(domain, diagnostics, id);
	}
	if (roles !== undefined) {
		validateRecipeRoles(roles, diagnostics, id);
	}
	validateRecipeStopOnError(input.stopOnError, diagnostics, id);

	if (!variants || variants.length === 0) {
		diagnostics.push(createRecipeDiagnostic(id, "recipe.invalidVariants", "Recipe variants must be a non-empty array."));
	}

	const baseHasErrors = diagnostics.some(diagnostic => diagnostic.severity === "error");
	const recipes: Recipe[] = [];
	if (!variants) {
		return { recipes, diagnostics };
	}

	for (const variantInput of variants) {
		if (!isObjectRecord(variantInput)) {
			diagnostics.push(createRecipeDiagnostic(id, "recipe.invalidVariant", "Recipe variant must be an object."));
			continue;
		}

		const variantDiagnosticsStart = diagnostics.length;
		const variantId = normalizeText(variantInput.id);
		const variantRecipeId = variantId || id;
		const variantPriority = variantInput.priority === undefined ? priority : normalizeFiniteNumber(variantInput.priority);
		const variantLabel = variantInput.label === undefined ? label : normalizeText(variantInput.label);
		const variantBlockPartition = variantInput.blockPartition === undefined
			? blockPartition
			: isObjectRecord(variantInput.blockPartition)
				? variantInput.blockPartition as RecipeBlockPartition
				: null;
		const variantSeriesPartition = variantInput.seriesPartition === undefined
			? seriesPartition
			: readRecipeSeriesPartition(variantInput.seriesPartition);
		const variantLogicalRelation = variantInput.logicalRelation === undefined
			? logicalRelation
			: normalizeText(variantInput.logicalRelation);
		const variantDomain = isObjectRecord(variantInput.domain) ? variantInput.domain as RecipeDomain : undefined;
		const mergedDomain = mergeRecipeDomain(domain, variantDomain);
		const variantRoles = variantInput.roles === undefined
			? roles
			: isObjectRecord(variantInput.roles)
				? variantInput.roles as RecipeRoles
				: null;
		const variantStopOnError = typeof variantInput.stopOnError === "boolean"
			? variantInput.stopOnError
			: typeof input.stopOnError === "boolean"
				? input.stopOnError
				: undefined;

		if (!variantId) {
			diagnostics.push(createRecipeDiagnostic(variantRecipeId, "recipe.missingVariantId", "Recipe variant id is required."));
		}
		if (variantPriority === undefined || variantPriority === null) {
			diagnostics.push(createRecipeDiagnostic(variantRecipeId, "recipe.invalidPriority", "Recipe priority must be a finite number."));
		}
		if (!variantLabel) {
			diagnostics.push(createRecipeDiagnostic(variantRecipeId, "recipe.missingLabel", "Recipe label is required."));
		}
		validateRecipeBlockPartition(variantBlockPartition, diagnostics, variantRecipeId);
		validateRecipeSeriesPartition(variantSeriesPartition, diagnostics, variantRecipeId);
		validateRecipeLogicalRelation(variantLogicalRelation, diagnostics, variantRecipeId);
		if (mergedDomain) {
			validateRecipeDomain(mergedDomain, diagnostics, variantRecipeId);
		}
		validateRecipeRoles(variantRoles ?? null, diagnostics, variantRecipeId);
		validateRecipeStopOnError(variantInput.stopOnError, diagnostics, variantRecipeId);

		const variantHasErrors = diagnostics
			.slice(variantDiagnosticsStart)
			.some(diagnostic => diagnostic.severity === "error");
		if (
			baseHasErrors ||
			variantHasErrors ||
			!variantId ||
			!version ||
			variantPriority === undefined ||
			variantPriority === null ||
			!variantLabel ||
			!dataRange ||
			!variantBlockPartition ||
			!withinBlock ||
			!variantSeriesPartition ||
			!RECIPE_LOGICAL_RELATIONS.has(variantLogicalRelation) ||
			!variantRoles
		) {
			continue;
		}

		recipes.push({
			id: variantId,
			version,
			priority: variantPriority,
			label: variantLabel,
			dataRange,
			blockPartition: variantBlockPartition,
			withinBlock,
			seriesPartition: variantSeriesPartition,
			logicalRelation: variantLogicalRelation as Recipe["logicalRelation"],
			...(mergedDomain ? { domain: mergedDomain } : {}),
			roles: variantRoles,
			...(variantStopOnError !== undefined ? { stopOnError: variantStopOnError } : {}),
		});
	}

	return { recipes, diagnostics };
};

const validateRecipeDataRange = (
	dataRange: RecipeDataRange | null,
	diagnostics: RecipeDiagnostic[],
	recipeId: string,
): void => {
	if (!dataRange || !RECIPE_DATA_RANGE_KINDS.has(String(dataRange.kind))) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidDataRange", "Recipe dataRange is invalid."));
	}
};

const validateRecipeBlockPartition = (
	blockPartition: RecipeBlockPartition | null,
	diagnostics: RecipeDiagnostic[],
	recipeId: string,
): void => {
	if (!blockPartition || !RECIPE_BLOCK_PARTITION_KINDS.has(String(blockPartition.kind))) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidBlockPartition", "Recipe blockPartition is invalid."));
		return;
	}
	if (!RECIPE_BLOCK_PARTITION_SELECTS.has(String(blockPartition.select))) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidBlockPartitionSelect", "Recipe blockPartition.select is invalid."));
	}
	if (!isOptionalConfidence(blockPartition.minConfidence)) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidBlockPartitionConfidence", "Recipe blockPartition.minConfidence must be between 0 and 1."));
	}
};

const validateRecipeWithinBlock = (
	withinBlock: RecipeWithinBlock | null,
	diagnostics: RecipeDiagnostic[],
	recipeId: string,
): void => {
	if (!withinBlock) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidWithinBlock", "Recipe withinBlock is required."));
		return;
	}
	if (!RECIPE_PHYSICAL_LAYOUTS.has(String(withinBlock.physicalLayout))) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidPhysicalLayout", "Recipe withinBlock.physicalLayout is invalid."));
	}
	if (withinBlock.rowRange !== "block.dataRange") {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidWithinBlockRowRange", "Recipe withinBlock.rowRange must use block.dataRange."));
	}
};

const readRecipeSeriesPartition = (
	value: unknown,
): RecipeSeriesPartition | null => {
	if (value === undefined) {
		return { kind: "none" };
	}
	return isObjectRecord(value) ? value as RecipeSeriesPartition : null;
};

const validateRecipeSeriesPartition = (
	seriesPartition: RecipeSeriesPartition | null,
	diagnostics: RecipeDiagnostic[],
	recipeId: string,
): void => {
	if (!seriesPartition || !RECIPE_SERIES_PARTITION_KINDS.has(String(seriesPartition.kind))) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidSeriesPartition", "Recipe seriesPartition is invalid."));
		return;
	}
	if (
		seriesPartition.kind === "groupColumn" &&
		seriesPartition.layoutKind !== undefined &&
		!RECIPE_LAYOUT_EVIDENCE_KINDS.has(String(seriesPartition.layoutKind))
	) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidSeriesPartitionLayout", "Recipe seriesPartition.layoutKind is invalid."));
	}
	if (
		seriesPartition.kind === "groupColumn" &&
		!isOptionalConfidence(seriesPartition.minConfidence)
	) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidSeriesPartitionConfidence", "Recipe seriesPartition.minConfidence must be between 0 and 1."));
	}
};

const validateRecipeLogicalRelation = (
	logicalRelation: string,
	diagnostics: RecipeDiagnostic[],
	recipeId: string,
): void => {
	if (!RECIPE_LOGICAL_RELATIONS.has(logicalRelation)) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidLogicalRelation", "Recipe logicalRelation is invalid."));
	}
};

const validateRecipeDomain = (
	domain: RecipeDomain,
	diagnostics: RecipeDiagnostic[],
	recipeId: string,
): void => {
	if (domain.family !== undefined && !RECIPE_MEASUREMENT_FAMILIES.has(String(domain.family))) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidDomainFamily", "Recipe domain.family is invalid."));
	}
	if (domain.ivMode !== undefined && !RECIPE_IV_MODES.has(String(domain.ivMode))) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidDomainIvMode", "Recipe domain.ivMode is invalid."));
	}
	if (domain.itMode !== undefined && !RECIPE_IT_MODES.has(String(domain.itMode))) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidDomainItMode", "Recipe domain.itMode is invalid."));
	}
	if (!isOptionalConfidence(domain.minConfidence)) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidDomainConfidence", "Recipe domain.minConfidence must be between 0 and 1."));
	}
};

const mergeRecipeDomain = (
	base: RecipeDomain | undefined,
	variant: RecipeDomain | undefined,
): RecipeDomain | undefined =>
	base || variant
		? {
			...base,
			...variant,
		}
		: undefined;

const validateRecipeRoles = (
	roles: RecipeRoles | null,
	diagnostics: RecipeDiagnostic[],
	recipeId: string,
): void => {
	if (!roles) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidRoles", "Recipe roles are required."));
		return;
	}

	validateRecipeRole(roles.x, diagnostics, recipeId, "x");
	validateRecipeRole(roles.y, diagnostics, recipeId, "y");
	if (roles.group !== undefined) {
		validateRecipeGroupRole(roles.group, diagnostics, recipeId);
	}
};

const validateRecipeRole = (
	role: RecipeRole | undefined,
	diagnostics: RecipeDiagnostic[],
	recipeId: string,
	roleName: string,
): void => {
	if (!role || !isValidRoleList(role.roleAny)) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidRole", `Recipe role ${roleName} is invalid.`));
		return;
	}
	if (!RECIPE_ROLE_CARDINALITIES.has(String(role.count))) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidRoleCount", `Recipe role ${roleName} count is invalid.`));
	}
	if (role.canonicalUnit !== undefined && !RECIPE_CANONICAL_UNITS.has(String(role.canonicalUnit))) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidRoleUnit", `Recipe role ${roleName} canonicalUnit is invalid.`));
	}
	if (!isOptionalConfidence(role.minConfidence)) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidRoleConfidence", `Recipe role ${roleName} minConfidence must be between 0 and 1.`));
	}
};

const validateRecipeGroupRole = (
	role: RecipeGroupRole,
	diagnostics: RecipeDiagnostic[],
	recipeId: string,
): void => {
	if (role.roleAny !== undefined && !isValidRoleList(role.roleAny)) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidGroupRole", "Recipe group roleAny is invalid."));
	}
	if (role.count !== undefined && !RECIPE_ROLE_CARDINALITIES.has(String(role.count))) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidGroupRoleCount", "Recipe group count is invalid."));
	}
	if (role.canonicalUnit !== undefined && !RECIPE_CANONICAL_UNITS.has(String(role.canonicalUnit))) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidGroupRoleUnit", "Recipe group canonicalUnit is invalid."));
	}
	if (!isOptionalConfidence(role.minConfidence)) {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidGroupRoleConfidence", "Recipe group minConfidence must be between 0 and 1."));
	}
};

const validateRecipeStopOnError = (
	value: unknown,
	diagnostics: RecipeDiagnostic[],
	recipeId: string,
): void => {
	if (value !== undefined && typeof value !== "boolean") {
		diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidStopOnError", "Recipe stopOnError must be a boolean."));
	}
};

const isValidRoleList = (
	value: unknown,
): boolean =>
	Array.isArray(value) &&
	value.length > 0 &&
	value.every(role => RECIPE_COLUMN_ROLES.has(String(role)));

const isOptionalConfidence = (
	value: unknown,
): boolean =>
	value === undefined ||
	(typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);

const createRecipeDiagnostic = (
	recipeId: string,
	code: string,
	message: string,
): RecipeDiagnostic => ({
	recipeId: recipeId || undefined,
	severity: "error",
	code,
	message,
});

const sortJsonValue = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return value.map(sortJsonValue);
	}
	if (!value || typeof value !== "object") {
		return value;
	}

	const result: Record<string, unknown> = {};
	for (const key of Object.keys(value).sort()) {
		const entry = (value as Record<string, unknown>)[key];
		if (entry !== undefined) {
			result[key] = sortJsonValue(entry);
		}
	}
	return result;
};

const hashString = (value: string): string => {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}

	return (hash >>> 0).toString(36);
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeText = (value: unknown): string =>
	typeof value === "string" ? value.trim() : "";

const normalizePositiveInteger = (value: unknown): number | null => {
	const numberValue = Number(value);
	return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
};

const normalizeFiniteNumber = (value: unknown): number | null => {
	const numberValue = Number(value);
	return Number.isFinite(numberValue) ? numberValue : null;
};
