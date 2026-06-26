/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	createExplorerDecorationDataFromReviewSummary,
} from "src/cs/workbench/contrib/files/browser/views/explorerDecorations";
import type { TableReviewSummary } from "src/cs/workbench/services/review/common/review";

suite("workbench/contrib/files/browser/views/explorerDecorations", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("maps review summaries to explorer decoration data", () => {
		const resource = URI.file("/workspace/Transfer.csv");

		assert.deepEqual(
			createExplorerDecorationDataFromReviewSummary({
				resource,
				sheetId: "table-a",
				state: "ready",
				confidence: 0.95,
				findingCodes: [],
				message: "Template is ready.",
				reviewedSemanticLabel: "transfer",
				reviewSignature: "review:a",
				templateFingerprint: "template:a",
			}),
			{
				letter: "transfer",
				tooltip: "Template is ready.",
			},
		);

		assert.deepEqual(
			createExplorerDecorationDataFromReviewSummary({
				resource,
				sheetId: "table-a",
				state: "invalid",
				findingCodes: ["review.noCandidates"],
				message: "Review invalid.",
			}),
			{
				color: "charts.red",
				letter: "!",
				tooltip: "Review invalid.",
			},
		);
	});

	test("does not decorate missing review summaries", () => {
		const summary: TableReviewSummary = {
			resource: URI.file("/workspace/Missing.csv"),
			state: "missing",
			findingCodes: [],
		};

		assert.equal(createExplorerDecorationDataFromReviewSummary(summary), undefined);
		assert.equal(createExplorerDecorationDataFromReviewSummary(undefined), undefined);
	});
});
