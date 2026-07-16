/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { TableReviewDecorationsProvider } from "src/cs/workbench/contrib/table/browser/tableReviewDecorationsProvider";
import type {
	IReviewService,
	ResourceReviewExecution,
	ReviewChangeEvent,
} from "src/cs/workbench/services/review/common/review";
import type { ISettingsService } from "src/cs/workbench/services/settings/common/settings";
import type { ISliceService } from "src/cs/workbench/services/slice/common/slice";
import type { TemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";
import {
	createTableDecorationResource,
	getTableRangeDecorationsFromDecorationData,
	type ITableService,
} from "src/cs/workbench/services/table/common/table";

suite("workbench/contrib/table/browser/tableReviewDecorationsProvider", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("ignores Review changes outside the active table", () => {
		const activeResource = URI.file("/workspace/Active.xlsx");
		const reviewChanged = new Emitter<ReviewChangeEvent>();
		store.add(reviewChanged);
		const provider = store.add(new TableReviewDecorationsProvider(
			createReviewService(reviewChanged.event),
			createSettingsService(),
			createSliceService(),
			createTableService(activeResource, "sheet-a"),
		));
		const changes: (readonly URI[] | undefined)[] = [];
		store.add(provider.onDidChange(resources => changes.push(resources)));

		reviewChanged.fire([{
			resource: URI.file("/workspace/Other.xlsx"),
			sheetId: "sheet-a",
		}]);
		reviewChanged.fire([{
			resource: activeResource,
			sheetId: "sheet-b",
		}]);
		assert.deepEqual(changes, []);

		reviewChanged.fire([{
			resource: activeResource,
			sheetId: "sheet-a",
		}]);

		assert.equal(changes.length, 1);
		assert.equal(changes[0]?.[0]?.with({ fragment: "" }).toString(), activeResource.toString());
	});

	test("projects cached Review proof ranges as Review decorations", () => {
		const activeResource = URI.file("/workspace/Active.xlsx");
		const provider = store.add(new TableReviewDecorationsProvider(
			createReviewService(
				Event.None as IReviewService["onDidChangeReview"],
				createReviewExecution(activeResource, "sheet-a"),
			),
			createSettingsService(),
			createSliceService(),
			createTableService(activeResource, "sheet-a"),
		));
		const decorationResource = createTableDecorationResource({
			resource: activeResource,
			sheetId: "sheet-a",
		});
		assert.ok(decorationResource);
		const decorationData = provider.provideDecorations(decorationResource);
		assert.ok(decorationData);

		assert.deepEqual(getTableRangeDecorationsFromDecorationData([decorationData]), [{
			kind: "reviewProof",
			sheetId: "sheet-a",
			startRow: 1,
			endRow: 10,
			startCol: 5,
			endCol: 5,
		}]);
	});

	test("does not show Review proof for a saved template selection", () => {
		const activeResource = URI.file("/workspace/Active.xlsx");
		const provider = store.add(new TableReviewDecorationsProvider(
			createReviewService(
				Event.None as IReviewService["onDidChangeReview"],
				createReviewExecution(activeResource, "sheet-a"),
			),
			createSettingsService(),
			createSliceService({ kind: "saved", templateId: "template-a" }),
			createTableService(activeResource, "sheet-a"),
		));
		const decorationResource = createTableDecorationResource({
			resource: activeResource,
			sheetId: "sheet-a",
		});
		assert.ok(decorationResource);

		assert.equal(provider.provideDecorations(decorationResource), undefined);
	});
});

const createReviewService = (
	onDidChangeReview: IReviewService["onDidChangeReview"],
	execution: ResourceReviewExecution | null = null,
): IReviewService => ({
	_serviceBrand: undefined,
	getLatestResourceReviewExecution: () => execution,
	onDidChangeReview,
} as unknown as IReviewService);

const createSettingsService = (): ISettingsService => ({
	getConductorSettings: () => ({
		tableTemplateVisualizationEnabled: true,
	}),
	onDidChangeConductorSettings: Event.None,
} as unknown as ISettingsService);

const createSliceService = (
	selection: TemplateSelection = { kind: "auto" },
): ISliceService => ({
	getTemplateSelection: () => selection,
	onDidChangeTemplateSelection: Event.None,
} as unknown as ISliceService);

const createTableService = (
	resource: URI,
	sheetId: string,
): ITableService => ({
	getViewInput: () => ({
		tableState: {
			file: {
				columnCount: 8,
				rowCount: 11,
				sheetId,
			},
			selectedSheetId: sheetId,
			source: { resource, sheetId },
		},
	}),
	onDidChangeTableViewInput: Event.None,
} as unknown as ITableService);

const createReviewExecution = (
	resource: URI,
	sheetId: string,
): ResourceReviewExecution => ({
	resource,
	sheetId,
	summary: {
		resource,
		sheetId,
		state: "ready",
		findingCodes: [],
	},
	reviewSignature: "review:test",
	sourceModelVersion: 1,
	sourceVersion: 1,
	rowCount: 11,
	columnCount: 8,
	systemRecommendedReviewedTemplate: {
		candidateId: "candidate:test",
		source: {
			kind: "dataResource",
			bindingCandidateId: "binding:test",
			semanticRulesFingerprint: "semantic:test",
		},
		template: {
			schemaVersion: 1,
			name: "Output",
			version: 1,
			blocks: [],
			stopOnError: false,
		},
		templateFingerprint: "template:test",
		review: {
			candidateId: "candidate:test",
			interpretationFingerprint: "interpretation:test",
			status: "ready",
			confidence: 1,
			factors: {
				selectorScore: 1,
				projectionScore: 1,
				semanticScore: 1,
				dataQualityScore: 1,
				parseHealthScore: 1,
				freshnessScore: 1,
				ambiguityPenalty: 0,
				conflictPenalty: 0,
				diagnosticPenalty: 0,
			},
			findings: [],
			reasons: [],
			diagnostics: [],
		},
		evidence: {
			proofRanges: [{
				column: 5,
				startRow: 1,
				endRow: 10,
			}],
		},
	},
});
