/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { MeasurementBlockRecord } from "src/cs/workbench/services/assessment/common/measurement";
import { evaluateRecipeSelector } from "src/cs/workbench/services/template/common/recipeSelectorEvaluator";
import type {
  RecipeSelectorBlockMatch,
  RecipeSelectorCapture,
  RecipeSelectorEvaluation,
} from "src/cs/workbench/services/template/common/recipeSelectorEvaluator";
import type { Recipe, RecipeSnapshot } from "src/cs/workbench/services/recipe/common/recipe";
import type { RawTableFacts } from "src/cs/workbench/services/template/common/tableFacts";
import type {
  TemplateDraft,
  TemplateDraftDiagnostic,
} from "src/cs/workbench/services/template/common/templateDraft";
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

export const deriveRecipeTemplateDrafts = ({
  tableFacts,
  recipeSnapshot,
}: {
  readonly tableFacts: RawTableFacts;
  readonly recipeSnapshot?: RecipeSnapshot;
}): readonly TemplateDraft[] => {
  const drafts: TemplateDraft[] = [];
  for (const recipe of recipeSnapshot?.recipes ?? []) {
    const evaluation = evaluateRecipeSelector(recipe, tableFacts);
    const draft = materializeRecipeTemplateDraft({
      recipe,
      tableFacts,
      evaluation,
    });
    if (draft) {
      drafts.push(draft);
    }
  }

  return drafts.sort((left, right) =>
    right.derivationConfidence - left.derivationConfidence ||
    left.id.localeCompare(right.id)
  );
};

export const materializeRecipeTemplateDraft = ({
  recipe,
  tableFacts,
  evaluation,
}: {
  readonly recipe: Recipe;
  readonly tableFacts: RawTableFacts;
  readonly evaluation: RecipeSelectorEvaluation;
}): TemplateDraft | null => {
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
    const block = getMatchedBlock(tableFacts, match);
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
    name: resolveTemplateValue(projection.name, matches[0], getMatchedBlock(tableFacts, matches[0])) || recipe.id,
    version: 1,
    blocks,
    stopOnError: projection.stopOnError ?? false,
    applicability: {
      schemaFingerprint: tableFacts.structure.fingerprint,
      columnCount: tableFacts.sourceMetadata.columnCount,
    },
  };
  const templateFingerprint = createTemplateFingerprint(template);

  return {
    id: `recipe-template:${recipe.id}:${recipe.version}`,
    source: {
      kind: "recipe",
      recipeId: recipe.id,
      recipeVersion: recipe.version,
    },
    template,
    templateFingerprint,
    derivationConfidence: getTemplateConfidence(matches, tableFacts),
    derivationReasons: matches.flatMap(match => match.reasons),
    derivationDiagnostics: [...diagnostics].map(createTemplateDraftDiagnostic),
  };
};

const createTemplateDraftDiagnostic = (
  code: string,
): TemplateDraftDiagnostic => ({
  severity: "warning",
  code,
  message: code,
});

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
  tableFacts: RawTableFacts,
  match: RecipeSelectorBlockMatch | undefined,
): MeasurementBlockRecord | null =>
  match?.blockId
    ? tableFacts.blocks.find(block => block.id === match.blockId) ?? null
    : tableFacts.blocks[0] ?? null;

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
  tableFacts: RawTableFacts,
): number => {
  const confidences = matches
    .map(match => getMatchedBlock(tableFacts, match)?.confidence)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!confidences.length) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, Math.min(...confidences)));
};
