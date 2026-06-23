/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Template } from "src/cs/workbench/services/template/common/template";

// TemplateCandidate is an Assessment result containing a concrete Template snapshot.
// It is not a Recipe and is not persisted as a user template unless explicitly saved.
export type TemplateCandidateSource =
  | {
      readonly kind: "recipe";
      readonly recipeId: string;
      readonly recipeVersion: number;
    }
  | {
      readonly kind: "savedTemplate";
      readonly templateId: string;
      readonly templateVersion: number;
    };

export type TemplateCandidateSummary = {
  readonly id: string;
  readonly source: TemplateCandidateSource;
  readonly templateFingerprint: string;
  readonly confidence: number;
  readonly state: "ready" | "review";
  readonly reasons: readonly string[];
  readonly diagnosticCodes: readonly string[];
};

export type TemplateCandidate = TemplateCandidateSummary & {
  readonly template: Template;
};

export type SelectedTemplateCandidate = {
  readonly candidateId: string;
  readonly source: TemplateCandidateSource;
  readonly template: Template;
  readonly templateFingerprint: string;
};

export const toTemplateCandidateSummary = (
  candidate: TemplateCandidate,
): TemplateCandidateSummary => ({
  id: candidate.id,
  source: candidate.source,
  templateFingerprint: candidate.templateFingerprint,
  confidence: candidate.confidence,
  state: candidate.state,
  reasons: candidate.reasons,
  diagnosticCodes: candidate.diagnosticCodes,
});
