/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
  TemplateColumnExpression,
  TemplateDerivationRule,
  TemplateRuleDiagnostic,
  TemplateRuleMatch,
  TemplateRulePredicate,
  TemplateRuleSnapshot,
  TemplateRuleSource,
  TemplateValueExpression,
} from "src/cs/workbench/services/templateRule/common/templateRule";
import { createTemplateRuleSetFingerprint } from "src/cs/workbench/services/templateRule/common/templateRuleFingerprint";

type NormalizeRuleResult = {
  readonly rules: readonly TemplateDerivationRule[];
  readonly diagnostics: readonly TemplateRuleDiagnostic[];
};

const TEMPLATE_RULE_PREDICATE_KINDS = new Set([
  "blockFamily",
  "blockMode",
  "columnRole",
  "canonicalUnit",
  "layoutEvidence",
  "sourceHint",
  "schemaFingerprint",
]);

const TEMPLATE_VALUE_EXPRESSION_KINDS = new Set([
  "literal",
  "capturedCommonUnit",
  "matchedBlockLabel",
  "matchedBlockFamily",
  "matchedBlockMode",
]);

const TEMPLATE_COLUMN_EXPRESSION_KINDS = new Set([
  "capturedColumns",
  "literalColumns",
]);

export const createTemplateRuleSnapshot = (
  rulesInput: readonly unknown[],
  source: TemplateRuleSource,
  version = 1,
): TemplateRuleSnapshot => {
  const { rules, diagnostics } = normalizeTemplateDerivationRules(rulesInput, source);
  return {
    version,
    fingerprint: createTemplateRuleSetFingerprint(rules),
    rules,
    diagnostics,
  };
};

export const normalizeTemplateDerivationRules = (
  rulesInput: readonly unknown[],
  source: TemplateRuleSource,
): NormalizeRuleResult => {
  const rules: TemplateDerivationRule[] = [];
  const diagnostics: TemplateRuleDiagnostic[] = [];
  const seenIds = new Set<string>();

  for (const input of rulesInput) {
    const normalized = normalizeTemplateDerivationRule(input, source);
    if (!normalized.rule) {
      diagnostics.push(...normalized.diagnostics);
      continue;
    }

    const duplicateKey = `${normalized.rule.id}@${normalized.rule.version}`;
    if (seenIds.has(duplicateKey)) {
      diagnostics.push({
        ruleId: normalized.rule.id,
        severity: "error",
        code: "templateRule.duplicateIdVersion",
        message: `Duplicate template rule id/version: ${duplicateKey}`,
      });
      continue;
    }

    seenIds.add(duplicateKey);
    rules.push(normalized.rule);
    diagnostics.push(...normalized.diagnostics);
  }

  return {
    rules: rules.sort((left, right) =>
      right.priority - left.priority ||
      left.id.localeCompare(right.id),
    ),
    diagnostics,
  };
};

const normalizeTemplateDerivationRule = (
  input: unknown,
  source: TemplateRuleSource,
): {
  readonly rule: TemplateDerivationRule | null;
  readonly diagnostics: readonly TemplateRuleDiagnostic[];
} => {
  const diagnostics: TemplateRuleDiagnostic[] = [];
  if (!isObjectRecord(input)) {
    return {
      rule: null,
      diagnostics: [{
        severity: "error",
        code: "templateRule.invalidRule",
        message: "Template rule must be an object.",
      }],
    };
  }

  const id = normalizeText(input.id);
  const version = normalizePositiveInteger(input.version);
  const priority = normalizeFiniteNumber(input.priority);
  const enabled = typeof input.enabled === "boolean" ? input.enabled : null;
  const schemaVersion = input.schemaVersion === 1 ? 1 : null;
  const match = isObjectRecord(input.match) ? input.match as TemplateRuleMatch : null;
  const emit = isObjectRecord(input.emit) ? input.emit : null;
  const capturedNames = new Set<string>();

  if (!id) {
    diagnostics.push(createRuleDiagnostic(id, "templateRule.missingId", "Template rule id is required."));
  }
  if (!schemaVersion) {
    diagnostics.push(createRuleDiagnostic(id, "templateRule.invalidSchemaVersion", "Template rule schemaVersion must be 1."));
  }
  if (!version) {
    diagnostics.push(createRuleDiagnostic(id, "templateRule.invalidVersion", "Template rule version must be a positive integer."));
  }
  if (priority === null) {
    diagnostics.push(createRuleDiagnostic(id, "templateRule.invalidPriority", "Template rule priority must be a finite number."));
  }
  if (enabled === null) {
    diagnostics.push(createRuleDiagnostic(id, "templateRule.invalidEnabled", "Template rule enabled flag must be a boolean."));
  }
  if (!match || !hasAnyRulePredicates(match)) {
    diagnostics.push(createRuleDiagnostic(id, "templateRule.emptyMatch", "Template rule match must contain at least one predicate."));
  }

  if (match) {
    validateTemplateRuleMatch(match, capturedNames, diagnostics, id);
  }
  if (emit) {
    validateTemplateProjection(emit, capturedNames, diagnostics, id);
  } else {
    diagnostics.push(createRuleDiagnostic(id, "templateRule.missingEmit", "Template rule emit projection is required."));
  }

  const hasErrors = diagnostics.some(diagnostic => diagnostic.severity === "error");
  if (hasErrors || !id || !schemaVersion || !version || priority === null || enabled === null || !match || !emit) {
    return { rule: null, diagnostics };
  }

  return {
    rule: {
      ...(input as TemplateDerivationRule),
      schemaVersion,
      id,
      version,
      priority,
      enabled,
      source,
      match,
      emit: emit as TemplateDerivationRule["emit"],
    },
    diagnostics,
  };
};

const validateTemplateRuleMatch = (
  match: TemplateRuleMatch,
  capturedNames: Set<string>,
  diagnostics: TemplateRuleDiagnostic[],
  ruleId: string,
): void => {
  for (const predicate of getMatchPredicates(match)) {
    if (!isObjectRecord(predicate) || !TEMPLATE_RULE_PREDICATE_KINDS.has(String(predicate.kind))) {
      diagnostics.push(createRuleDiagnostic(ruleId, "templateRule.unknownPredicate", "Template rule contains an unknown predicate."));
      continue;
    }
    if (predicate.kind === "columnRole" && typeof predicate.capture === "string" && predicate.capture.trim()) {
      capturedNames.add(predicate.capture.trim());
    }
    if (predicate.kind === "canonicalUnit" && typeof predicate.capture === "string" && predicate.capture.trim()) {
      capturedNames.add(predicate.capture.trim());
    }
  }
};

const validateTemplateProjection = (
  emit: Record<string, unknown>,
  capturedNames: ReadonlySet<string>,
  diagnostics: TemplateRuleDiagnostic[],
  ruleId: string,
): void => {
  validateTemplateValueExpression(emit.name, capturedNames, diagnostics, ruleId);
  const blocks = isObjectRecord(emit.blocks) ? emit.blocks : null;
  if (!blocks) {
    diagnostics.push(createRuleDiagnostic(ruleId, "templateRule.missingBlocksProjection", "Template rule emit.blocks is required."));
    return;
  }

  if (blocks.rowRange !== "block.dataRange") {
    diagnostics.push(createRuleDiagnostic(ruleId, "templateRule.invalidRowRangeProjection", "Template rule block projection must use block.dataRange."));
  }
  validateTemplateColumnProjection(blocks.x, capturedNames, diagnostics, ruleId);
  validateTemplateColumnProjection(blocks.y, capturedNames, diagnostics, ruleId);
};

const validateTemplateColumnProjection = (
  value: unknown,
  capturedNames: ReadonlySet<string>,
  diagnostics: TemplateRuleDiagnostic[],
  ruleId: string,
): void => {
  const projection = isObjectRecord(value) ? value : null;
  if (!projection) {
    diagnostics.push(createRuleDiagnostic(ruleId, "templateRule.invalidColumnProjection", "Template rule column projection must be an object."));
    return;
  }

  validateTemplateColumnExpression(projection.columns, capturedNames, diagnostics, ruleId);
  if (projection.unit !== undefined) {
    validateTemplateValueExpression(projection.unit, capturedNames, diagnostics, ruleId);
  }
};

const validateTemplateColumnExpression = (
  value: unknown,
  capturedNames: ReadonlySet<string>,
  diagnostics: TemplateRuleDiagnostic[],
  ruleId: string,
): void => {
  const expression = isObjectRecord(value) ? value as TemplateColumnExpression : null;
  if (!expression || !TEMPLATE_COLUMN_EXPRESSION_KINDS.has(String(expression.kind))) {
    diagnostics.push(createRuleDiagnostic(ruleId, "templateRule.unknownColumnProjection", "Template rule contains an unknown column projection."));
    return;
  }
  if (expression.kind === "capturedColumns" && !capturedNames.has(String(expression.capture ?? "").trim())) {
    diagnostics.push(createRuleDiagnostic(ruleId, "templateRule.unknownCapture", `Template rule references unknown capture: ${String(expression.capture ?? "")}`));
  }
};

const validateTemplateValueExpression = (
  value: unknown,
  capturedNames: ReadonlySet<string>,
  diagnostics: TemplateRuleDiagnostic[],
  ruleId: string,
): void => {
  const expression = isObjectRecord(value) ? value as TemplateValueExpression : null;
  if (!expression || !TEMPLATE_VALUE_EXPRESSION_KINDS.has(String(expression.kind))) {
    diagnostics.push(createRuleDiagnostic(ruleId, "templateRule.unknownValueExpression", "Template rule contains an unknown value expression."));
    return;
  }
  if (expression.kind === "capturedCommonUnit" && !capturedNames.has(String(expression.capture ?? "").trim())) {
    diagnostics.push(createRuleDiagnostic(ruleId, "templateRule.unknownCapture", `Template rule references unknown capture: ${String(expression.capture ?? "")}`));
  }
};

const hasAnyRulePredicates = (match: TemplateRuleMatch): boolean =>
  getMatchPredicates(match).length > 0;

const getMatchPredicates = (match: TemplateRuleMatch): readonly TemplateRulePredicate[] => [
  ...readPredicateArray(match.all),
  ...readPredicateArray(match.any),
  ...readPredicateArray(match.not),
];

const readPredicateArray = (value: unknown): readonly TemplateRulePredicate[] =>
  Array.isArray(value) ? value as TemplateRulePredicate[] : [];

const createRuleDiagnostic = (
  ruleId: string,
  code: string,
  message: string,
): TemplateRuleDiagnostic => ({
  ruleId: ruleId || undefined,
  severity: "error",
  code,
  message,
});

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const normalizePositiveInteger = (value: unknown): number | null => {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
};

const normalizeFiniteNumber = (value: unknown): number | null => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};
