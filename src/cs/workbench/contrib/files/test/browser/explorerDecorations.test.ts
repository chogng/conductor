/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	ExplorerDecorationsProvider,
	createExplorerDecorationDataFromReviewSummary,
	createExplorerDecorationResource,
} from "src/cs/workbench/contrib/files/browser/views/explorerDecorationsProvider";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import type { IExplorerService } from "src/cs/workbench/contrib/files/browser/files";
import type {
	IReviewService,
	ReviewChangeEvent,
} from "src/cs/workbench/services/review/common/review";
import type {
	ReviewSummary,
	ReviewSummaryTarget,
} from "src/cs/workbench/services/review/common/reviewModel";

suite("workbench/contrib/files/browser/views/explorerDecorationsProvider", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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
				reviewedType: "transfer",
				reviewedSemanticLabel: "Detected Transfer",
				reviewSignature: "review:a",
				templateFingerprint: "template:a",
			}),
			{
				letter: "transfer",
				tooltip: "Detected Transfer",
			},
		);

		assert.deepEqual(
			createExplorerDecorationDataFromReviewSummary({
				resource,
				state: "pending",
				findingCodes: [],
			}),
			{
				letter: "...",
				tooltip: "files.decorations.reviewPending",
			},
		);

		assert.equal(
			createExplorerDecorationDataFromReviewSummary({
				resource,
				sheetId: "table-a",
				state: "ready",
				confidence: 0.95,
				findingCodes: [],
				message: "Template is ready.",
				reviewedSemanticLabel: "Detected Transfer",
				reviewSignature: "review:a",
				templateFingerprint: "template:a",
			}),
			undefined,
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
		const summary: ReviewSummary = {
			resource: URI.file("/workspace/Missing.csv"),
			state: "missing",
			findingCodes: [],
		};

		assert.equal(createExplorerDecorationDataFromReviewSummary(summary), undefined);
		assert.equal(createExplorerDecorationDataFromReviewSummary(undefined), undefined);
	});

	test("queries review summaries with resource and sheet targets", () => {
		const resource = URI.file("/workspace/Transfer.xlsx");
		const calls: ReviewSummaryTarget[] = [];
		const provider = store.add(new ExplorerDecorationsProvider(
			createExplorerServiceForTest([{
				fileId: "file-a",
				fileName: "Transfer.xlsx",
				resource,
				sheetId: "sheet-a",
			}]),
			createReviewServiceForTest(calls),
		));

		const decoration = provider.provideDecorations(resource.with({
			fragment: "conductor.sheetId=sheet-a",
		}));

		assert.equal(decoration?.letter, "transfer");
		assert.equal(calls[0]?.resource.toString(), resource.toString());
		assert.equal(calls[0]?.sheetId, "sheet-a");
	});

	test("does not query review summaries for entries without resources", () => {
		const resource = URI.file("/workspace/PathOnly.xlsx");
		const calls: ReviewSummaryTarget[] = [];
		const provider = store.add(new ExplorerDecorationsProvider(
			createExplorerServiceForTest([{
				fileId: "file-a",
				fileName: "PathOnly.xlsx",
				sheetId: "sheet-a",
				sourcePath: resource.fsPath,
			}]),
			createReviewServiceForTest(calls),
		));

		const decoration = provider.provideDecorations(
			createExplorerDecorationResource(resource, "sheet-a"),
		);

		assert.equal(decoration, undefined);
		assert.deepEqual(calls, []);
	});

	test("fires decoration changes for the changed resource entry", () => {
		const resource = URI.file("/workspace/Transfer.xlsx");
		const reviewChanged = new Emitter<ReviewChangeEvent>();
		const changedResources: URI[][] = [];
		const provider = store.add(new ExplorerDecorationsProvider(
			createExplorerServiceForTest([{
				fileId: "file-a",
				fileName: "Transfer.xlsx",
				resource,
				sheetId: "sheet-a",
			}]),
			createReviewServiceForTest([], reviewChanged.event),
		));
		store.add(provider.onDidChange(resources => changedResources.push([...resources])));

		reviewChanged.fire([{ resource, sheetId: "sheet-a" }]);

		assert.equal(changedResources.length, 1);
		assert.equal(changedResources[0]?.[0]?.with({ fragment: "" }).toString(), resource.toString());
		assert.equal(changedResources[0]?.[0]?.fragment, "conductor.sheetId=sheet-a");
	});

	test("does not invalidate explorer entries outside the review change", () => {
		const resource = URI.file("/workspace/Transfer.xlsx");
		const otherResource = URI.file("/workspace/Other.xlsx");
		const reviewChanged = new Emitter<ReviewChangeEvent>();
		const changedResources: URI[][] = [];
		const provider = store.add(new ExplorerDecorationsProvider(
			createExplorerServiceForTest([{
				fileId: "file-a",
				fileName: "Transfer.xlsx",
				resource,
				sheetId: "sheet-a",
			}, {
				fileId: "file-b",
				fileName: "Other.xlsx",
				resource: otherResource,
				sheetId: "sheet-b",
			}]),
			createReviewServiceForTest([], reviewChanged.event),
		));
		store.add(provider.onDidChange(resources => changedResources.push([...resources])));

		reviewChanged.fire([{ resource, sheetId: "sheet-a" }]);

		assert.equal(changedResources.length, 1);
		assert.equal(changedResources[0]?.length, 1);
		assert.equal(changedResources[0]?.[0]?.with({ fragment: "" }).toString(), resource.toString());
	});

	test("does not infer a sheet target from a bare decoration resource", () => {
		const resource = URI.file("/workspace/MultiSheet.xlsx");
		const calls: ReviewSummaryTarget[] = [];
		const provider = store.add(new ExplorerDecorationsProvider(
			createExplorerServiceForTest([{
				fileId: "file-a",
				fileName: "MultiSheet.xlsx",
				resource,
				sheetId: "sheet-a",
			}, {
				fileId: "file-b",
				fileName: "MultiSheet.xlsx",
				resource,
				sheetId: "sheet-b",
			}]),
			createReviewServiceForTest(calls),
		));

		const decoration = provider.provideDecorations(resource);

		assert.equal(decoration?.letter, "transfer");
		assert.equal(calls[0]?.resource.toString(), resource.toString());
		assert.equal(calls[0]?.sheetId, null);
	});

	test("does not query review for resources outside the explorer input", () => {
		const resource = URI.file("/workspace/Transfer.xlsx");
		const calls: ReviewSummaryTarget[] = [];
		const provider = store.add(new ExplorerDecorationsProvider(
			createExplorerServiceForTest([{
				fileId: "file-a",
				fileName: "Transfer.xlsx",
				resource,
				sheetId: "sheet-a",
			}]),
			createReviewServiceForTest(calls),
		));

		assert.equal(provider.provideDecorations(URI.file("/workspace/Other.xlsx")), undefined);
		assert.equal(
			provider.provideDecorations(createExplorerDecorationResource(resource, "missing-sheet")),
			undefined,
		);
		assert.deepEqual(calls, []);
	});

	test("does not fire decoration changes for entries without resources", () => {
		const resource = URI.file("/workspace/PathOnly.xlsx");
		const reviewChanged = new Emitter<ReviewChangeEvent>();
		const changedResources: URI[][] = [];
		const provider = store.add(new ExplorerDecorationsProvider(
			createExplorerServiceForTest([{
				fileId: "file-a",
				fileName: "PathOnly.xlsx",
				sheetId: "sheet-a",
				sourcePath: resource.fsPath,
			}]),
			createReviewServiceForTest([], reviewChanged.event),
		));
		store.add(provider.onDidChange(resources => changedResources.push([...resources])));

		reviewChanged.fire([{ resource, sheetId: "sheet-a" }]);

		assert.deepEqual(changedResources, []);
	});
});

const createExplorerServiceForTest = (
	files: readonly ExplorerFileEntry[],
): IExplorerService => ({
	_serviceBrand: undefined,
	files: [...files],
	getPaneInput: () => ({
		mode: "table",
		selectedResource: null,
		selectedSheetId: null,
		selectionKind: "table",
	}),
	hasPendingSourceFiles: false,
	onDidChangeFiles: Event.None as Event<void>,
	onDidChangePaneInput: Event.None as Event<void>,
	setEditable: () => undefined,
	setHoveredResource: () => undefined,
} as unknown as IExplorerService);

const createReviewServiceForTest = (
	calls: ReviewSummaryTarget[],
	onDidChangeReview: Event<ReviewChangeEvent> = Event.None as Event<ReviewChangeEvent>,
): IReviewService => ({
	_serviceBrand: undefined,
	getLatestReviewSummary: target => {
		calls.push(target);
		return {
			resource: target.resource,
			...(target.sheetId ? { sheetId: target.sheetId } : {}),
			state: "ready",
			confidence: 0.95,
			findingCodes: [],
			reviewedType: "transfer",
			reviewedSemanticLabel: "transfer",
		};
	},
	onDidChangeReview,
	confirmReviewedTemplate: async () => null,
	resolveReviewSummary: async target => ({
		resource: target.resource,
		...(target.sheetId ? { sheetId: target.sheetId } : {}),
		state: "ready",
		confidence: 0.95,
		findingCodes: [],
		reviewedType: "transfer",
		reviewedSemanticLabel: "transfer",
	}),
	reviewResourceManualTemplate: async () => ({
		kind: "invalid",
		diagnostics: [],
		suggestedActions: [],
	}),
	reviewResourceForExecution: async () => null,
});
