/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { AssessmentEvidence } from "src/cs/workbench/services/assessment/common/assessmentEvidence";
import type {
  TemplateCandidate,
  TemplateCandidateSummary,
} from "src/cs/workbench/services/assessment/common/assessment";
import type {
  TemplateRuleBlockMatch,
  TemplateRuleCapture,
  TemplateRuleEvaluation,
} from "src/cs/workbench/services/assessment/common/templateRuleEvaluator";
import type { MeasurementBlockRecord } from "src/cs/workbench/services/assessment/common/measurement";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type {
  Template,
  TemplateAxisBinding,
  TemplateBlock,
  TemplateRowRange,
} from "src/cs/workbench/services/template/common/templateSpec";
import type {
  TemplateColumnProjection,
  TemplateDerivationRule,
  TemplateValueExpression,
} from "src/cs/workbench/services/templateRule/common/templateRule";

export const materializeTemplateRuleCandidate = ({
  evidence,
  evaluation,
  rule,
}: {
  readonly evidence: AssessmentEvidence;
  readonly evaluation: TemplateRuleEvaluation;
  readonly rule: TemplateDerivationRule;
}): TemplateCandidate | null => {
  if (!evaluation.matched || !evaluation.matches.length) {
    return null;
  }

  const matches = rule.emit.blocks.source === "singleMatchedBlock"
    ? evaluation.matches.slice(0, 1)
    : evaluation.matches;
  const blocks: TemplateBlock[] = [];
  const diagnostics = new Set<string>();
  for (const match of matches) {
    const block = getMatchedBlock(evidence, match);
    if (!block) {
      diagnostics.add("templateMaterializer.missingBlock");
      continue;
    }

    const templateBlock = materializeTemplateBlock(rule, match, block);
    if (!templateBlock) {
      diagnostics.add("templateMaterializer.missingCapture");
      continue;
    }
    blocks.push(templateBlock);
  }

  if (!blocks.length) {
    return null;
  }

  const template: Template = {
    schemaVersion: 1,
    name: resolveTemplateValue(rule.emit.name, matches[0], getMatchedBlock(evidence, matches[0])) || rule.id,
    version: 1,
    blocks,
    stopOnError: rule.emit.stopOnError ?? false,
    applicability: {
      schemaFingerprint: evidence.structure.fingerprint,
      columnCount: evidence.sourceMetadata.columnCount,
    },
  };
  const templateFingerprint = createTemplateFingerprint(template);

  return {
    id: `candidate:${rule.id}:${rule.version}`,
    source: {
      kind: "rule",
      ruleId: rule.id,
      ruleVersion: rule.version,
    },
    template,
    templateFingerprint,
    confidence: getCandidateConfidence(matches, evidence),
    state: diagnostics.size ? "review" : "ready",
    reasons: matches.flatMap(match => match.reasons),
    diagnosticCodes: [...diagnostics],
  };
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

const materializeTemplateBlock = (
  rule: TemplateDerivationRule,
  match: TemplateRuleBlockMatch,
  block: MeasurementBlockRecord,
): TemplateBlock | null => {
  const x = materializeAxisBinding(rule.emit.blocks.x, match);
  const y = materializeAxisBinding(rule.emit.blocks.y, match);
  if (!x || !y) {
    return null;
  }

  return {
    rowRange: getBlockDataRowRange(block),
    x,
    y,
    segmentation: {
      kind: rule.emit.blocks.segmentation.kind,
    },
    legend: {
      target: rule.emit.blocks.legend.target,
    },
    titles: rule.emit.blocks.titles
      ? {
          bottom: rule.emit.blocks.titles.bottom
            ? resolveTemplateValue(rule.emit.blocks.titles.bottom, match, block)
            : undefined,
          left: rule.emit.blocks.titles.left
            ? resolveTemplateValue(rule.emit.blocks.titles.left, match, block)
            : undefined,
        }
      : undefined,
  };
};

const materializeAxisBinding = (
  projection: TemplateColumnProjection,
  match: TemplateRuleBlockMatch,
): TemplateAxisBinding | null => {
  if (projection.columns.kind === "literalColumns") {
    return {
      columns: projection.columns.columns,
      unit: projection.unit ? resolveTemplateValue(projection.unit, match, null) : undefined,
    };
  }

  const capture = readColumnsCapture(match.captures[projection.columns.capture]);
  if (!capture) {
    return null;
  }

  return {
    columns: capture.columns,
    unit: projection.unit
      ? resolveTemplateValue(projection.unit, match, null)
      : capture.unit ?? undefined,
  };
};

const resolveTemplateValue = (
  expression: TemplateValueExpression,
  match: TemplateRuleBlockMatch | undefined,
  block: MeasurementBlockRecord | null,
): string => {
  switch (expression.kind) {
    case "literal":
      return expression.value;
    case "capturedCommonUnit": {
      const capture = match ? match.captures[expression.capture] : undefined;
      if (capture?.kind === "columns") {
        return capture.unit ?? "";
      }
      if (capture?.kind === "units") {
        return capture.units.length === 1 ? capture.units[0] ?? "" : "";
      }
      return "";
    }
    case "matchedBlockLabel":
      return block?.label ?? "";
    case "matchedBlockFamily":
      return block?.family ?? "";
    case "matchedBlockMode":
      return block?.ivMode ?? block?.itMode ?? "";
  }
};

const readColumnsCapture = (
  capture: TemplateRuleCapture | undefined,
): Extract<TemplateRuleCapture, { readonly kind: "columns" }> | null =>
  capture?.kind === "columns" && capture.columns.length
    ? capture
    : null;

const getMatchedBlock = (
  evidence: AssessmentEvidence,
  match: TemplateRuleBlockMatch | undefined,
): MeasurementBlockRecord | null =>
  match?.blockId
    ? evidence.blocks.find(block => block.id === match.blockId) ?? null
    : evidence.blocks[0] ?? null;

const getBlockDataRowRange = (
  block: MeasurementBlockRecord,
): TemplateRowRange => {
  const sourceRange = block.source.dataRange ?? block.source.fullRange;
  return {
    startRow: sourceRange.startRow,
    endRow: sourceRange.endRow,
  };
};

const getCandidateConfidence = (
  matches: readonly TemplateRuleBlockMatch[],
  evidence: AssessmentEvidence,
): number => {
  const confidences = matches
    .map(match => getMatchedBlock(evidence, match)?.confidence)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!confidences.length) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, Math.min(...confidences)));
};
