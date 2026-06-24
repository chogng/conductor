/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
  MeasurementBlockRecord,
  MeasurementColumnRef,
} from "src/cs/workbench/services/tableFacts/common/measurement";
import type {
  CanonicalUnitSelectorPredicate,
  ColumnRoleSelectorPredicate,
  LayoutEvidenceSelectorPredicate,
  SchemaFingerprintSelectorPredicate,
  SourceHintSelectorPredicate,
  RecipeSelector,
  RecipeSelectorPredicate,
} from "src/cs/workbench/services/recipe/common/recipeSelector";
import type { Recipe } from "src/cs/workbench/services/recipe/common/recipe";
import type { RawTableFacts } from "src/cs/workbench/services/template/common/tableFacts";

export type RecipeSelectorCapture =
  | {
      readonly kind: "columns";
      readonly columns: readonly number[];
      readonly unit?: string | null;
    }
  | {
      readonly kind: "units";
      readonly units: readonly string[];
    };

export type RecipeSelectorBlockMatch = {
  readonly blockId?: string;
  readonly captures: Readonly<Record<string, RecipeSelectorCapture>>;
  readonly reasons: readonly string[];
};

export type RecipeSelectorEvaluation = {
  readonly matched: boolean;
  readonly recipeId: string;
  readonly recipeVersion: number;
  readonly matches: readonly RecipeSelectorBlockMatch[];
  readonly diagnosticCodes: readonly string[];
};

type EvaluationContext = {
  readonly tableFacts: RawTableFacts;
  readonly block: MeasurementBlockRecord | null;
};

type PredicateResult =
  | {
      readonly matched: true;
      readonly captures?: Readonly<Record<string, RecipeSelectorCapture>>;
      readonly reason?: string;
    }
  | {
      readonly matched: false;
      readonly diagnosticCode?: string;
    };

type MatchResult =
  | {
      readonly matched: true;
      readonly captures: Readonly<Record<string, RecipeSelectorCapture>>;
      readonly reasons: readonly string[];
    }
  | {
      readonly matched: false;
      readonly diagnosticCodes: readonly string[];
    };

export const evaluateRecipeSelector = (
  recipe: Recipe,
  tableFacts: RawTableFacts,
): RecipeSelectorEvaluation => {
  const contexts = tableFacts.blocks.length
    ? tableFacts.blocks.map(block => ({ tableFacts, block }))
    : [{ tableFacts, block: null }];
  const matches: RecipeSelectorBlockMatch[] = [];
  const diagnosticCodes = new Set<string>();

  for (const context of contexts) {
    const result = evaluateSelector(recipe.selector, context);
    if (result.matched) {
      matches.push({
        blockId: context.block?.id,
        captures: result.captures,
        reasons: result.reasons,
      });
    } else {
      for (const code of result.diagnosticCodes) {
        diagnosticCodes.add(code);
      }
    }
  }

  return {
    matched: matches.length > 0,
    recipeId: recipe.id,
    recipeVersion: recipe.version,
    matches,
    diagnosticCodes: matches.length ? [] : [...diagnosticCodes],
  };
};

const evaluateSelector = (
  selector: RecipeSelector,
  context: EvaluationContext,
): MatchResult => {
  const captures: Record<string, RecipeSelectorCapture> = {};
  const reasons: string[] = [];
  const diagnosticCodes = new Set<string>();

  for (const predicate of readPredicateArray(selector.all)) {
    const result = evaluatePredicate(predicate, context);
    if (!result.matched) {
      addDiagnosticCode(diagnosticCodes, result.diagnosticCode);
      return {
        matched: false,
        diagnosticCodes: [...diagnosticCodes],
      };
    }
    mergeCaptures(captures, result.captures);
    addReason(reasons, result.reason);
  }

  const anyPredicates = readPredicateArray(selector.any);
  if (anyPredicates.length) {
    let matchedAny = false;
    const anyDiagnostics = new Set<string>();
    for (const predicate of anyPredicates) {
      const result = evaluatePredicate(predicate, context);
      if (result.matched) {
        mergeCaptures(captures, result.captures);
        addReason(reasons, result.reason);
        matchedAny = true;
        break;
      }
      addDiagnosticCode(anyDiagnostics, result.diagnosticCode);
    }
    if (!matchedAny) {
      return {
        matched: false,
        diagnosticCodes: [...anyDiagnostics],
      };
    }
  }

  for (const predicate of readPredicateArray(selector.not)) {
    const result = evaluatePredicate(predicate, context);
    if (result.matched) {
      return {
        matched: false,
        diagnosticCodes: ["recipeSelector.notPredicateMatched"],
      };
    }
  }

  if (!readPredicateArray(selector.all).length && !anyPredicates.length) {
    return {
      matched: false,
      diagnosticCodes: ["recipeSelector.emptySelector"],
    };
  }

  return {
    matched: true,
    captures,
    reasons,
  };
};

const evaluatePredicate = (
  predicate: RecipeSelectorPredicate,
  context: EvaluationContext,
): PredicateResult => {
  switch (predicate.kind) {
    case "blockFamily":
      return context.block?.family === predicate.family &&
        meetsMinConfidence(context.block.confidence, predicate.minConfidence)
        ? { matched: true, reason: `blockFamily:${predicate.family}` }
        : { matched: false, diagnosticCode: "recipeSelector.blockFamilyMismatch" };
    case "blockMode":
      return evaluateBlockModePredicate(predicate, context.block);
    case "columnRole":
      return evaluateColumnRolePredicate(predicate, context);
    case "canonicalUnit":
      return evaluateCanonicalUnitPredicate(predicate, context);
    case "layoutEvidence":
      return evaluateLayoutEvidencePredicate(predicate, context.tableFacts);
    case "sourceHint":
      return evaluateSourceHintPredicate(predicate, context.tableFacts);
    case "schemaFingerprint":
      return evaluateSchemaFingerprintPredicate(predicate, context.tableFacts);
  }
};

const evaluateBlockModePredicate = (
  predicate: Extract<RecipeSelectorPredicate, { readonly kind: "blockMode" }>,
  block: MeasurementBlockRecord | null,
): PredicateResult => {
  if (!block || !meetsMinConfidence(block.confidence, predicate.minConfidence)) {
    return { matched: false, diagnosticCode: "recipeSelector.blockModeMismatch" };
  }
  if (predicate.ivMode && block.ivMode !== predicate.ivMode) {
    return { matched: false, diagnosticCode: "recipeSelector.ivModeMismatch" };
  }
  if (predicate.itMode && block.itMode !== predicate.itMode) {
    return { matched: false, diagnosticCode: "recipeSelector.itModeMismatch" };
  }

  return { matched: true, reason: "blockMode" };
};

const evaluateColumnRolePredicate = (
  predicate: ColumnRoleSelectorPredicate,
  context: EvaluationContext,
): PredicateResult => {
  const columns = getColumnsForScope(predicate.within, context);
  const matchedColumns = columns.filter(column =>
    predicate.roleAny.includes(column.role) &&
    (!predicate.canonicalUnit || normalizeUnit(column.unit) === predicate.canonicalUnit)
  );
  if (!isCountWithinBounds(matchedColumns.length, predicate.minCount, predicate.maxCount)) {
    return { matched: false, diagnosticCode: "recipeSelector.columnRoleMismatch" };
  }

  return {
    matched: true,
    captures: {
      [predicate.capture]: {
        kind: "columns",
        columns: matchedColumns.map(column => column.rawCol),
        unit: getCommonUnit(matchedColumns),
      },
    },
    reason: `columnRole:${predicate.capture}`,
  };
};

const evaluateCanonicalUnitPredicate = (
  predicate: CanonicalUnitSelectorPredicate,
  context: EvaluationContext,
): PredicateResult => {
  const units = getColumnsForScope(predicate.within, context)
    .map(column => normalizeUnit(column.unit))
    .filter((unit): unit is string => Boolean(unit && predicate.unitAny.includes(unit as never)));
  const uniqueUnits = [...new Set(units)];
  if (uniqueUnits.length < Math.max(1, Math.floor(Number(predicate.minCount) || 1))) {
    return { matched: false, diagnosticCode: "recipeSelector.canonicalUnitMismatch" };
  }

  return {
    matched: true,
    captures: predicate.capture
      ? {
          [predicate.capture]: {
            kind: "units",
            units: uniqueUnits,
          },
        }
      : undefined,
    reason: "canonicalUnit",
  };
};

const evaluateLayoutEvidencePredicate = (
  predicate: LayoutEvidenceSelectorPredicate,
  tableFacts: RawTableFacts,
): PredicateResult =>
  tableFacts.layoutCandidates.some(candidate =>
    predicate.layoutAny.includes(candidate.layoutKind) &&
    meetsMinConfidence(candidate.confidence, predicate.minConfidence)
  )
    ? { matched: true, reason: "layoutEvidence" }
    : { matched: false, diagnosticCode: "recipeSelector.layoutEvidenceMismatch" };

const evaluateSourceHintPredicate = (
  predicate: SourceHintSelectorPredicate,
  tableFacts: RawTableFacts,
): PredicateResult => {
  const fileName = normalizeText(tableFacts.sourceMetadata.fileName);
  const extension = getFileExtension(fileName);
  const matchesFileName = !predicate.fileNameIncludesAny?.length ||
    predicate.fileNameIncludesAny.some(value => fileName.includes(normalizeText(value)));
  const matchesExtension = !predicate.extensionAny?.length ||
    predicate.extensionAny.some(value => extension === normalizeExtension(value));

  return matchesFileName && matchesExtension
    ? { matched: true, reason: "sourceHint" }
    : { matched: false, diagnosticCode: "recipeSelector.sourceHintMismatch" };
};

const evaluateSchemaFingerprintPredicate = (
  predicate: SchemaFingerprintSelectorPredicate,
  tableFacts: RawTableFacts,
): PredicateResult =>
  predicate.fingerprintAny.includes(tableFacts.structure.fingerprint)
    ? { matched: true, reason: "schemaFingerprint" }
    : { matched: false, diagnosticCode: "recipeSelector.schemaFingerprintMismatch" };

const getColumnsForScope = (
  scope: ColumnRoleSelectorPredicate["within"],
  context: EvaluationContext,
): readonly MeasurementColumnRef[] =>
  scope === "matchedBlock"
    ? context.block?.columns.columns ?? []
    : context.tableFacts.blocks.flatMap(block => block.columns.columns);

const isCountWithinBounds = (
  count: number,
  minCount: number | undefined,
  maxCount: number | undefined,
): boolean => {
  const min = Math.max(1, Math.floor(Number(minCount) || 1));
  const max = maxCount === undefined ? Number.POSITIVE_INFINITY : Math.floor(Number(maxCount));
  return count >= min && count <= max;
};

const getCommonUnit = (
  columns: readonly MeasurementColumnRef[],
): string | null => {
  const units = [...new Set(columns.map(column => normalizeUnit(column.unit)).filter(Boolean))];
  return units.length === 1 ? units[0] ?? null : null;
};

const meetsMinConfidence = (
  confidence: number | undefined,
  minConfidence: number | undefined,
): boolean =>
  minConfidence === undefined ||
  Number(confidence ?? 1) >= minConfidence;

const mergeCaptures = (
  target: Record<string, RecipeSelectorCapture>,
  source: Readonly<Record<string, RecipeSelectorCapture>> | undefined,
): void => {
  if (!source) {
    return;
  }
  for (const [key, value] of Object.entries(source)) {
    target[key] = value;
  }
};

const addReason = (target: string[], reason: string | undefined): void => {
  if (reason) {
    target.push(reason);
  }
};

const addDiagnosticCode = (target: Set<string>, code: string | undefined): void => {
  if (code) {
    target.add(code);
  }
};

const readPredicateArray = (
  value: unknown,
): readonly RecipeSelectorPredicate[] =>
  Array.isArray(value) ? value as RecipeSelectorPredicate[] : [];

const normalizeUnit = (value: unknown): string =>
  String(value ?? "").trim();

const normalizeText = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

const getFileExtension = (value: string): string => {
  const index = value.lastIndexOf(".");
  return index === -1 ? "" : value.slice(index + 1);
};

const normalizeExtension = (value: unknown): string =>
  normalizeText(value).replace(/^\./, "");
