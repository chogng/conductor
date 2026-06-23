/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
  RecipeColumnExpression,
  RecipeValueExpression,
} from "src/cs/workbench/services/recipe/common/recipeProjection";
import type {
  Recipe,
  RecipeDiagnostic,
  RecipeSnapshot,
} from "src/cs/workbench/services/recipe/common/recipe";
import type {
  RecipeSelector,
  RecipeSelectorPredicate,
} from "src/cs/workbench/services/recipe/common/recipeSelector";

type NormalizeRecipeResult = {
  readonly recipes: readonly Recipe[];
  readonly diagnostics: readonly RecipeDiagnostic[];
};

const RECIPE_SELECTOR_PREDICATE_KINDS = new Set([
  "blockFamily",
  "blockMode",
  "columnRole",
  "canonicalUnit",
  "layoutEvidence",
  "sourceHint",
  "schemaFingerprint",
]);

const RECIPE_VALUE_EXPRESSION_KINDS = new Set([
  "literal",
  "capturedCommonUnit",
  "matchedBlockLabel",
  "matchedBlockFamily",
  "matchedBlockMode",
]);

const RECIPE_COLUMN_EXPRESSION_KINDS = new Set([
  "capturedColumns",
  "literalColumns",
]);

const RECIPE_BLOCK_PROJECTION_SOURCES = new Set([
  "eachMatchedBlock",
  "singleMatchedBlock",
]);

const RECIPE_SEGMENTATION_PROJECTION_KINDS = new Set([
  "auto",
  "none",
]);

const RECIPE_LEGEND_PROJECTION_TARGETS = new Set([
  "auto",
  "yColumn",
  "group",
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
    if (!normalized.recipe) {
      diagnostics.push(...normalized.diagnostics);
      continue;
    }

    const duplicateKey = `${normalized.recipe.id}@${normalized.recipe.version}`;
    if (seenIds.has(duplicateKey)) {
      diagnostics.push({
        recipeId: normalized.recipe.id,
        severity: "error",
        code: "recipe.duplicateIdVersion",
        message: `Duplicate recipe id/version: ${duplicateKey}`,
      });
      continue;
    }

    seenIds.add(duplicateKey);
    recipes.push(normalized.recipe);
    diagnostics.push(...normalized.diagnostics);
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
  readonly recipe: Recipe | null;
  readonly diagnostics: readonly RecipeDiagnostic[];
} => {
  const diagnostics: RecipeDiagnostic[] = [];
  if (!isObjectRecord(input)) {
    return {
      recipe: null,
      diagnostics: [{
        severity: "error",
        code: "recipe.invalidRecipe",
        message: "Recipe must be an object.",
      }],
    };
  }

  const id = normalizeText(input.id);
  const version = normalizePositiveInteger(input.version);
  const priority = normalizeFiniteNumber(input.priority);
  const selector = isObjectRecord(input.selector) ? input.selector as RecipeSelector : null;
  const projection = isObjectRecord(input.projection) ? input.projection : null;
  const capturedNames = new Set<string>();

  if (!id) {
    diagnostics.push(createRecipeDiagnostic(id, "recipe.missingId", "Recipe id is required."));
  }
  if (!version) {
    diagnostics.push(createRecipeDiagnostic(id, "recipe.invalidVersion", "Recipe version must be a positive integer."));
  }
  if (priority === null) {
    diagnostics.push(createRecipeDiagnostic(id, "recipe.invalidPriority", "Recipe priority must be a finite number."));
  }
  if (!selector || !hasAnySelectorPredicates(selector)) {
    diagnostics.push(createRecipeDiagnostic(id, "recipe.emptySelector", "Recipe selector must contain at least one predicate."));
  }

  if (selector) {
    validateRecipeSelector(selector, capturedNames, diagnostics, id);
  }
  if (projection) {
    validateRecipeProjection(projection, capturedNames, diagnostics, id);
  } else {
    diagnostics.push(createRecipeDiagnostic(id, "recipe.missingProjection", "Recipe projection is required."));
  }

  const hasErrors = diagnostics.some(diagnostic => diagnostic.severity === "error");
  if (hasErrors || !id || !version || priority === null || !selector || !projection) {
    return { recipe: null, diagnostics };
  }

  return {
    recipe: {
      ...(input as Recipe),
      id,
      version,
      priority,
      selector,
      projection: projection as Recipe["projection"],
    },
    diagnostics,
  };
};

const validateRecipeSelector = (
  selector: RecipeSelector,
  capturedNames: Set<string>,
  diagnostics: RecipeDiagnostic[],
  recipeId: string,
): void => {
  for (const predicate of getSelectorPredicates(selector)) {
    if (!isObjectRecord(predicate) || !RECIPE_SELECTOR_PREDICATE_KINDS.has(String(predicate.kind))) {
      diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.unknownPredicate", "Recipe contains an unknown selector predicate."));
      continue;
    }
    if (predicate.kind === "columnRole" && typeof predicate.capture === "string" && predicate.capture.trim()) {
      capturedNames.add(predicate.capture.trim());
    }
    if (predicate.kind === "canonicalUnit" && typeof predicate.capture === "string" && predicate.capture.trim()) {
      capturedNames.add(predicate.capture.trim());
    }
    if (predicate.kind === "sourceHint") {
      validateSourceHintPredicate(predicate as Record<string, unknown>, diagnostics, recipeId);
    }
  }
};

const validateRecipeProjection = (
  projection: Record<string, unknown>,
  capturedNames: ReadonlySet<string>,
  diagnostics: RecipeDiagnostic[],
  recipeId: string,
): void => {
  validateRecipeValueExpression(projection.name, capturedNames, diagnostics, recipeId);
  const blocks = isObjectRecord(projection.blocks) ? projection.blocks : null;
  if (!blocks) {
    diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.missingBlocksProjection", "Recipe projection.blocks is required."));
    return;
  }

  if (blocks.rowRange !== "block.dataRange") {
    diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidRowRangeProjection", "Recipe block projection must use block.dataRange."));
  }
  if (!RECIPE_BLOCK_PROJECTION_SOURCES.has(String(blocks.source))) {
    diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidBlockSourceProjection", "Recipe block projection source is invalid."));
  }
  validateRecipeColumnProjection(blocks.x, capturedNames, diagnostics, recipeId);
  validateRecipeColumnProjection(blocks.y, capturedNames, diagnostics, recipeId);
  validateRecipeSegmentationProjection(blocks.segmentation, diagnostics, recipeId);
  validateRecipeLegendProjection(blocks.legend, diagnostics, recipeId);
  validateRecipeTitleProjection(blocks.titles, capturedNames, diagnostics, recipeId);
  validateRecipeStopOnError(projection.stopOnError, diagnostics, recipeId);
};

const validateRecipeColumnProjection = (
  value: unknown,
  capturedNames: ReadonlySet<string>,
  diagnostics: RecipeDiagnostic[],
  recipeId: string,
): void => {
  const projection = isObjectRecord(value) ? value : null;
  if (!projection) {
    diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidColumnProjection", "Recipe column projection must be an object."));
    return;
  }

  validateRecipeColumnExpression(projection.columns, capturedNames, diagnostics, recipeId);
  if (projection.unit !== undefined) {
    validateRecipeValueExpression(projection.unit, capturedNames, diagnostics, recipeId);
  }
};

const validateRecipeColumnExpression = (
  value: unknown,
  capturedNames: ReadonlySet<string>,
  diagnostics: RecipeDiagnostic[],
  recipeId: string,
): void => {
  const expression = isObjectRecord(value) ? value as RecipeColumnExpression : null;
  if (!expression || !RECIPE_COLUMN_EXPRESSION_KINDS.has(String(expression.kind))) {
    diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.unknownColumnProjection", "Recipe contains an unknown column projection."));
    return;
  }
  if (expression.kind === "capturedColumns" && !capturedNames.has(String(expression.capture ?? "").trim())) {
    diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.unknownCapture", `Recipe references unknown capture: ${String(expression.capture ?? "")}`));
  }
  if (expression.kind === "literalColumns" && !isValidColumnList(expression.columns)) {
    diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidLiteralColumns", "Recipe literal column projection must contain zero-based integer columns."));
  }
};

const validateRecipeValueExpression = (
  value: unknown,
  capturedNames: ReadonlySet<string>,
  diagnostics: RecipeDiagnostic[],
  recipeId: string,
): void => {
  const expression = isObjectRecord(value) ? value as RecipeValueExpression : null;
  if (!expression || !RECIPE_VALUE_EXPRESSION_KINDS.has(String(expression.kind))) {
    diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.unknownValueExpression", "Recipe contains an unknown value expression."));
    return;
  }
  if (expression.kind === "capturedCommonUnit" && !capturedNames.has(String(expression.capture ?? "").trim())) {
    diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.unknownCapture", `Recipe references unknown capture: ${String(expression.capture ?? "")}`));
  }
};

const validateSourceHintPredicate = (
  predicate: Record<string, unknown>,
  diagnostics: RecipeDiagnostic[],
  recipeId: string,
): void => {
  if (Array.isArray(predicate.instrumentAny) && predicate.instrumentAny.length) {
    diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.unsupportedSourceHintInstrument", "Recipe sourceHint.instrumentAny is unsupported until Assessment provides instrument metadata."));
  }
};

const validateRecipeSegmentationProjection = (
  value: unknown,
  diagnostics: RecipeDiagnostic[],
  recipeId: string,
): void => {
  const projection = isObjectRecord(value) ? value : null;
  if (!projection || !RECIPE_SEGMENTATION_PROJECTION_KINDS.has(String(projection.kind))) {
    diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidSegmentationProjection", "Recipe segmentation projection is invalid."));
  }
};

const validateRecipeLegendProjection = (
  value: unknown,
  diagnostics: RecipeDiagnostic[],
  recipeId: string,
): void => {
  const projection = isObjectRecord(value) ? value : null;
  if (!projection || !RECIPE_LEGEND_PROJECTION_TARGETS.has(String(projection.target))) {
    diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidLegendProjection", "Recipe legend projection is invalid."));
  }
};

const validateRecipeTitleProjection = (
  value: unknown,
  capturedNames: ReadonlySet<string>,
  diagnostics: RecipeDiagnostic[],
  recipeId: string,
): void => {
  if (value === undefined) {
    return;
  }

  const projection = isObjectRecord(value) ? value : null;
  if (!projection) {
    diagnostics.push(createRecipeDiagnostic(recipeId, "recipe.invalidTitleProjection", "Recipe title projection must be an object."));
    return;
  }

  if (projection.bottom !== undefined) {
    validateRecipeValueExpression(projection.bottom, capturedNames, diagnostics, recipeId);
  }
  if (projection.left !== undefined) {
    validateRecipeValueExpression(projection.left, capturedNames, diagnostics, recipeId);
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

const hasAnySelectorPredicates = (selector: RecipeSelector): boolean =>
  getSelectorPredicates(selector).length > 0;

const getSelectorPredicates = (selector: RecipeSelector): readonly RecipeSelectorPredicate[] => [
  ...readPredicateArray(selector.all),
  ...readPredicateArray(selector.any),
  ...readPredicateArray(selector.not),
];

const readPredicateArray = (value: unknown): readonly RecipeSelectorPredicate[] =>
  Array.isArray(value) ? value as RecipeSelectorPredicate[] : [];

const isValidColumnList = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(column =>
    Number.isInteger(column) &&
    column >= 0
  );

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
