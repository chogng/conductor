/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { ImportFileAssessment } from "src/cs/workbench/services/assessment/common/assessment";
import type { AssessmentDecision } from "src/cs/workbench/services/assessment/common/assessmentDecision";
import type { MeasurementColumnRef } from "src/cs/workbench/services/assessment/common/measurement";
import type { MeasurementColumnProfile } from "src/cs/workbench/services/assessment/common/columnProfile";
import type { LayoutCandidate } from "src/cs/workbench/services/assessment/common/layoutCandidate";
import { getBestReadyLayoutCandidate } from "src/cs/workbench/services/assessment/common/layoutCandidate";
import { getAssessmentConfidenceScore } from "src/cs/workbench/services/assessment/common/assessmentRecord";

export const createAssessmentDecision = ({
	assessment,
	columnProfile,
	layoutCandidates,
}: {
	readonly assessment: ImportFileAssessment;
	readonly columnProfile: MeasurementColumnProfile;
	readonly layoutCandidates?: readonly LayoutCandidate[];
}): AssessmentDecision => {
	const confidence = getAssessmentConfidenceScore(assessment);
	const reasons = [...assessment.curveTypeReasons];
	const family = assessment.curveFamily;
	if (family === "unknown") {
		const readyLayout = getBestReadyLayoutCandidate(layoutCandidates);
		if (readyLayout) {
			return {
				state: "reviewRequired",
				autoApplyAllowed: false,
				confidence,
				reasons: appendReason(
					reasons,
					"Layout is ready, but measurement semantics need review.",
				),
			};
		}

		return {
			state: "unknown",
			autoApplyAllowed: false,
			confidence,
			reasons: appendReason(reasons, "Assessment could not determine a measurement family."),
		};
	}

	const bindings = hasRequiredBindings(assessment, columnProfile.columns);
	if (!bindings) {
		return {
			state: "reviewRequired",
			autoApplyAllowed: false,
			confidence,
			reasons: appendReason(reasons, "Required measurement column bindings or units are incomplete."),
		};
	}

	if (confidence >= 0.9 && !assessment.curveTypeNeedsTemplate) {
		return {
			state: "ready",
			autoApplyAllowed: true,
			confidence,
			reasons,
		};
	}

	return {
		state: "inferred",
		autoApplyAllowed: false,
		confidence,
		reasons: appendReason(reasons, "Assessment is not confirmed enough for automatic calculation."),
	};
};

const hasRequiredBindings = (
	assessment: ImportFileAssessment,
	columns: readonly MeasurementColumnRef[],
): boolean => {
	switch (assessment.curveFamily) {
		case "iv":
			return hasIvBindings(assessment, columns);
		case "cv":
			return hasRoleWithUnit(columns, ["voltage", "vg", "vd"]) &&
				hasRoleWithUnit(columns, ["capacitance"]);
		case "cf":
			return columns.some(column => column.unit === "Hz") &&
				hasRoleWithUnit(columns, ["capacitance"]);
		case "pv":
			return hasRoleWithUnit(columns, ["voltage", "vg", "vd"]) &&
				hasRoleWithUnit(columns, ["current", "id"]);
		case "it":
			return hasRoleWithUnit(columns, ["time"]) &&
				hasRoleWithUnit(columns, ["current", "id"]);
		case "unknown":
			return false;
	}
};

const hasIvBindings = (
	assessment: ImportFileAssessment,
	columns: readonly MeasurementColumnRef[],
): boolean => {
	const xRoles: readonly MeasurementColumnRef["role"][] = assessment.xAxisRole === "vg"
		? ["vg"]
		: assessment.xAxisRole === "vd"
			? ["vd"]
			: ["vg", "vd", "voltage"];
	return hasRoleWithUnit(columns, xRoles) &&
		hasRoleWithUnit(columns, ["id", "current"]);
};

const hasRoleWithUnit = (
	columns: readonly MeasurementColumnRef[],
	roles: readonly MeasurementColumnRef["role"][],
): boolean =>
	columns.some(column =>
		roles.includes(column.role) &&
		Boolean(column.unit)
	);

const appendReason = (
	reasons: readonly string[],
	reason: string,
): readonly string[] =>
	reasons.includes(reason)
		? reasons
		: [...reasons, reason];
