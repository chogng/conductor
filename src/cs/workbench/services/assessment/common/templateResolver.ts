/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { AssessmentEvidence } from "src/cs/workbench/services/assessment/common/assessmentEvidence";
import { evaluateSavedTemplateCandidates } from "src/cs/workbench/services/assessment/common/savedTemplateEvaluator";
import type {
  SelectedTemplateCandidate,
  TemplateCandidate,
} from "src/cs/workbench/services/assessment/common/templateCandidate";
import { materializeRecipeCandidate } from "src/cs/workbench/services/assessment/common/recipeProjectionMaterializer";
import { evaluateRecipeSelector } from "src/cs/workbench/services/assessment/common/recipeSelectorEvaluator";
import type { TemplateSnapshot } from "src/cs/workbench/services/template/common/template";
import type { RecipeSnapshot } from "src/cs/workbench/services/recipe/common/recipe";

export type ResolveTemplateCandidatesInput = {
  readonly recipeSnapshot?: RecipeSnapshot;
  readonly evidence: AssessmentEvidence;
  readonly templateSnapshot?: TemplateSnapshot;
};

export const resolveTemplateCandidates = ({
  recipeSnapshot,
  evidence,
  templateSnapshot,
}: ResolveTemplateCandidatesInput): readonly TemplateCandidate[] => {
  const candidates: TemplateCandidate[] = [];
  candidates.push(...evaluateSavedTemplateCandidates({
    evidence,
    templateSnapshot,
  }));

  for (const recipe of recipeSnapshot?.recipes ?? []) {
    const evaluation = evaluateRecipeSelector(recipe, evidence);
    const candidate = materializeRecipeCandidate({
      recipe,
      evidence,
      evaluation,
    });
    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates.sort((left, right) =>
    right.confidence - left.confidence ||
    getTemplateCandidateSourceRank(left) - getTemplateCandidateSourceRank(right) ||
    left.id.localeCompare(right.id)
  );
};

export const selectTemplateCandidate = (
  candidates: readonly TemplateCandidate[],
  autoApplyAllowed: boolean,
): SelectedTemplateCandidate | undefined => {
  if (!autoApplyAllowed) {
    return undefined;
  }

  const candidate = candidates.find(entry => entry.state === "ready");
  return candidate
    ? {
        candidateId: candidate.id,
        source: candidate.source,
        template: candidate.template,
        templateFingerprint: candidate.templateFingerprint,
      }
    : undefined;
};

const getTemplateCandidateSourceRank = (
  candidate: TemplateCandidate,
): number => candidate.source.kind === "savedTemplate" ? 0 : 1;
