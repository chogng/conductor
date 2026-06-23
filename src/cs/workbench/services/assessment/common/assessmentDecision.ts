/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type AssessmentDecisionState =
	| "ready"
	| "inferred"
	| "reviewRequired"
	| "unknown"
	| "failed";

export type AssessmentDecision = {
	readonly state: AssessmentDecisionState;
	readonly autoApplyAllowed: boolean;
	readonly confidence: number;
	readonly reasons: readonly string[];
};

export const createUnknownAssessmentDecision = (
	reasons: readonly string[] = [],
): AssessmentDecision => ({
	state: "unknown",
	autoApplyAllowed: false,
	confidence: 0,
	reasons,
});
