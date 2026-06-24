/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { RawTableEvidence } from "src/cs/workbench/services/assessment/common/assessmentEvidence";
import type { RecipeSnapshot } from "src/cs/workbench/services/recipe/common/recipe";
import { deriveRecipeTemplateDrafts } from "src/cs/workbench/services/review/common/recipeTemplateDraftProvider";
import type { TemplateDraft } from "src/cs/workbench/services/review/common/templateDraft";
import { deriveUserTemplateDrafts } from "src/cs/workbench/services/review/common/userTemplateDraftProvider";
import type { UserTemplateSnapshot } from "src/cs/workbench/services/userTemplate/common/userTemplate";

export const deriveAutomaticTemplateDrafts = ({
  evidence,
  recipeSnapshot,
  userTemplateSnapshot,
}: {
  readonly evidence: RawTableEvidence;
  readonly recipeSnapshot: RecipeSnapshot;
  readonly userTemplateSnapshot: UserTemplateSnapshot;
}): readonly TemplateDraft[] => sortTemplateDrafts([
  ...deriveRecipeTemplateDrafts({
    evidence,
    recipeSnapshot,
  }),
  ...deriveUserTemplateDrafts({
    evidence,
    userTemplateSnapshot,
  }),
]);

export const sortTemplateDrafts = (
  drafts: readonly TemplateDraft[],
): readonly TemplateDraft[] => [...drafts].sort((left, right) =>
  getTemplateDraftStateRank(right) - getTemplateDraftStateRank(left) ||
  right.derivationConfidence - left.derivationConfidence ||
  left.id.localeCompare(right.id)
);

const getTemplateDraftStateRank = (
  draft: TemplateDraft,
): number => draft.derivationDiagnostics.length ? 0 : 1;
