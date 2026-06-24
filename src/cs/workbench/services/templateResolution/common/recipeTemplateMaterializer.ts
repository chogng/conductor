/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { AssessmentEvidence } from "src/cs/workbench/services/assessment/common/assessmentEvidence";
import type { MeasurementBlockRecord } from "src/cs/workbench/services/assessment/common/measurement";
import { evaluateRecipeSelector } from "src/cs/workbench/services/templateResolution/common/recipeSelectorEvaluator";
import type {
  RecipeSelectorBlockMatch,
  RecipeSelectorCapture,
  RecipeSelectorEvaluation,
} from "src/cs/workbench/services/templateResolution/common/recipeSelectorEvaluator";
import type { Recipe, RecipeSnapshot } from "src/cs/workbench/services/recipe/common/recipe";
import type {
  RecipeColumnProjection,
  RecipeValueExpression,
} from "src/cs/workbench/services/recipe/common/recipeProjection";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type {
  Template,
  TemplateAxisBinding,
  TemplateBlock,
  TemplateRowRange,
} from "src/cs/workbench/services/template/common/templateSpec";

export type MaterializedRecipeTemplate = {
  readonly id: string;
  readonly recipeId: string;
  readonly recipeVersion: number;
  readonly template: Template;
  readonly templateFingerprint: string;
  readonly confidence: number;
  readonly state: "ready" | "review";
  readonly reasons: readonly string[];
  readonly diagnosticCodes: readonly string[];
};

export const materializeRecipeTemplates = ({
  evidence,
  recipeSnapshot,
}: {
  readonly evidence: AssessmentEvidence;
  readonly recipeSnapshot?: RecipeSnapshot;
}): readonly MaterializedRecipeTemplate[] => {
  const materializedTemplates: MaterializedRecipeTemplate[] = [];
  for (const recipe of recipeSnapshot?.recipes ?? []) {
    const evaluation = evaluateRecipeSelector(recipe, evidence);
    const materializedTemplate = materializeRecipeTemplate({
      recipe,
      evidence,
      evaluation,
    });
    if (materializedTemplate) {
      materializedTemplates.push(materializedTemplate);
    }
  }

  return materializedTemplates.sort((left, right) =>
    right.confidence - left.confidence ||
    left.id.localeCompare(right.id)
  );
};

export const materializeRecipeTemplate = ({
  recipe,
  evidence,
  evaluation,
}: {
  readonly recipe: Recipe;
  readonly evidence: AssessmentEvidence;
  readonly evaluation: RecipeSelectorEvaluation;
}): MaterializedRecipeTemplate | null => {
  if (!evaluation.matched || !evaluation.matches.length) {
    return null;
  }

  const projection = recipe.projection;
  const matches = projection.blocks.source === "singleMatchedBlock"
    ? evaluation.matches.slice(0, 1)
    : evaluation.matches;
  const blocks: TemplateBlock[] = [];
  const diagnostics = new Set<string>();
  for (const match of matches) {
    const block = getMatchedBlock(evidence, match);
    if (!block) {
      diagnostics.add("recipeProjection.missingBlock");
      continue;
    }

    const templateBlock = materializeTemplateBlock(recipe, match, block);
    if (!templateBlock) {
      diagnostics.add("recipeProjection.missingCapture");
      continue;
    }
    blocks.push(templateBlock);
  }

  if (!blocks.length) {
    return null;
  }

  const template: Template = {
    schemaVersion: 1,
    name: resolveTemplateValue(projection.name, matches[0], getMatchedBlock(evidence, matches[0])) || recipe.id,
    version: 1,
    blocks,
    stopOnError: projection.stopOnError ?? false,
    applicability: {
      schemaFingerprint: evidence.structure.fingerprint,
      columnCount: evidence.sourceMetadata.columnCount,
    },
  };
  const templateFingerprint = createTemplateFingerprint(template);

  return {
    id: `recipe-template:${recipe.id}:${recipe.version}`,
    recipeId: recipe.id,
    recipeVersion: recipe.version,
    template,
    templateFingerprint,
    confidence: getTemplateConfidence(matches, evidence),
    state: diagnostics.size ? "review" : "ready",
    reasons: matches.flatMap(match => match.reasons),
    diagnosticCodes: [...diagnostics],
  };
};

const materializeTemplateBlock = (
  recipe: Recipe,
  match: RecipeSelectorBlockMatch,
  block: MeasurementBlockRecord,
): TemplateBlock | null => {
  const projection = recipe.projection;
  const x = materializeAxisBinding(projection.blocks.x, match);
  const y = materializeAxisBinding(projection.blocks.y, match);
  if (!x || !y) {
    return null;
  }

  return {
    rowRange: getBlockDataRowRange(block),
    x,
    y,
    segmentation: {
      kind: projection.blocks.segmentation.kind,
    },
    legend: {
      target: projection.blocks.legend.target,
    },
    titles: projection.blocks.titles
      ? {
          bottom: projection.blocks.titles.bottom
            ? resolveTemplateValue(projection.blocks.titles.bottom, match, block)
            : undefined,
          left: projection.blocks.titles.left
            ? resolveTemplateValue(projection.blocks.titles.left, match, block)
            : undefined,
        }
      : undefined,
  };
};

const materializeAxisBinding = (
  projection: RecipeColumnProjection,
  match: RecipeSelectorBlockMatch,
): TemplateAxisBinding | null => {
  if (projection.columns.kind === "literalColumns") {
    return {
      columns: projection.columns.columns,
      unit: projection.unit ? resolveTemplateValue(projection.unit, match, null) : undefined,
    };
  }

  const capture = readColumnsCapture(match.captures[projection.columns.capture]);
  if (!capture) {
    return null;
  }

  return {
    columns: capture.columns,
    unit: projection.unit
      ? resolveTemplateValue(projection.unit, match, null)
      : capture.unit ?? undefined,
  };
};

const resolveTemplateValue = (
  expression: RecipeValueExpression,
  match: RecipeSelectorBlockMatch | undefined,
  block: MeasurementBlockRecord | null,
): string => {
  switch (expression.kind) {
    case "literal":
      return expression.value;
    case "capturedCommonUnit": {
      const capture = match ? match.captures[expression.capture] : undefined;
      if (capture?.kind === "columns") {
        return capture.unit ?? "";
      }
      if (capture?.kind === "units") {
        return capture.units.length === 1 ? capture.units[0] ?? "" : "";
      }
      return "";
    }
    case "matchedBlockLabel":
      return block?.label ?? "";
    case "matchedBlockFamily":
      return block?.family ?? "";
    case "matchedBlockMode":
      return block?.ivMode ?? block?.itMode ?? "";
  }
};

const readColumnsCapture = (
  capture: RecipeSelectorCapture | undefined,
): Extract<RecipeSelectorCapture, { readonly kind: "columns" }> | null =>
  capture?.kind === "columns" && capture.columns.length
    ? capture
    : null;

const getMatchedBlock = (
  evidence: AssessmentEvidence,
  match: RecipeSelectorBlockMatch | undefined,
): MeasurementBlockRecord | null =>
  match?.blockId
    ? evidence.blocks.find(block => block.id === match.blockId) ?? null
    : evidence.blocks[0] ?? null;

const getBlockDataRowRange = (
  block: MeasurementBlockRecord,
): TemplateRowRange => {
  const sourceRange = block.source.dataRange ?? block.source.fullRange;
  return {
    startRow: sourceRange.startRow,
    endRow: sourceRange.endRow,
  };
};

const getTemplateConfidence = (
  matches: readonly RecipeSelectorBlockMatch[],
  evidence: AssessmentEvidence,
): number => {
  const confidences = matches
    .map(match => getMatchedBlock(evidence, match)?.confidence)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!confidences.length) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, Math.min(...confidences)));
};
