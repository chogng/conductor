/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { AssessmentEvidence } from "src/cs/workbench/services/assessment/common/assessmentEvidence";
import type {
  MeasurementBlockRecord,
  MeasurementColumnRef,
} from "src/cs/workbench/services/assessment/common/measurement";
import type {
  CanonicalUnitPredicate,
  ColumnRolePredicate,
  LayoutEvidencePredicate,
  SchemaFingerprintPredicate,
  SourceHintPredicate,
  TemplateDerivationRule,
  TemplateRuleMatch,
  TemplateRulePredicate,
} from "src/cs/workbench/services/templateRule/common/templateRule";

export type TemplateRuleCapture =
  | {
      readonly kind: "columns";
      readonly columns: readonly number[];
      readonly unit?: string | null;
    }
  | {
      readonly kind: "units";
      readonly units: readonly string[];
    };

export type TemplateRuleBlockMatch = {
  readonly blockId?: string;
  readonly captures: Readonly<Record<string, TemplateRuleCapture>>;
  readonly reasons: readonly string[];
};

export type TemplateRuleEvaluation = {
  readonly matched: boolean;
  readonly ruleId: string;
  readonly ruleVersion: number;
  readonly matches: readonly TemplateRuleBlockMatch[];
  readonly diagnosticCodes: readonly string[];
};

type EvaluationContext = {
  readonly evidence: AssessmentEvidence;
  readonly block: MeasurementBlockRecord | null;
};

type PredicateResult =
  | {
      readonly matched: true;
      readonly captures?: Readonly<Record<string, TemplateRuleCapture>>;
      readonly reason?: string;
    }
  | {
      readonly matched: false;
      readonly diagnosticCode?: string;
    };

type MatchResult =
  | {
      readonly matched: true;
      readonly captures: Readonly<Record<string, TemplateRuleCapture>>;
      readonly reasons: readonly string[];
    }
  | {
      readonly matched: false;
      readonly diagnosticCodes: readonly string[];
    };

export const evaluateTemplateRule = (
  rule: TemplateDerivationRule,
  evidence: AssessmentEvidence,
): TemplateRuleEvaluation => {
  if (!rule.enabled) {
    return createUnmatchedRuleEvaluation(rule, ["templateRule.disabled"]);
  }

  const contexts = evidence.blocks.length
    ? evidence.blocks.map(block => ({ evidence, block }))
    : [{ evidence, block: null }];
  const matches: TemplateRuleBlockMatch[] = [];
  const diagnosticCodes = new Set<string>();

  for (const context of contexts) {
    const result = evaluateRuleMatch(rule.match, context);
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
    ruleId: rule.id,
    ruleVersion: rule.version,
    matches,
    diagnosticCodes: matches.length ? [] : [...diagnosticCodes],
  };
};

const evaluateRuleMatch = (
  match: TemplateRuleMatch,
  context: EvaluationContext,
): MatchResult => {
  const captures: Record<string, TemplateRuleCapture> = {};
  const reasons: string[] = [];
  const diagnosticCodes = new Set<string>();

  for (const predicate of readPredicateArray(match.all)) {
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

  const anyPredicates = readPredicateArray(match.any);
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

  for (const predicate of readPredicateArray(match.not)) {
    const result = evaluatePredicate(predicate, context);
    if (result.matched) {
      return {
        matched: false,
        diagnosticCodes: ["templateRule.notPredicateMatched"],
      };
    }
  }

  if (!readPredicateArray(match.all).length && !anyPredicates.length) {
    return {
      matched: false,
      diagnosticCodes: ["templateRule.emptyMatch"],
    };
  }

  return {
    matched: true,
    captures,
    reasons,
  };
};

const evaluatePredicate = (
  predicate: TemplateRulePredicate,
  context: EvaluationContext,
): PredicateResult => {
  switch (predicate.kind) {
    case "blockFamily":
      return context.block?.family === predicate.family &&
        meetsMinConfidence(context.block.confidence, predicate.minConfidence)
        ? { matched: true, reason: `blockFamily:${predicate.family}` }
        : { matched: false, diagnosticCode: "templateRule.blockFamilyMismatch" };
    case "blockMode":
      return evaluateBlockModePredicate(predicate, context.block);
    case "columnRole":
      return evaluateColumnRolePredicate(predicate, context);
    case "canonicalUnit":
      return evaluateCanonicalUnitPredicate(predicate, context);
    case "layoutEvidence":
      return evaluateLayoutEvidencePredicate(predicate, context.evidence);
    case "sourceHint":
      return evaluateSourceHintPredicate(predicate, context.evidence);
    case "schemaFingerprint":
      return evaluateSchemaFingerprintPredicate(predicate, context.evidence);
  }
};

const evaluateBlockModePredicate = (
  predicate: Extract<TemplateRulePredicate, { readonly kind: "blockMode" }>,
  block: MeasurementBlockRecord | null,
): PredicateResult => {
  if (!block || !meetsMinConfidence(block.confidence, predicate.minConfidence)) {
    return { matched: false, diagnosticCode: "templateRule.blockModeMismatch" };
  }
  if (predicate.ivMode && block.ivMode !== predicate.ivMode) {
    return { matched: false, diagnosticCode: "templateRule.ivModeMismatch" };
  }
  if (predicate.itMode && block.itMode !== predicate.itMode) {
    return { matched: false, diagnosticCode: "templateRule.itModeMismatch" };
  }

  return { matched: true, reason: "blockMode" };
};

const evaluateColumnRolePredicate = (
  predicate: ColumnRolePredicate,
  context: EvaluationContext,
): PredicateResult => {
  const columns = getColumnsForScope(predicate.within, context);
  const matchedColumns = columns.filter(column =>
    predicate.roleAny.includes(column.role) &&
    (!predicate.canonicalUnit || normalizeUnit(column.unit) === predicate.canonicalUnit)
  );
  if (!isCountWithinBounds(matchedColumns.length, predicate.minCount, predicate.maxCount)) {
    return { matched: false, diagnosticCode: "templateRule.columnRoleMismatch" };
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
  predicate: CanonicalUnitPredicate,
  context: EvaluationContext,
): PredicateResult => {
  const units = getColumnsForScope(predicate.within, context)
    .map(column => normalizeUnit(column.unit))
    .filter((unit): unit is string => Boolean(unit && predicate.unitAny.includes(unit as never)));
  const uniqueUnits = [...new Set(units)];
  if (uniqueUnits.length < Math.max(1, Math.floor(Number(predicate.minCount) || 1))) {
    return { matched: false, diagnosticCode: "templateRule.canonicalUnitMismatch" };
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
  predicate: LayoutEvidencePredicate,
  evidence: AssessmentEvidence,
): PredicateResult =>
  evidence.layoutCandidates.some(candidate =>
    predicate.layoutAny.includes(candidate.layoutKind) &&
    meetsMinConfidence(candidate.confidence, predicate.minConfidence)
  )
    ? { matched: true, reason: "layoutEvidence" }
    : { matched: false, diagnosticCode: "templateRule.layoutEvidenceMismatch" };

const evaluateSourceHintPredicate = (
  predicate: SourceHintPredicate,
  evidence: AssessmentEvidence,
): PredicateResult => {
  const fileName = normalizeText(evidence.sourceMetadata.fileName);
  const extension = getFileExtension(fileName);
  const matchesFileName = !predicate.fileNameIncludesAny?.length ||
    predicate.fileNameIncludesAny.some(value => fileName.includes(normalizeText(value)));
  const matchesExtension = !predicate.extensionAny?.length ||
    predicate.extensionAny.some(value => extension === normalizeExtension(value));
  const matchesInstrument = !predicate.instrumentAny?.length;

  return matchesFileName && matchesExtension && matchesInstrument
    ? { matched: true, reason: "sourceHint" }
    : { matched: false, diagnosticCode: "templateRule.sourceHintMismatch" };
};

const evaluateSchemaFingerprintPredicate = (
  predicate: SchemaFingerprintPredicate,
  evidence: AssessmentEvidence,
): PredicateResult =>
  predicate.fingerprintAny.includes(evidence.structure.fingerprint)
    ? { matched: true, reason: "schemaFingerprint" }
    : { matched: false, diagnosticCode: "templateRule.schemaFingerprintMismatch" };

const getColumnsForScope = (
  scope: ColumnRolePredicate["within"],
  context: EvaluationContext,
): readonly MeasurementColumnRef[] =>
  scope === "matchedBlock"
    ? context.block?.columns.columns ?? []
    : context.evidence.blocks.flatMap(block => block.columns.columns);

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
  target: Record<string, TemplateRuleCapture>,
  source: Readonly<Record<string, TemplateRuleCapture>> | undefined,
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
): readonly TemplateRulePredicate[] =>
  Array.isArray(value) ? value as TemplateRulePredicate[] : [];

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

const createUnmatchedRuleEvaluation = (
  rule: TemplateDerivationRule,
  diagnosticCodes: readonly string[],
): TemplateRuleEvaluation => ({
  matched: false,
  ruleId: rule.id,
  ruleVersion: rule.version,
  matches: [],
  diagnosticCodes,
});
