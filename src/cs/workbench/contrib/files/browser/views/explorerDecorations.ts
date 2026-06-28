/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import type { IDecorationData } from "src/cs/workbench/services/decorations/common/decorations";
import type { ReviewSummary } from "src/cs/workbench/services/review/common/reviewModel";

export type ExplorerDecorationData = IDecorationData;

export const createExplorerDecorationDataFromReviewSummary = (
	summary: ReviewSummary | undefined,
): ExplorerDecorationData | undefined => {
	if (!summary) {
		return undefined;
	}

	switch (summary.state) {
		case "missing":
			return undefined;
		case "pending":
			return {
				letter: "...",
				tooltip: localize("files.decorations.reviewPending", "Review pending."),
			};
		case "stale":
			return {
				color: "charts.orange",
				letter: "!",
				tooltip: summary.message ?? localize("files.decorations.reviewStale", "Review is stale."),
			};
		case "ready":
			return {
				letter: getReviewSummaryBadgeLetter(summary),
				tooltip: summary.message ?? localize("files.decorations.reviewReady", "Review ready."),
			};
		case "needsAdjustment":
			return {
				color: "charts.orange",
				letter: "?",
				tooltip: summary.message ?? localize("files.decorations.reviewNeedsAdjustment", "Review needs adjustment."),
			};
		case "invalid":
			return {
				color: "charts.red",
				letter: "!",
				tooltip: summary.message ?? localize("files.decorations.reviewInvalid", "Review invalid."),
			};
	}
};

const getReviewSummaryBadgeLetter = (
	summary: ReviewSummary,
): string => {
	const label = String(summary.reviewedSemanticLabel ?? "").trim();
	return label || localize("files.decorations.reviewBadge", "Review");
};
