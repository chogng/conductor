/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	deriveDataResourceReviewCandidates,
	deriveUserTemplateReviewCandidates,
} from "src/cs/workbench/services/review/common/reviewCandidate";
import {
	scoreReviewCandidate,
} from "src/cs/workbench/services/review/common/reviewDecision";
import {
	createEmptyStructuredContentStructure,
	type StructuredContentEvidence,
	type StructuredMeasurementColumnRef,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type { Template } from "src/cs/workbench/services/template/common/template";
import type { SegmentCandidate, ReviewContext, ReviewEvidence } from "src/cs/workbench/services/review/common/reviewModel";
import type {
	UserTemplate,
	UserTemplateSnapshot,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

suite("workbench/services/review/test/common/reviewCandidate", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("builds DataResource binding into a review candidate", () => {
		const context = createReviewContext(createReviewEvidence());
		const candidates = deriveDataResourceReviewCandidates({ context });

		assert.equal(candidates.length, 1);
		const candidate = candidates[0];
		assert.ok(candidate);
		assert.equal(candidate.source.kind, "dataResource");
		assert.equal(candidate.source.kind === "dataResource" && candidate.source.bindingCandidateId, "binding-a");
		assert.equal(candidate.projectionTrace.diagnostics.length, 0);
		assert.equal(candidate.interpretation.blocks.length, 1);
		assert.deepEqual(candidate.interpretation.blocks[0]?.rowRange, {
			startRow: 1,
			endRow: 3,
		});
		assert.deepEqual(candidate.interpretation.blocks[0]?.x, {
			columns: [0],
			ranges: [{
				column: 0,
				startRow: 1,
				endRow: 3,
			}],
			unit: "V",
		});
		assert.deepEqual(candidate.interpretation.blocks[0]?.y, {
			columns: [1],
			ranges: [{
				column: 1,
				startRow: 1,
				endRow: 3,
			}],
			unit: "A",
		});
		assert.deepEqual(candidate.interpretation.measurement, {
			curveFamily: "iv",
			ivMode: "transfer",
		});
		assert.equal(candidate.interpretation.reviewedType, "transfer");
		assert.ok(candidate.interpretationFingerprint.startsWith("review-interpretation:"));
	});

	test("splits X groups into line blocks", () => {
		const context = createReviewContext(createReviewEvidence({
			xGroups: true,
		}));
		const candidate = deriveDataResourceReviewCandidates({ context })[0];

		assert.ok(candidate);
		assert.equal(candidate.interpretation.blocks.length, 2);
		assert.deepEqual(candidate.interpretation.blocks.map(block => block.rowRange), [
			{ startRow: 1, endRow: 2 },
			{ startRow: 3, endRow: 4 },
		]);
		assert.equal(candidate.interpretation.blocks[0]?.legend.target, "group");
	});

	test("uses distinct multi-Y headers as y-column legends", () => {
		const context = createReviewContext(createReviewEvidence({
			multiY: true,
		}));
		const candidate = deriveDataResourceReviewCandidates({ context })[0];

		assert.ok(candidate);
		assert.equal(candidate.interpretation.blocks.length, 1);
		assert.deepEqual(candidate.interpretation.blocks[0]?.y.columns, [1, 2, 3, 4, 5]);
		assert.equal(candidate.interpretation.blocks[0]?.legend.target, "yColumn");
	});

	test("keeps compatible user templates as ready review candidates", () => {
		const candidates = deriveUserTemplateReviewCandidates({
			context: createReviewContext(createReviewEvidence()),
			userTemplateSnapshot: createUserTemplateSnapshot([createUserTemplate({
				...createTemplate(),
				id: "template-a",
				version: 3,
				applicability: {
					schemaFingerprint: "schema-a",
					columnCount: 2,
				},
			})]),
		});

		assert.equal(candidates.length, 1);
		assert.equal(candidates[0]?.source.kind, "user");
		assert.equal(candidates[0]?.source.kind === "user" && candidates[0].source.templateId, "template-a");
		assert.equal(candidates[0]?.projectionTrace.diagnostics.length, 0);
		assert.equal(candidates[0]?.confidence, 0.95);
		assert.notEqual(candidates[0]?.interpretationFingerprint, createTemplateFingerprint(candidates[0]?.interpretation as Template));
		assert.equal(candidates[0]?.interpretationFingerprint.startsWith("review-interpretation:"), true);
	});

	test("treats missing URI candidate versions as stale", () => {
		const context = createReviewContext(createReviewEvidence());
		const candidate = deriveDataResourceReviewCandidates({ context })[0];
		assert.ok(candidate);
		const { modelVersion, ...candidateWithoutModelVersion } = candidate;
		assert.equal(modelVersion, 3);

		const staleReview = scoreReviewCandidate({
			candidate: candidateWithoutModelVersion,
			context,
		});

		assert.equal(staleReview.status, "invalid");
		assert.equal(staleReview.findings.some(finding => finding.code === "review.staleModelVersion"), true);
	});

	test("treats mismatched URI content hashes as stale", () => {
		const context = createReviewContext(createReviewEvidence(), { contentHash: "sha256:first" });
		const candidate = deriveDataResourceReviewCandidates({ context })[0];
		assert.ok(candidate);

		const staleReview = scoreReviewCandidate({
			candidate,
			context: {
				...context,
				contentHash: "sha256:second",
			},
		});

		assert.equal(staleReview.status, "invalid");
		assert.equal(staleReview.findings.some(finding => finding.code === "review.staleContentHash"), true);
	});

	test("exports review candidates as segment candidates for the content-first pipeline", () => {
		const context = createReviewContext(createReviewEvidence(), { contentHash: "sha256:first" });
		const candidate = deriveDataResourceReviewCandidates({ context })[0];
		assert.ok(candidate);
		const segmentCandidate: SegmentCandidate = candidate;

		assert.ok(segmentCandidate);
		assert.equal(segmentCandidate.contentHash, "sha256:first");
		assert.equal(segmentCandidate.evidenceFingerprint, "evidence:test");
	});

	test("rejects user templates with mismatched applicability", () => {
		const candidates = deriveUserTemplateReviewCandidates({
			context: createReviewContext(createReviewEvidence()),
			userTemplateSnapshot: createUserTemplateSnapshot([createUserTemplate({
				...createTemplate(),
				id: "template-a",
				applicability: {
					schemaFingerprint: "schema-b",
				},
			})]),
		});

		assert.deepEqual(candidates, []);
	});
});

const createReviewContext = (
	evidence: ReviewEvidence,
	options: {
		readonly contentHash?: string;
	} = {},
): ReviewContext => ({
	resource: URI.file("/workspace/transfer.csv"),
	...(options.contentHash ? { contentHash: options.contentHash } : {}),
	modelVersion: 3,
	sourceVersion: 4,
	evidenceFingerprint: "evidence:test",
	evidence,
});

const createUserTemplateSnapshot = (
	templates: readonly UserTemplate[],
): UserTemplateSnapshot => ({
	version: 7,
	workspaceVersion: 0,
	profileVersion: 7,
	workspaceFingerprint: "workspace:test",
	profileFingerprint: "profile:test",
	effectiveFingerprint: "effective:test",
	templates,
});

const createUserTemplate = (template: Template): UserTemplate => ({
	id: String(template.id ?? "template-a"),
	name: template.name,
	version: template.version,
	scope: "profile",
	source: "userCreated",
	template,
	templateFingerprint: createTemplateFingerprint(template),
	createdAt: 0,
	updatedAt: 0,
});

const createReviewEvidence = (options: {
	readonly multiY?: boolean;
	readonly xGroups?: boolean;
} = {}): ReviewEvidence => ({
	sourceMetadata: {
		fileName: "Transfer.csv",
		rowCount: options.xGroups ? 5 : 4,
		columnCount: options.multiY ? 6 : 2,
	},
	structuredContent: createStructuredContentEvidence(options),
});

const createStructuredContentEvidence = ({
	multiY = false,
	xGroups = false,
}: {
	readonly multiY?: boolean;
	readonly xGroups?: boolean;
} = {}): StructuredContentEvidence => {
	const dependentColumns = multiY ? [1, 2, 3, 4, 5] : [1];
	const dependentHeaders = multiY ? ["-2", "-1", "0", "1", "2"] : ["Id"];
	const endCol = dependentColumns[dependentColumns.length - 1] ?? 1;
	const endRow = xGroups ? 4 : 3;
	const measurementColumns: StructuredMeasurementColumnRef[] = [{
		rawCol: 0,
		role: "vg",
		unit: "V",
		headerText: "Vg",
		confidence: 0.95,
		dataRange: {
			startRow: 1,
			endRow,
			startCol: 0,
			endCol: 0,
		},
	}, ...dependentColumns.map((column, index): StructuredMeasurementColumnRef => ({
		rawCol: column,
		role: multiY ? "current" : "id",
		unit: "A",
		headerText: dependentHeaders[index] ?? `Y${index + 1}`,
		confidence: 0.95,
		dataRange: {
			startRow: 1,
			endRow,
			startCol: column,
			endCol: column,
		},
	}))];

	return {
		structure: {
			...createEmptyStructuredContentStructure(),
			fingerprint: "schema-a",
		},
		columnProfiles: [{
			rawCol: 0,
			headerText: "Vg",
			normalizedHeader: "vg",
			kind: "numeric",
		}, ...dependentColumns.map((column, index) => ({
			rawCol: column,
			headerText: dependentHeaders[index] ?? `Y${index + 1}`,
			normalizedHeader: String(dependentHeaders[index] ?? `Y${index + 1}`).toLowerCase(),
			kind: "numeric" as const,
		}))],
		xRangeCandidates: [{
			id: "x-range-a",
			column: 0,
			startRow: 1,
			endRow,
			direction: xGroups ? "mixed" : "ascending",
			stepKind: xGroups ? "segmentedConstant" : "constant",
			step: 1,
			pointCount: xGroups ? 4 : 3,
			confidence: 0.95,
			reasons: ["xRange.test"],
		}],
		xGroupCandidates: xGroups
			? [{
				id: "x-group-a",
				xRangeCandidateId: "x-range-a",
				startRow: 1,
				endRow: 2,
				direction: "ascending",
				groupKind: "singleMonotonicRun",
				lineIndex: 0,
				confidence: 0.95,
				reasons: [],
			}, {
				id: "x-group-b",
				xRangeCandidateId: "x-range-a",
				startRow: 3,
				endRow: 4,
				direction: "descending",
				groupKind: "directionBreak",
				lineIndex: 1,
				confidence: 0.95,
				reasons: [],
			}]
			: [],
		dataBlockCandidates: [{
			id: "data-block-a",
			xRangeCandidateId: "x-range-a",
			xGroupCandidateIds: xGroups ? ["x-group-a", "x-group-b"] : [],
			startRow: 1,
			endRow,
			startCol: 0,
			endCol,
			xColumn: 0,
			dependentColumns,
			separatorColumns: [],
			columnDirection: "rightPreferred",
			confidence: 0.95,
			reasons: ["dataBlock.test"],
		}],
		dependentValueCandidates: dependentColumns.map((column, index) => ({
			id: `dependent-${index + 1}`,
			column,
			xRangeCandidateIds: ["x-range-a"],
			dataBlockCandidateIds: ["data-block-a"],
			numericCoverage: 1,
			confidence: 0.95,
			reasons: ["dependent.test"],
		})),
		columnTitleSpans: [],
		infoCellNeighborhoods: [],
		bindingCandidates: [{
			id: "binding-a",
			xRangeCandidateIds: ["x-range-a"],
			dependentValueCandidateIds: dependentColumns.map((_, index) => `dependent-${index + 1}`),
			dataBlockCandidateIds: ["data-block-a"],
			relation: multiY ? "oneX-manyY" : "oneX-oneY",
			confidence: 0.95,
			ambiguityCodes: [],
			reasons: ["binding.test"],
		}],
		semanticRulesFingerprint: "semantic:test",
		semanticCandidates: [],
		groups: [],
		blocks: [{
			id: "data-block-a",
			fileId: "file-a",
			rawTableId: "table-a",
			label: "Detected IV Transfer",
			type: "transfer",
			family: "iv",
			ivMode: "transfer",
			source: {
				fullRange: {
					startRow: 0,
					endRow,
					startCol: 0,
					endCol,
				},
				dataRange: {
					startRow: 1,
					endRow,
					startCol: 0,
					endCol,
				},
			},
			columns: {
				columns: measurementColumns,
			},
			rowCount: xGroups ? 4 : 3,
			columnCount: endCol + 1,
			confidence: 0.95,
			diagnosticCodes: [],
		}],
		diagnostics: [],
	};
};

const createTemplate = (): Template => ({
	schemaVersion: 1,
	name: "Transfer",
	version: 1,
	blocks: [{
		rowRange: {
			startRow: 1,
			endRow: "end",
		},
		x: {
			columns: [0],
			unit: "V",
		},
		y: {
			columns: [1],
			unit: "A",
		},
		segmentation: {
			kind: "auto",
		},
		legend: {
			target: "auto",
		},
	}],
});
