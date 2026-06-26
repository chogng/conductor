/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import type { TableReviewSummary } from "src/cs/workbench/services/review/common/review";

export type ExplorerDecorationData = {
	readonly color?: string;
	readonly letter?: string;
	readonly tooltip?: string;
};

export const createExplorerDecorationDataFromReviewSummary = (
	summary: TableReviewSummary | undefined,
): ExplorerDecorationData | undefined => {
	if (!summary || summary.state === "missing") {
		return undefined;
	}

	switch (summary.state) {
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
	summary: TableReviewSummary,
): string => {
	const label = String(summary.reviewedSemanticLabel ?? "").trim();
	return label || localize("files.decorations.reviewBadge", "Review");
};
