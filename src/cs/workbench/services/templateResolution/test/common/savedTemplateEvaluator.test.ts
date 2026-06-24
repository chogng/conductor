/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { AssessmentEvidence } from "src/cs/workbench/services/assessment/common/assessmentEvidence";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/assessment/common/rawTableStructure";
import { evaluateSavedTemplateCandidates } from "src/cs/workbench/services/templateResolution/common/savedTemplateEvaluator";
import type { Template } from "src/cs/workbench/services/template/common/template";

suite("workbench/services/templateResolution/test/common/savedTemplateEvaluator", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("keeps compatible saved templates as ready candidates", () => {
		const candidates = evaluateSavedTemplateCandidates({
			evidence: createEvidence(),
			templateSnapshot: {
				version: 7,
				templates: [{
					...createTemplate(),
					id: "template-a",
					version: 3,
					applicability: {
						schemaFingerprint: "schema-a",
						columnCount: 2,
					},
				}],
			},
		});

		assert.equal(candidates.length, 1);
		assert.equal(candidates[0]?.source.kind, "savedTemplate");
		assert.equal(candidates[0]?.state, "ready");
		assert.equal(candidates[0]?.confidence, 0.95);
	});

	test("rejects saved templates with mismatched applicability", () => {
		const candidates = evaluateSavedTemplateCandidates({
			evidence: createEvidence(),
			templateSnapshot: {
				version: 7,
				templates: [{
					...createTemplate(),
					id: "template-a",
					applicability: {
						schemaFingerprint: "schema-b",
					},
				}],
			},
		});

		assert.deepEqual(candidates, []);
	});
});

const createEvidence = (): AssessmentEvidence => ({
	structure: {
		...createEmptyRawTableStructure(),
		fingerprint: "schema-a",
	},
	columnProfiles: [],
	layoutCandidates: [],
	semanticCandidates: [],
	blocks: [],
	sourceMetadata: {
		fileId: "file-a",
		rawTableId: "table-a",
		fileName: "Transfer.csv",
		sourceRawTableVersion: 1,
		rowCount: 3,
		columnCount: 2,
	},
});

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
	stopOnError: false,
});
