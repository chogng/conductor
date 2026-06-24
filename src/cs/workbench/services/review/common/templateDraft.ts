/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
  AutomaticTemplateCandidateSource,
  ReviewDiagnostic,
} from "src/cs/workbench/services/review/common/review";
import type { Template } from "src/cs/workbench/services/template/common/templateSpec";

export type TemplateDraftDiagnostic = ReviewDiagnostic;

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
