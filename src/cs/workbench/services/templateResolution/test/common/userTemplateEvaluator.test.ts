/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { RawTableEvidence } from "src/cs/workbench/services/assessment/common/assessmentEvidence";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/assessment/common/rawTableStructure";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type { Template } from "src/cs/workbench/services/template/common/template";
import { evaluateUserTemplateCandidates } from "src/cs/workbench/services/templateResolution/common/userTemplateEvaluator";
import type {
	UserTemplate,
	UserTemplateSnapshot,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

suite("workbench/services/templateResolution/test/common/userTemplateEvaluator", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("keeps compatible user templates as ready candidates", () => {
		const candidates = evaluateUserTemplateCandidates({
			evidence: createEvidence(),
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
		assert.equal(candidates[0]?.source.kind, "userTemplate");
		assert.equal(candidates[0]?.source.templateId, "template-a");
		assert.equal(candidates[0]?.state, "ready");
		assert.equal(candidates[0]?.confidence, 0.95);
	});

	test("rejects user templates with mismatched applicability", () => {
		const candidates = evaluateUserTemplateCandidates({
			evidence: createEvidence(),
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

const createUserTemplateSnapshot = (
	templates: readonly UserTemplate[],
): UserTemplateSnapshot => ({
	version: 7,
	workspaceVersion: 0,
	globalVersion: 7,
	workspaceFingerprint: "workspace:test",
	globalFingerprint: "global:test",
	effectiveFingerprint: "effective:test",
	templates,
});

const createUserTemplate = (template: Template): UserTemplate => ({
	id: String(template.id ?? "template-a"),
	name: template.name,
	version: template.version,
	scope: "global",
	source: "userCreated",
	template,
	templateFingerprint: createTemplateFingerprint(template),
	createdAt: 0,
	updatedAt: 0,
});

const createEvidence = (): RawTableEvidence => ({
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
