/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Template } from "src/cs/workbench/services/template/common/templateSpec";

export type AutomaticTemplateCandidateSource =
  | {
      readonly kind: "recipe";
      readonly recipeId: string;
      readonly recipeVersion: number;
    }
  | {
      readonly kind: "userTemplate";
      readonly templateId: string;
      readonly templateVersion: number;
    };

export type TemplateDraftDiagnostic = {
  readonly severity: "info" | "warning" | "error";
  readonly code: string;
  readonly message: string;
};

export type TemplateDraft = {
  readonly id: string;
  readonly source: AutomaticTemplateCandidateSource;
  readonly template: Template;
  readonly templateFingerprint: string;
  readonly derivationConfidence: number;
  readonly derivationReasons: readonly string[];
  readonly derivationDiagnostics: readonly TemplateDraftDiagnostic[];
  readonly captures?: Readonly<Record<string, unknown>>;
};
