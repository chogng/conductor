/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { AssessmentEvidence } from "src/cs/workbench/services/assessment/common/assessmentEvidence";
import { evaluateSavedTemplateCandidates } from "src/cs/workbench/services/assessment/common/savedTemplateEvaluator";
import { materializeTemplateRuleCandidate } from "src/cs/workbench/services/assessment/common/templateMaterializer";
import { evaluateTemplateRule } from "src/cs/workbench/services/assessment/common/templateRuleEvaluator";
import type {
	MeasurementBlockRecord,
	MeasurementColumnRef,
} from "src/cs/workbench/services/assessment/common/measurement";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/assessment/common/rawTableStructure";
import type { Template } from "src/cs/workbench/services/template/common/template";
import { builtinTemplateRules } from "src/cs/workbench/services/templateRule/common/builtinTemplateRules.generated";

suite("workbench/services/assessment/test/common/templateCandidateMaterialization", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("materializes builtin IV transfer rule into a block-aware template", () => {
		const rule = builtinTemplateRules.find(candidate => candidate.id === "builtin.iv.transfer");
		assert.ok(rule);

		const evidence = createEvidence();
		const evaluation = evaluateTemplateRule(rule, evidence);
		const candidate = materializeTemplateRuleCandidate({
			evidence,
			evaluation,
			rule,
		});

		assert.ok(candidate);
		assert.equal(candidate.state, "ready");
		assert.equal(candidate.source.kind, "rule");
		assert.equal(candidate.template.schemaVersion, 1);
		assert.equal(candidate.template.blocks.length, 1);
		assert.deepEqual(candidate.template.blocks[0]?.rowRange, {
			startRow: 1,
			endRow: 3,
		});
		assert.deepEqual(candidate.template.blocks[0]?.x, {
			columns: [0],
			unit: "V",
		});
		assert.deepEqual(candidate.template.blocks[0]?.y, {
			columns: [1],
			unit: "A",
		});
		assert.equal(candidate.template.blocks[0]?.segmentation.kind, "auto");
		assert.ok(candidate.templateFingerprint);
	});

	test("creates saved-template candidates only for exact applicability matches", () => {
		const template: Template = {
			schemaVersion: 1,
			id: "saved.transfer",
			name: "Saved Transfer",
			version: 2,
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
			applicability: {
				schemaFingerprint: "schema-a",
				columnCount: 2,
			},
		};

		const candidates = evaluateSavedTemplateCandidates({
			evidence: createEvidence(),
			templateSnapshot: {
				version: 7,
				templates: [
					template,
					{
						...template,
						id: "saved.other",
						applicability: {
							schemaFingerprint: "schema-b",
						},
					},
				],
			},
		});

		assert.equal(candidates.length, 1);
		assert.equal(candidates[0]?.source.kind, "savedTemplate");
		assert.equal(candidates[0]?.source.kind === "savedTemplate" ? candidates[0].source.templateId : "", "saved.transfer");
		assert.equal(candidates[0]?.confidence, 0.98);
		assert.equal(candidates[0]?.state, "ready");
	});
});

const createEvidence = (): AssessmentEvidence => ({
	structure: {
		...createEmptyRawTableStructure(),
		fingerprint: "schema-a",
	},
	columnProfiles: [],
	layoutCandidates: [{
		id: "layout-a",
		layoutKind: "simpleXY",
		confidence: 0.9,
		bindings: [{
			xCol: 0,
			yCols: [1],
		}],
		reasons: [],
	}],
	semanticCandidates: [],
	blocks: [{
		id: "block-a",
		fileId: "file-a",
		rawTableId: "table-a",
		label: "Transfer",
		family: "iv",
		ivMode: "transfer",
		source: {
			fullRange: {
				startRow: 0,
				endRow: 3,
				startCol: 0,
				endCol: 1,
			},
			dataRange: {
				startRow: 1,
				endRow: 3,
				startCol: 0,
				endCol: 1,
			},
		},
		columns: {
			columns: createMeasurementColumns(),
		},
		rowCount: 4,
		columnCount: 2,
		confidence: 0.95,
		diagnosticCodes: [],
	}],
	sourceMetadata: {
		fileId: "file-a",
		rawTableId: "table-a",
		fileName: "transfer.csv",
		rowCount: 4,
		columnCount: 2,
		sourceRawTableVersion: 1,
	},
});

const createMeasurementColumns = (): readonly MeasurementColumnRef[] => [{
	rawCol: 0,
	headerText: "Vg",
	role: "vg",
	unit: "V",
}, {
	rawCol: 1,
	headerText: "Id",
	role: "id",
	unit: "A",
}];
