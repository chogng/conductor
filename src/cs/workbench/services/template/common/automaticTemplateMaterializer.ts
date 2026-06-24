/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { RecipeSnapshot } from "src/cs/workbench/services/recipe/common/recipe";
import { deriveRecipeTemplateDrafts } from "src/cs/workbench/services/template/common/recipeTemplateMaterializer";
import type { RawTableFacts } from "src/cs/workbench/services/template/common/tableFacts";
import type { TemplateDraft } from "src/cs/workbench/services/template/common/templateDraft";
import { deriveUserTemplateDrafts } from "src/cs/workbench/services/template/common/userTemplateMaterializer";
import type { UserTemplateSnapshot } from "src/cs/workbench/services/userTemplate/common/userTemplate";

export const deriveAutomaticTemplateDrafts = ({
  tableFacts,
  recipeSnapshot,
  userTemplateSnapshot,
}: {
  readonly tableFacts: RawTableFacts;
  readonly recipeSnapshot: RecipeSnapshot;
  readonly userTemplateSnapshot: UserTemplateSnapshot;
}): readonly TemplateDraft[] => sortTemplateDrafts([
  ...deriveRecipeTemplateDrafts({
    tableFacts,
    recipeSnapshot,
  }),
  ...deriveUserTemplateDrafts({
    tableFacts,
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
