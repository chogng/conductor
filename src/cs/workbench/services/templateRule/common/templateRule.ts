/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { LayoutKind } from "src/cs/workbench/services/assessment/common/layoutCandidate";
import type {
  IvSweepMode,
  ItSweepMode,
  MeasurementColumnRole,
  MeasurementFamily,
} from "src/cs/workbench/services/assessment/common/measurement";
import type { CanonicalUnit } from "src/cs/workbench/services/assessment/common/semanticCandidate";

export const ITemplateRuleService =
  createDecorator<ITemplateRuleService>("templateRuleService");

export type TemplateDerivationRule = {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly version: number;
  readonly priority: number;
  readonly enabled: boolean;
  readonly source?: TemplateRuleSource;
  readonly scope?: TemplateRuleScope;
  readonly match: TemplateRuleMatch;
  readonly emit: TemplateProjection;
};

export type TemplateRuleSource = "builtin" | "workspace" | "user";

export type TemplateRuleScope = {
  readonly fileNameIncludes?: readonly string[];
  readonly extensions?: readonly string[];
  readonly instrument?: readonly string[];
  readonly measurementFamilies?: readonly MeasurementFamily[];
};

export type TemplateRuleMatch = {
  readonly all?: readonly TemplateRulePredicate[];
  readonly any?: readonly TemplateRulePredicate[];
  readonly not?: readonly TemplateRulePredicate[];
};

export type TemplateRulePredicate =
  | BlockFamilyPredicate
  | BlockModePredicate
  | ColumnRolePredicate
  | CanonicalUnitPredicate
  | LayoutEvidencePredicate
  | SourceHintPredicate
  | SchemaFingerprintPredicate;

export type BlockFamilyPredicate = {
  readonly kind: "blockFamily";
  readonly family: MeasurementFamily;
  readonly minConfidence?: number;
};

export type BlockModePredicate = {
  readonly kind: "blockMode";
  readonly ivMode?: IvSweepMode;
  readonly itMode?: ItSweepMode;
  readonly minConfidence?: number;
};

export type ColumnRolePredicate = {
  readonly kind: "columnRole";
  readonly capture: string;
  readonly within: "matchedBlock" | "table";
  readonly roleAny: readonly MeasurementColumnRole[];
  readonly axis?: "x" | "y";
  readonly canonicalUnit?: CanonicalUnit;
  readonly minCount?: number;
  readonly maxCount?: number;
};

export type CanonicalUnitPredicate = {
  readonly kind: "canonicalUnit";
  readonly capture?: string;
  readonly within: "matchedBlock" | "table";
  readonly unitAny: readonly CanonicalUnit[];
  readonly minCount?: number;
};

export type LayoutEvidencePredicate = {
  readonly kind: "layoutEvidence";
  readonly layoutAny: readonly LayoutKind[];
  readonly minConfidence?: number;
};

export type SourceHintPredicate = {
  readonly kind: "sourceHint";
  readonly fileNameIncludesAny?: readonly string[];
  readonly extensionAny?: readonly string[];
  readonly instrumentAny?: readonly string[];
};

export type SchemaFingerprintPredicate = {
  readonly kind: "schemaFingerprint";
  readonly fingerprintAny: readonly string[];
};

export type TemplateProjection = {
  readonly name: TemplateValueExpression;
  readonly blocks: TemplateBlockProjection;
  readonly stopOnError?: boolean;
};

export type TemplateValueExpression =
  | { readonly kind: "literal"; readonly value: string }
  | { readonly kind: "capturedCommonUnit"; readonly capture: string }
  | { readonly kind: "matchedBlockLabel" }
  | { readonly kind: "matchedBlockFamily" }
  | { readonly kind: "matchedBlockMode" };

export type TemplateBlockProjection = {
  readonly source: "eachMatchedBlock" | "singleMatchedBlock";
  readonly rowRange: "block.dataRange";
  readonly x: TemplateColumnProjection;
  readonly y: TemplateColumnProjection;
  readonly segmentation: TemplateSegmentationProjection;
  readonly legend: TemplateLegendProjection;
  readonly titles?: TemplateTitleProjection;
};

export type TemplateColumnProjection = {
  readonly columns: TemplateColumnExpression;
  readonly unit?: TemplateValueExpression;
};

export type TemplateColumnExpression =
  | { readonly kind: "capturedColumns"; readonly capture: string }
  | { readonly kind: "literalColumns"; readonly columns: readonly number[] };

export type TemplateSegmentationProjection =
  | { readonly kind: "auto" }
  | { readonly kind: "none" };

export type TemplateLegendProjection = {
  readonly target: "auto" | "yColumn" | "group";
};

export type TemplateTitleProjection = {
  readonly bottom?: TemplateValueExpression;
  readonly left?: TemplateValueExpression;
};

export type TemplateRuleDiagnostic = {
  readonly ruleId?: string;
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
};

export type TemplateRuleChangeEvent = {
  readonly version: number;
  readonly fingerprint: string;
  readonly changedRuleIds: readonly string[];
};

export type TemplateRuleSnapshot = {
  readonly version: number;
  readonly fingerprint: string;
  readonly rules: readonly TemplateDerivationRule[];
  readonly diagnostics: readonly TemplateRuleDiagnostic[];
};

export interface ITemplateRuleService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeRules: Event<TemplateRuleChangeEvent>;

  getSnapshot(): TemplateRuleSnapshot;
  reload(): Promise<TemplateRuleSnapshot>;
}
