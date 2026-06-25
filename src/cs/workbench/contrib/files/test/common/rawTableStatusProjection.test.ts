/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	createRawTableStatusProjection,
	createRawTableStatusSignature,
} from "src/cs/workbench/contrib/files/common/rawTableStatusProjection";
import type { FileRecord } from "src/cs/workbench/services/session/common/sessionModel";
import type { RawTableReviewRecord } from "src/cs/workbench/services/review/common/review";
import type { SliceRun } from "src/cs/workbench/services/slice/common/slice";
import type { Template } from "src/cs/workbench/services/template/common/template";

suite("workbench/contrib/files/common/rawTableStatusProjection", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("projects system-recommended review decisions without recomputing policy", () => {
		const file = createFileRecord({
			review: createReviewRecord({
				decision: {
					kind: "ready",
					reviewedTemplate: createReviewedTemplate(),
					application: {
						kind: "systemRecommended",
						reason: "review.ready.systemRecommended",
					},
					summary: "Ready",
					suggestedActions: [],
				},
			}),
		});

		const status = createRawTableStatusProjection({
			file,
			rawTableId: "table-a",
		});

		assert.equal(status.kind, "systemRecommended");
		assert.equal(status.kind === "systemRecommended" && status.templateFingerprint, "template:test");
	});

	test("projects user-action review decisions separately from system recommendations", () => {
		const file = createFileRecord({
			review: createReviewRecord({
				decision: {
					kind: "ready",
					reviewedTemplate: createReviewedTemplate(),
					application: {
						kind: "userActionRequired",
						reason: "review.ready.lowConfidence",
					},
					summary: "Ready but needs confirmation",
					suggestedActions: [],
				},
			}),
		});

		const status = createRawTableStatusProjection({
			file,
			rawTableId: "table-a",
		});

		assert.equal(status.kind, "userActionRequired");
		assert.equal(status.kind === "userActionRequired" && status.reason, "review.ready.lowConfidence");
	});

	test("projects current slice state before review state", () => {
		const file = createFileRecord({
			review: createReviewRecord({
				decision: {
					kind: "ready",
					reviewedTemplate: createReviewedTemplate(),
					application: {
						kind: "systemRecommended",
						reason: "review.ready.systemRecommended",
					},
					summary: "Ready",
					suggestedActions: [],
				},
			}),
		});

		const status = createRawTableStatusProjection({
			file,
			rawTableId: "table-a",
			sliceFileState: { state: "processing" },
		});

		assert.equal(status.kind, "sliceProcessing");
	});

	test("projects latest current slice run before review state", () => {
		const file = createFileRecord({
			review: createReviewRecord({
				decision: {
					kind: "ready",
					reviewedTemplate: createReviewedTemplate(),
					application: {
						kind: "systemRecommended",
						reason: "review.ready.systemRecommended",
					},
					summary: "Ready",
					suggestedActions: [],
				},
			}),
			sliceRun: createSliceRun(),
		});

		const status = createRawTableStatusProjection({
			file,
			rawTableId: "table-a",
		});

		assert.equal(status.kind, "sliced");
		assert.equal(status.kind === "sliced" && status.runId, "slice-a");
	});

	test("projects the latest current slice run for the requested raw table", () => {
		const file = createFileRecord({
			review: createReviewRecord({
				decision: {
					kind: "ready",
					reviewedTemplate: createReviewedTemplate(),
					application: {
						kind: "systemRecommended",
						reason: "review.ready.systemRecommended",
					},
					summary: "Ready",
					suggestedActions: [],
				},
			}),
			sliceRuns: [
				createSliceRun({
					id: "slice-table-a",
					rawTableId: "table-a",
				}),
				createSliceRun({
					id: "slice-table-b",
					rawTableId: "table-b",
				}),
			],
			latestSliceRunId: "slice-table-b",
		});

		const status = createRawTableStatusProjection({
			file,
			rawTableId: "table-a",
		});

		assert.equal(status.kind, "sliced");
		assert.equal(status.kind === "sliced" && status.runId, "slice-table-a");
	});

	test("does not attach stale or wrong-table model to a raw table", () => {
		const file = createFileRecord({
			review: {
				...createReviewRecord({
					decision: {
						kind: "invalid",
						summary: "Invalid",
						reasons: ["review.noCandidates"],
						diagnostics: [],
						suggestedActions: [],
					},
				}),
				sourceRawTableVersion: 0,
			},
			sliceRun: {
				...createSliceRun(),
				rawTableId: "table-b",
			},
		});

		const status = createRawTableStatusProjection({
			file,
			rawTableId: "table-a",
		});

		assert.equal(status.kind, "reviewStale");
	});

	test("creates stable signatures for status equality", () => {
		assert.equal(
			createRawTableStatusSignature({
				kind: "sliceFailed",
				rawTableId: "table-a",
				code: "slice.failed",
				message: "Failed",
			}),
			createRawTableStatusSignature({
				kind: "sliceFailed",
				rawTableId: "table-a",
				code: "slice.failed",
				message: "Failed",
			}),
		);
		assert.notEqual(
			createRawTableStatusSignature({
				kind: "sliceFailed",
				rawTableId: "table-a",
				code: "slice.failed",
				message: "Failed",
			}),
			createRawTableStatusSignature({
				kind: "sliceSkipped",
				rawTableId: "table-a",
				code: "slice.skipped",
				message: "Skipped",
			}),
		);
	});
});

const createFileRecord = ({
	latestSliceRunId,
	review,
	sliceRun,
	sliceRuns,
}: {
	readonly latestSliceRunId?: string;
	readonly review?: RawTableReviewRecord;
	readonly sliceRun?: SliceRun;
	readonly sliceRuns?: readonly SliceRun[];
} = {}): FileRecord => {
	const runs = sliceRuns ?? (sliceRun ? [sliceRun] : []);
	const fallbackLatestRunId = runs.length ? runs[runs.length - 1]!.id : undefined;
	return {
		id: "file-a",
		name: "Transfer.csv",
		kind: "csv",
		raw: {
			fileId: "file-a",
			fileName: "Transfer.csv",
			tableOrder: ["table-a"],
			tablesById: {},
		},
		rawTableVersionsById: {
			"table-a": 1,
			"table-b": 1,
		},
		tableModelByRawTableId: {},
		rawTableReviewsByRawTableId: review
			? {
					[review.rawTableId]: review,
				}
			: {},
		measurementBlocksById: {},
		measurementBlockOrder: [],
		sliceRunsById: Object.fromEntries(runs.map(run => [run.id, run])),
		latestSliceRunId: latestSliceRunId ?? sliceRun?.id ?? fallbackLatestRunId,
		seriesById: {},
		seriesOrder: [],
		curvesByKey: {},
		metricsByKey: {},
	};
};

const createReviewRecord = ({
	decision,
}: {
	readonly decision: RawTableReviewRecord["decision"];
}): RawTableReviewRecord => ({
	fileId: "file-a",
	rawTableId: "table-a",
	sourceRawTableVersion: 1,
	evidenceSignature: "evidence:test",
	recipeFingerprint: "recipe:test",
	userTemplateCatalogVersion: 1,
	userTemplateEffectiveFingerprint: "templates:test",
	reviewEngineVersion: 1,
	reviewPolicyVersion: 1,
	candidates: [],
	reviews: [],
	decision,
	createdAt: 1,
});

const createReviewedTemplate = (): RawTableReviewRecord["decision"] extends infer _Decision
	? NonNullable<Extract<RawTableReviewRecord["decision"], { readonly kind: "ready" }>["reviewedTemplate"]>
	: never => ({
	candidateId: "candidate-a",
	source: {
		kind: "recipe",
		recipeId: "recipe:test",
		recipeVersion: 1,
	},
	template: createTemplate(),
	templateFingerprint: "template:test",
	review: {
		candidateId: "candidate-a",
		templateFingerprint: "template:test",
		status: "ready",
		confidence: 0.9,
		reasons: [],
		diagnostics: [],
	},
});

const createSliceRun = ({
	id = "slice-a",
	rawTableId = "table-a",
	sourceRawTableVersion = 1,
}: {
	readonly id?: string;
	readonly rawTableId?: string;
	readonly sourceRawTableVersion?: number;
} = {}): SliceRun => ({
	id,
	fileId: "file-a",
	rawTableId,
	mode: "auto",
	selection: { kind: "auto" },
	sourceRawTableVersion,
	template: createTemplate(),
	templateFingerprint: "template:test",
	inputRanges: [],
	outputSeriesIds: [],
	outputCurveKeys: [],
	warnings: [],
	errors: [],
});

const createTemplate = (): Template => ({
	schemaVersion: 1,
	name: "Transfer",
	version: 1,
	blocks: [],
	stopOnError: false,
});
