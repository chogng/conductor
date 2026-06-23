/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { AssessmentEvidence } from "src/cs/workbench/services/assessment/common/assessmentEvidence";
import type { TemplateCandidate } from "src/cs/workbench/services/assessment/common/assessment";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type {
	Template,
	TemplateAxisBinding,
} from "src/cs/workbench/services/template/common/templateSpec";
import type { TemplateSnapshot } from "src/cs/workbench/services/template/common/template";

export const evaluateSavedTemplateCandidates = ({
	evidence,
	templateSnapshot,
}: {
	readonly evidence: AssessmentEvidence;
	readonly templateSnapshot?: TemplateSnapshot;
}): readonly TemplateCandidate[] => {
	const templates = templateSnapshot?.templates ?? [];
	const candidates: TemplateCandidate[] = [];
	for (const template of templates) {
		const candidate = evaluateSavedTemplateCandidate(template, evidence);
		if (candidate) {
			candidates.push(candidate);
		}
	}

	return candidates.sort((left, right) =>
		right.confidence - left.confidence ||
		left.id.localeCompare(right.id)
	);
};

const evaluateSavedTemplateCandidate = (
	template: Template,
	evidence: AssessmentEvidence,
): TemplateCandidate | null => {
	const templateId = normalizeText(template.id);
	if (!templateId || !template.applicability?.schemaFingerprint) {
		return null;
	}

	const diagnosticCodes: string[] = [];
	if (template.applicability.schemaFingerprint !== evidence.structure.fingerprint) {
		return null;
	}
	if (
		typeof template.applicability.columnCount === "number" &&
		template.applicability.columnCount !== evidence.sourceMetadata.columnCount
	) {
		diagnosticCodes.push("savedTemplate.columnCountMismatch");
	}
	if (!isTemplateWithinSourceBounds(template, evidence)) {
		diagnosticCodes.push("savedTemplate.outOfBounds");
	}

	const templateFingerprint = createTemplateFingerprint(template);
	return {
		id: `candidate:savedTemplate:${templateId}:${template.version}`,
		source: {
			kind: "savedTemplate",
			templateId,
			templateVersion: template.version,
		},
		template,
		templateFingerprint,
		confidence: diagnosticCodes.length ? 0.7 : 0.98,
		state: diagnosticCodes.length ? "review" : "ready",
		reasons: ["Exact schema fingerprint matched saved template applicability."],
		diagnosticCodes,
	};
};

const isTemplateWithinSourceBounds = (
	template: Template,
	evidence: AssessmentEvidence,
): boolean => {
	const rowCount = evidence.sourceMetadata.rowCount;
	const columnCount = evidence.sourceMetadata.columnCount;
	for (const block of template.blocks) {
		if (typeof rowCount === "number" && block.rowRange.startRow >= rowCount) {
			return false;
		}
		if (
			typeof rowCount === "number" &&
			typeof block.rowRange.endRow === "number" &&
			block.rowRange.endRow >= rowCount
		) {
			return false;
		}
		if (
			typeof columnCount === "number" &&
			(!isAxisWithinColumnBounds(block.x, columnCount) || !isAxisWithinColumnBounds(block.y, columnCount))
		) {
			return false;
		}
	}

	return true;
};

const isAxisWithinColumnBounds = (
	axis: TemplateAxisBinding,
	columnCount: number,
): boolean =>
	axis.columns.every(column => Number.isInteger(column) && column >= 0 && column < columnCount) &&
	(axis.ranges ?? []).every(range =>
		Number.isInteger(range.column) &&
		range.column >= 0 &&
		range.column < columnCount
	);

const normalizeText = (value: unknown): string => String(value ?? "").trim();
