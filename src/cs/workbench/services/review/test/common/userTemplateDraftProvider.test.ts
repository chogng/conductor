/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { RawTableEvidence } from "src/cs/workbench/services/assessment/common/assessmentEvidence";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/assessment/common/rawTableStructure";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type { Template } from "src/cs/workbench/services/template/common/template";
import { deriveUserTemplateDrafts } from "src/cs/workbench/services/review/common/userTemplateDraftProvider";
import type {
	UserTemplate,
	UserTemplateSnapshot,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";

suite("workbench/services/review/test/common/userTemplateDraftProvider", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("keeps compatible user templates as ready drafts", () => {
		const drafts = deriveUserTemplateDrafts({
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

		assert.equal(drafts.length, 1);
		assert.equal(drafts[0]?.source.kind, "userTemplate");
		assert.equal(drafts[0]?.source.kind === "userTemplate" && drafts[0].source.templateId, "template-a");
		assert.equal(drafts[0]?.derivationDiagnostics.length, 0);
		assert.equal(drafts[0]?.derivationConfidence, 0.95);
	});

	test("rejects user templates with mismatched applicability", () => {
		const drafts = deriveUserTemplateDrafts({
			evidence: createEvidence(),
			userTemplateSnapshot: createUserTemplateSnapshot([createUserTemplate({
				...createTemplate(),
				id: "template-a",
				applicability: {
					schemaFingerprint: "schema-b",
				},
			})]),
		});

		assert.deepEqual(drafts, []);
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
