/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { LayoutKind } from "src/cs/workbench/services/assessment/common/layoutCandidate";
import type {
  IvSweepMode,
  ItSweepMode,
  MeasurementColumnRole,
  MeasurementFamily,
} from "src/cs/workbench/services/assessment/common/measurement";
import type { CanonicalUnit } from "src/cs/workbench/services/assessment/common/semanticCandidate";

export type RecipeSelector = {
  readonly all?: readonly RecipeSelectorPredicate[];
  readonly any?: readonly RecipeSelectorPredicate[];
  readonly not?: readonly RecipeSelectorPredicate[];
};

export type RecipeSelectorPredicate =
  | BlockFamilySelectorPredicate
  | BlockModeSelectorPredicate
  | ColumnRoleSelectorPredicate
  | CanonicalUnitSelectorPredicate
  | LayoutEvidenceSelectorPredicate
  | SourceHintSelectorPredicate
  | SchemaFingerprintSelectorPredicate;

export type BlockFamilySelectorPredicate = {
  readonly kind: "blockFamily";
  readonly family: MeasurementFamily;
  readonly minConfidence?: number;
};

export type BlockModeSelectorPredicate = {
  readonly kind: "blockMode";
  readonly ivMode?: IvSweepMode;
  readonly itMode?: ItSweepMode;
  readonly minConfidence?: number;
};

export type ColumnRoleSelectorPredicate = {
  readonly kind: "columnRole";
  readonly capture: string;
  readonly within: "matchedBlock" | "table";
  readonly roleAny: readonly MeasurementColumnRole[];
  readonly axis?: "x" | "y";
  readonly canonicalUnit?: CanonicalUnit;
  readonly minCount?: number;
  readonly maxCount?: number;
};

export type CanonicalUnitSelectorPredicate = {
  readonly kind: "canonicalUnit";
  readonly capture?: string;
  readonly within: "matchedBlock" | "table";
  readonly unitAny: readonly CanonicalUnit[];
  readonly minCount?: number;
};

export type LayoutEvidenceSelectorPredicate = {
  readonly kind: "layoutEvidence";
  readonly layoutAny: readonly LayoutKind[];
  readonly minConfidence?: number;
};

export type SourceHintSelectorPredicate = {
  readonly kind: "sourceHint";
  readonly fileNameIncludesAny?: readonly string[];
  readonly extensionAny?: readonly string[];
  readonly instrumentAny?: readonly string[];
};

export type SchemaFingerprintSelectorPredicate = {
  readonly kind: "schemaFingerprint";
  readonly fingerprintAny: readonly string[];
};
