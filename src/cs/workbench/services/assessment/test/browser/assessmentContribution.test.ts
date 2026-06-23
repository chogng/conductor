/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter } from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { AssessmentContribution } from "src/cs/workbench/services/assessment/browser/assessment.contribution";
import { AssessmentQueueService } from "src/cs/workbench/services/assessment/browser/assessmentQueueService";
import { AssessmentService } from "src/cs/workbench/services/assessment/browser/assessmentService";
import { ASSESSMENT_RULE_VERSION } from "src/cs/workbench/services/assessment/common/assessment";
import type {
	AssessRawTableInput,
	IAssessmentService,
	ImportFileAssessment,
	RawTableAssessmentRecord,
} from "src/cs/workbench/services/assessment/common/assessment";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/assessment/common/rawTableStructure";
import type { FileImportResult } from "src/cs/workbench/services/files/common/files";
import type {
	IRawTableRowsReaderService,
	RawTableRows,
	RawTableRowsReadInput,
} from "src/cs/workbench/services/files/common/rawTableRowsReader";
import type {
	ISchemaProfileService,
	SchemaProfile,
	SchemaProfileSnapshot,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import type {
	ITemplateRuleService,
	TemplateRuleChangeEvent,
	TemplateRuleSnapshot,
} from "src/cs/workbench/services/templateRule/common/templateRule";
import type {
	ITemplateService,
	TemplateApplyPresetRecord,
	TemplateApplyPresetSaveInput,
	TemplateSnapshot,
} from "src/cs/workbench/services/template/common/template";
import { createTemplateSnapshotFromApplyPresets } from "src/cs/workbench/services/template/common/templateLegacyAdapter";
import {
	createSchemaProfileFromConfirmation,
	type ConfirmSchemaProfileInput,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfileConfirmation";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";

suite("workbench/services/assessment/test/browser/assessmentContribution", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("assesses inline raw tables after session import commits", async () => {
		const sessionService = store.add(new SessionService());
		const assessmentService = new TestAssessmentService();
		const rawTableRowsReaderService = new TestRawTableRowsReaderService();
		const assessmentQueueService = store.add(new AssessmentQueueService(
			sessionService,
			assessmentService,
			rawTableRowsReaderService,
		));
		const contribution = store.add(new AssessmentContribution(
			sessionService,
			assessmentQueueService,
		));

		sessionService.commitFileImport(createInlineImportResult());
		await settlePromises();

		const file = sessionService.getSnapshot().filesById["file-a"];
		assert.deepEqual(
			{
				assessmentVersion: file.assessmentsByRawTableId["table-a"]?.sourceRawTableVersion,
				assessedInputs: assessmentService.inputs.map(input => ({
					columnCount: input.columnCount,
					fileId: input.fileId,
					fileName: input.fileName,
					maxRows: rawTableRowsReaderService.inputs[0]?.maxRows,
					rawTableId: input.rawTableId,
					rowCount: input.rowCount,
					rows: input.rows,
					sourceRawTableVersion: input.sourceRawTableVersion,
				})),
				measurementBlockOrder: file.measurementBlockOrder,
			},
			{
				assessmentVersion: 1,
				assessedInputs: [{
					columnCount: 2,
					fileId: "file-a",
					fileName: "293K/OUTPUT/2.csv",
					maxRows: 256,
					rawTableId: "table-a",
					rowCount: 2,
					rows: [["Vg", "Id"], ["0", "1e-9"]],
					sourceRawTableVersion: 1,
				}],
				measurementBlockOrder: ["block-a"],
			},
		);

		contribution.dispose();
		assessmentQueueService.dispose();
	});

	test("commits the first assessment then batches background results", async () => {
		const sessionService = store.add(new SessionService());
		const assessmentService = new TestAssessmentService();
		const rawTableRowsReaderService = new TestRawTableRowsReaderService();
		const assessmentQueueService = store.add(new AssessmentQueueService(
			sessionService,
			assessmentService,
			rawTableRowsReaderService,
		));
		const assessmentEventSizes: number[] = [];
		const disposable = store.add(sessionService.onDidChangeSession(event => {
			if (event.reason === "assessmentChanged") {
				assessmentEventSizes.push(event.rawTableRefs?.length ?? 0);
			}
		}));
		const contribution = store.add(new AssessmentContribution(
			sessionService,
			assessmentQueueService,
		));

		sessionService.commitFileImport(createMultiInlineImportResult(18));
		await waitUntil(() => assessmentEventSizes.length === 3);

		assert.deepEqual(assessmentEventSizes, [1, 16, 1]);
		assert.equal(assessmentService.inputs.length, 18);

		disposable.dispose();
		contribution.dispose();
		assessmentQueueService.dispose();
	});

	test("reassesses restored raw tables when the assessment rule version is stale", async () => {
		const sessionService = store.add(new SessionService());
		sessionService.commitFileImport(createInlineImportResult());
		sessionService.commitRawTableAssessment(createRawTableAssessmentRecord({
			assessmentRuleVersion: ASSESSMENT_RULE_VERSION - 1,
			fileId: "file-a",
			rawTableId: "table-a",
			sourceRawTableVersion: 1,
		}));
		const assessmentService = new TestAssessmentService();
		const rawTableRowsReaderService = new TestRawTableRowsReaderService();
		const assessmentQueueService = store.add(new AssessmentQueueService(
			sessionService,
			assessmentService,
			rawTableRowsReaderService,
		));
		const contribution = store.add(new AssessmentContribution(
			sessionService,
			assessmentQueueService,
		));

		await waitUntil(() => assessmentService.inputs.length === 1);

		const file = sessionService.getSnapshot().filesById["file-a"];
		assert.equal(
			file.assessmentsByRawTableId["table-a"]?.assessmentRuleVersion,
			ASSESSMENT_RULE_VERSION,
		);
		assert.deepEqual(
			assessmentService.inputs.map(input => input.sourceRawTableVersion),
			[1],
		);

		contribution.dispose();
		assessmentQueueService.dispose();
	});

	test("reassesses raw tables when schema profile version changes", async () => {
		const sessionService = store.add(new SessionService());
		const assessmentService = new TestAssessmentService();
		const rawTableRowsReaderService = new TestRawTableRowsReaderService();
		const schemaProfileService = new TestSchemaProfileService();
		const assessmentQueueService = store.add(new AssessmentQueueService(
			sessionService,
			assessmentService,
			rawTableRowsReaderService,
			schemaProfileService,
		));
		const contribution = store.add(new AssessmentContribution(
			sessionService,
			assessmentQueueService,
		));

		sessionService.commitFileImport(createInlineImportResult());
		await waitUntil(() => assessmentService.inputs.length === 1);
		assert.equal(sessionService.getSnapshot().filesById["file-a"].assessmentsByRawTableId["table-a"]?.schemaProfileVersion, 0);

		schemaProfileService.setVersion(1);
		await waitUntil(() => assessmentService.inputs.length === 2);

		assert.deepEqual(
			assessmentService.inputs.map(input => input.schemaProfileVersion),
			[0, 1],
		);
		assert.equal(sessionService.getSnapshot().filesById["file-a"].assessmentsByRawTableId["table-a"]?.schemaProfileVersion, 1);

		contribution.dispose();
		assessmentQueueService.dispose();
	});

	test("reassesses raw tables when template rule fingerprint changes", async () => {
		const sessionService = store.add(new SessionService());
		const assessmentService = new TestAssessmentService();
		const rawTableRowsReaderService = new TestRawTableRowsReaderService();
		const templateRuleService = new TestTemplateRuleService("rule:first");
		const assessmentQueueService = store.add(new AssessmentQueueService(
			sessionService,
			assessmentService,
			rawTableRowsReaderService,
			undefined,
			templateRuleService,
		));
		const contribution = store.add(new AssessmentContribution(
			sessionService,
			assessmentQueueService,
		));

		sessionService.commitFileImport(createInlineImportResult());
		await waitUntil(() => assessmentService.inputs.length === 1);
		assert.equal(
			sessionService.getSnapshot().filesById["file-a"].assessmentsByRawTableId["table-a"]?.ruleSetFingerprint,
			"rule:first",
		);

		templateRuleService.setFingerprint("rule:second");
		await waitUntil(() => assessmentService.inputs.length === 2);

		assert.deepEqual(
			assessmentService.inputs.map(input => input.ruleSnapshot?.fingerprint),
			["rule:first", "rule:second"],
		);
		assert.equal(
			sessionService.getSnapshot().filesById["file-a"].assessmentsByRawTableId["table-a"]?.ruleSetFingerprint,
			"rule:second",
		);

		contribution.dispose();
		assessmentQueueService.dispose();
	});

	test("reassesses raw tables when template catalog version changes", async () => {
		const sessionService = store.add(new SessionService());
		const assessmentService = new TestAssessmentService();
		const rawTableRowsReaderService = new TestRawTableRowsReaderService();
		const templateService = new TestTemplateService();
		const assessmentQueueService = store.add(new AssessmentQueueService(
			sessionService,
			assessmentService,
			rawTableRowsReaderService,
			undefined,
			undefined,
			templateService,
		));
		const contribution = store.add(new AssessmentContribution(
			sessionService,
			assessmentQueueService,
		));

		sessionService.commitFileImport(createInlineImportResult());
		await waitUntil(() => assessmentService.inputs.length === 1);
		assert.equal(
			sessionService.getSnapshot().filesById["file-a"].assessmentsByRawTableId["table-a"]?.templateCatalogVersion,
			0,
		);

		templateService.setTemplates([{
			id: "saved-transfer",
			name: "Saved Transfer",
			xDataStart: "A2",
			yColumns: [1],
			applicability: {
				schemaFingerprint: "dataname|vg|id",
				columnCount: 2,
			},
		}]);
		await waitUntil(() => assessmentService.inputs.length === 2);

		assert.deepEqual(
			assessmentService.inputs.map(input => input.templateSnapshot?.version ?? 0),
			[0, 1],
		);
		assert.equal(
			sessionService.getSnapshot().filesById["file-a"].assessmentsByRawTableId["table-a"]?.templateCatalogVersion,
			1,
		);

		contribution.dispose();
		assessmentQueueService.dispose();
	});

	test("reassesses with confirmed schema profile evidence after profile changes", async () => {
		const sessionService = store.add(new SessionService());
		const rawTableRowsReaderService = new TestRawTableRowsReaderService();
		const schemaProfileService = new TestSchemaProfileService();
		const assessmentService = store.add(new AssessmentService(schemaProfileService));
		const assessmentQueueService = store.add(new AssessmentQueueService(
			sessionService,
			assessmentService,
			rawTableRowsReaderService,
			schemaProfileService,
		));
		const contribution = store.add(new AssessmentContribution(
			sessionService,
			assessmentQueueService,
		));

		sessionService.commitFileImport(createProfileConfirmationImportResult());
		await waitUntil(() => Boolean(
			sessionService.getSnapshot().filesById["file-profile"]?.assessmentsByRawTableId["table-profile"],
		));

		const initial = sessionService.getSnapshot()
			.filesById["file-profile"]
			.assessmentsByRawTableId["table-profile"];
		assert.ok(initial);
		assert.equal(initial.schemaProfileVersion, 0);
		assert.equal(initial.blocks[0]?.family, "unknown");
		assert.equal(initial.decision.state, "reviewRequired");
		assert.equal(initial.decision.autoApplyAllowed, false);

		const profile = schemaProfileService.confirmProfile({
			schemaFingerprint: initial.structure.fingerprint,
			columnProfiles: initial.columnProfiles,
			bindings: [{
				rawCol: 1,
				role: "vg",
				axis: "x",
				canonicalUnit: "V",
			}, {
				rawCol: 2,
				role: "id",
				axis: "y",
				canonicalUnit: "A",
			}],
		});
		assert.ok(profile);

		await waitUntil(() =>
			sessionService.getSnapshot()
				.filesById["file-profile"]
				.assessmentsByRawTableId["table-profile"]
				?.schemaProfileVersion === 1
		);

		const reassessed = sessionService.getSnapshot()
			.filesById["file-profile"]
			.assessmentsByRawTableId["table-profile"];
		assert.ok(reassessed);
		assert.equal(reassessed.blocks[0]?.family, "iv");
		assert.equal(reassessed.blocks[0]?.ivMode, "transfer");
		assert.equal(reassessed.decision.state, "ready");
		assert.equal(reassessed.decision.autoApplyAllowed, true);
		assert.deepEqual(
			reassessed.blocks[0]?.columns.columns.map(({ rawCol, role, unit, confidence }) => ({
				rawCol,
				role,
				unit,
				confidence,
			})),
			[
				{ rawCol: 1, role: "vg", unit: "V", confidence: 0.96 },
				{ rawCol: 2, role: "id", unit: "A", confidence: 0.96 },
			],
		);
		assert.equal(rawTableRowsReaderService.inputs.length, 2);

		contribution.dispose();
		assessmentQueueService.dispose();
	});

	test("prioritizes visible raw tables before background assessment", async () => {
		const sessionService = store.add(new SessionService());
		const assessmentService = new TestAssessmentService();
		const rawTableRowsReaderService = new TestRawTableRowsReaderService();
		const assessmentQueueService = store.add(new AssessmentQueueService(
			sessionService,
			assessmentService,
			rawTableRowsReaderService,
		));
		const contribution = store.add(new AssessmentContribution(
			sessionService,
			assessmentQueueService,
		));

		assessmentQueueService.prioritizeRawTables([
			{ fileId: "file-5", rawTableId: "table-5" },
			{ fileId: "file-4", rawTableId: "table-4" },
		], "visible");
		sessionService.commitFileImport(createMultiInlineImportResult(6));
		await waitUntil(() => assessmentService.inputs.length >= 3);

		assert.deepEqual(
			assessmentService.inputs.slice(0, 3).map(input => input.rawTableId),
			["table-5", "table-4", "table-0"],
		);

		contribution.dispose();
		assessmentQueueService.dispose();
	});

	test("discards stale queued assessment when raw table version changes while rows are loading", async () => {
		const sessionService = store.add(new SessionService());
		const assessmentService = new TestAssessmentService();
		const rawTableRowsReaderService = new BlockingRawTableRowsReaderService();
		const assessmentQueueService = store.add(new AssessmentQueueService(
			sessionService,
			assessmentService,
			rawTableRowsReaderService,
		));
		const contribution = store.add(new AssessmentContribution(
			sessionService,
			assessmentQueueService,
		));

		sessionService.commitFileImport(createInlineImportResult());
		await waitUntil(() => rawTableRowsReaderService.inputs.length === 1);
		sessionService.commitFileImport(createInlineImportResult());
		rawTableRowsReaderService.resolveFirstRead();
		await waitUntil(() => assessmentService.inputs.length === 1);

		assert.deepEqual(
			assessmentService.inputs.map(input => input.sourceRawTableVersion),
			[2],
		);

		contribution.dispose();
		assessmentQueueService.dispose();
	});

	test("discards stale queued assessment when schema profile version changes while rows are loading", async () => {
		const sessionService = store.add(new SessionService());
		const assessmentService = new TestAssessmentService();
		const rawTableRowsReaderService = new BlockingRawTableRowsReaderService();
		const schemaProfileService = new TestSchemaProfileService();
		const assessmentQueueService = store.add(new AssessmentQueueService(
			sessionService,
			assessmentService,
			rawTableRowsReaderService,
			schemaProfileService,
		));
		const contribution = store.add(new AssessmentContribution(
			sessionService,
			assessmentQueueService,
		));

		sessionService.commitFileImport(createInlineImportResult());
		await waitUntil(() => rawTableRowsReaderService.inputs.length === 1);
		schemaProfileService.setVersion(1);
		rawTableRowsReaderService.resolveFirstRead();
		await waitUntil(() => assessmentService.inputs.length === 1);

		assert.deepEqual(
			assessmentService.inputs.map(input => input.schemaProfileVersion),
			[1],
		);
		assert.equal(
			sessionService.getSnapshot().filesById["file-a"].assessmentsByRawTableId["table-a"]?.schemaProfileVersion,
			1,
		);

		contribution.dispose();
		assessmentQueueService.dispose();
	});

	test("discards stale queued assessment when template rule fingerprint changes while rows are loading", async () => {
		const sessionService = store.add(new SessionService());
		const assessmentService = new TestAssessmentService();
		const rawTableRowsReaderService = new BlockingRawTableRowsReaderService();
		const templateRuleService = new TestTemplateRuleService("rule:first");
		const assessmentQueueService = store.add(new AssessmentQueueService(
			sessionService,
			assessmentService,
			rawTableRowsReaderService,
			undefined,
			templateRuleService,
		));
		const contribution = store.add(new AssessmentContribution(
			sessionService,
			assessmentQueueService,
		));

		sessionService.commitFileImport(createInlineImportResult());
		await waitUntil(() => rawTableRowsReaderService.inputs.length === 1);
		templateRuleService.setFingerprint("rule:second");
		rawTableRowsReaderService.resolveFirstRead();
		await waitUntil(() => assessmentService.inputs.length === 1);

		assert.deepEqual(
			assessmentService.inputs.map(input => input.ruleSnapshot?.fingerprint),
			["rule:second"],
		);
		assert.equal(
			sessionService.getSnapshot().filesById["file-a"].assessmentsByRawTableId["table-a"]?.ruleSetFingerprint,
			"rule:second",
		);

		contribution.dispose();
		assessmentQueueService.dispose();
	});

	test("discards stale queued assessment when template catalog version changes while rows are loading", async () => {
		const sessionService = store.add(new SessionService());
		const assessmentService = new TestAssessmentService();
		const rawTableRowsReaderService = new BlockingRawTableRowsReaderService();
		const templateService = new TestTemplateService();
		const assessmentQueueService = store.add(new AssessmentQueueService(
			sessionService,
			assessmentService,
			rawTableRowsReaderService,
			undefined,
			undefined,
			templateService,
		));
		const contribution = store.add(new AssessmentContribution(
			sessionService,
			assessmentQueueService,
		));

		sessionService.commitFileImport(createInlineImportResult());
		await waitUntil(() => rawTableRowsReaderService.inputs.length === 1);
		templateService.setTemplates([{
			id: "saved-transfer",
			name: "Saved Transfer",
			xDataStart: "A2",
			yColumns: [1],
		}]);
		rawTableRowsReaderService.resolveFirstRead();
		await waitUntil(() => assessmentService.inputs.length === 1);

		assert.deepEqual(
			assessmentService.inputs.map(input => input.templateSnapshot?.version ?? 0),
			[1],
		);
		assert.equal(
			sessionService.getSnapshot().filesById["file-a"].assessmentsByRawTableId["table-a"]?.templateCatalogVersion,
			1,
		);

		contribution.dispose();
		assessmentQueueService.dispose();
	});

	test("publishes queued and running raw table assessment state", async () => {
		const sessionService = store.add(new SessionService());
		const assessmentService = new TestAssessmentService();
		const rawTableRowsReaderService = new BlockingRawTableRowsReaderService();
		const assessmentQueueService = store.add(new AssessmentQueueService(
			sessionService,
			assessmentService,
			rawTableRowsReaderService,
		));
		const observedStates: string[][] = [];
		const disposable = store.add(assessmentQueueService.onDidChangeAssessmentQueueState(() => {
			observedStates.push(assessmentQueueService.getQueueSnapshot().rawTables.map(state =>
				`${state.state}:${state.priority}:${state.fileId}:${state.rawTableId}:${state.sourceRawTableVersion}`
			));
		}));

		sessionService.commitFileImport(createInlineImportResult());
		assessmentQueueService.enqueueRawTables([
			{ fileId: "file-a", rawTableId: "table-a" },
		]);
		await waitUntil(() => assessmentQueueService.getQueueSnapshot().rawTables.some(state => state.state === "running"));

		assert.deepEqual(assessmentQueueService.getQueueSnapshot(), {
			rawTables: [{
				fileId: "file-a",
				priority: "background",
				rawTableId: "table-a",
				sourceRawTableVersion: 1,
				state: "running",
			}],
		});
		assert.ok(observedStates.some(state => state.includes("queued:background:file-a:table-a:1")));
		assert.ok(observedStates.some(state => state.includes("running:background:file-a:table-a:1")));

		rawTableRowsReaderService.resolveFirstRead();
		await waitUntil(() => assessmentQueueService.getQueueSnapshot().rawTables.length === 0);

		assert.equal(assessmentService.inputs.length, 1);
		disposable.dispose();
		assessmentQueueService.dispose();
	});

	test("cleans queued and preferred assessment refs when files are removed or session clears", () => {
		const eventEmitter = new Emitter<SessionChangeEvent>();
		const sessionService = {
			commitRawTableAssessments: () => undefined,
			getSnapshot: () => ({
				fileOrder: [],
				filesById: {},
				schemaVersion: 1,
				sessionVersion: 1,
			}),
			onDidChangeSession: eventEmitter.event,
		} as unknown as SessionService;
		const assessmentQueueService = store.add(new AssessmentQueueService(
			sessionService,
			new TestAssessmentService(),
			new TestRawTableRowsReaderService(),
		));
		const inspect = assessmentQueueService as unknown as {
			pendingVisibleRefsByKey: Map<string, unknown>;
			preferredOrderByKey: Map<string, unknown>;
			preferredPriorityByKey: Map<string, unknown>;
		};

		assessmentQueueService.prioritizeRawTables([
			{ fileId: "file-a", rawTableId: "table-a" },
			{ fileId: "file-b", rawTableId: "table-b" },
		], "visible");
		inspect.pendingVisibleRefsByKey.set("file-a\u0000table-a", {
			ref: { fileId: "file-a", rawTableId: "table-a" },
			sourceRawTableVersion: 1,
		});

		eventEmitter.fire({
			fileIds: ["file-a"],
			reason: "filesRemoved",
			sessionVersion: 2,
		});

		assert.equal(inspect.pendingVisibleRefsByKey.has("file-a\u0000table-a"), false);
		assert.equal(inspect.preferredOrderByKey.has("file-a\u0000table-a"), false);
		assert.equal(inspect.preferredPriorityByKey.has("file-a\u0000table-a"), false);
		assert.equal(inspect.preferredOrderByKey.has("file-b\u0000table-b"), true);

		eventEmitter.fire({
			reason: "sessionCleared",
			sessionVersion: 3,
		});

		assert.equal(inspect.pendingVisibleRefsByKey.size, 0);
		assert.equal(inspect.preferredOrderByKey.size, 0);
		assert.equal(inspect.preferredPriorityByKey.size, 0);
		eventEmitter.dispose();
	});
});

class TestAssessmentService implements IAssessmentService {
	public declare readonly _serviceBrand: undefined;

	public readonly inputs: AssessRawTableInput[] = [];

	public assessImportFile(_file: File): Promise<ImportFileAssessment> {
		return Promise.reject(new Error("Not implemented."));
	}

	public assessImportRows(
		_fileName: string,
		_rows: readonly (readonly string[])[],
	): Promise<ImportFileAssessment> {
		return Promise.reject(new Error("Not implemented."));
	}

	public assessRawTable(input: AssessRawTableInput): Promise<RawTableAssessmentRecord> {
		this.inputs.push(input);
		const blockId = input.rawTableId === "table-a" ? "block-a" : `block-${input.rawTableId}`;
		return Promise.resolve(createRawTableAssessmentRecord({
			fileId: input.fileId,
			rawTableId: input.rawTableId,
			blockId,
			ruleSetFingerprint: input.ruleSnapshot?.fingerprint ?? "rule:legacy",
			schemaProfileVersion: input.schemaProfileVersion ?? 0,
			sourceRawTableVersion: input.sourceRawTableVersion,
			templateCatalogVersion: input.templateSnapshot?.version ?? 0,
		}));
	}
}

const createRawTableAssessmentRecord = ({
	assessmentRuleVersion = ASSESSMENT_RULE_VERSION,
	blockId = "block-a",
	fileId,
	rawTableId,
	ruleSetFingerprint = "rule:legacy",
	schemaProfileVersion = 0,
	sourceRawTableVersion,
	templateCatalogVersion = 0,
}: {
	readonly assessmentRuleVersion?: number;
	readonly blockId?: string;
	readonly fileId: string;
	readonly rawTableId: string;
	readonly ruleSetFingerprint?: string;
	readonly schemaProfileVersion?: number;
	readonly sourceRawTableVersion: number;
	readonly templateCatalogVersion?: number;
}): RawTableAssessmentRecord => ({
	assessmentRuleVersion,
	ruleSetFingerprint,
	templateCatalogVersion,
	schemaProfileVersion,
	templateCandidates: [],
	blocks: [{
		columnCount: 2,
		columns: {
			columns: [],
		},
		diagnosticCodes: [],
		family: "iv",
		fileId,
		id: blockId,
		label: "Block A",
		rawTableId,
		rowCount: 1,
		source: {
			fullRange: {
				endCol: 1,
				endRow: 1,
				startCol: 0,
				startRow: 0,
			},
		},
	}],
	columnProfiles: [],
	createdAt: 123,
	decision: {
		autoApplyAllowed: false,
		confidence: 0.3,
		reasons: [],
		state: "reviewRequired",
	},
	diagnostics: [],
	fileId,
	groups: [],
	layoutCandidates: [],
	rawTableId,
	semanticCandidates: [],
	sourceRawTableVersion,
	structure: createEmptyRawTableStructure(),
});

class TestSchemaProfileService implements ISchemaProfileService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeSchemaProfilesEmitter = new Emitter<SchemaProfileSnapshot>();
	public readonly onDidChangeSchemaProfiles = this.onDidChangeSchemaProfilesEmitter.event;
	private profiles: readonly SchemaProfile[] = [];
	private version = 0;

	public setVersion(version: number): void {
		this.version = version;
		this.onDidChangeSchemaProfilesEmitter.fire(this.getSnapshot());
	}

	public getSnapshot(): SchemaProfileSnapshot {
		return {
			version: this.version,
			profiles: this.profiles,
		};
	}

	public getProfiles(): readonly SchemaProfile[] {
		return this.profiles;
	}

	public getVersion(): number {
		return this.version;
	}

	public upsertProfile(profile: SchemaProfile): SchemaProfile {
		const profileId = String(profile.id ?? "").trim();
		const fingerprint = String(profile.schemaFingerprint ?? "").trim();
		this.profiles = [
			...this.profiles.filter(existing =>
				String(existing.id ?? "").trim() !== profileId &&
				String(existing.schemaFingerprint ?? "").trim() !== fingerprint
			),
			profile,
		];
		this.version += 1;
		this.onDidChangeSchemaProfilesEmitter.fire(this.getSnapshot());
		return profile;
	}

	public confirmProfile(input: ConfirmSchemaProfileInput): SchemaProfile | null {
		const profile = createSchemaProfileFromConfirmation(input);
		return profile ? this.upsertProfile(profile) : null;
	}

	public removeProfile(profileId: string): void {
		const nextProfiles = this.profiles.filter(profile =>
			String(profile.id ?? "").trim() !== String(profileId ?? "").trim()
		);
		if (nextProfiles.length === this.profiles.length) {
			return;
		}
		this.profiles = nextProfiles;
		this.version += 1;
		this.onDidChangeSchemaProfilesEmitter.fire(this.getSnapshot());
	}

	public clearProfiles(): void {
		if (!this.profiles.length) {
			return;
		}
		this.profiles = [];
		this.version += 1;
		this.onDidChangeSchemaProfilesEmitter.fire(this.getSnapshot());
	}
}

class TestTemplateRuleService implements ITemplateRuleService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeRulesEmitter = new Emitter<TemplateRuleChangeEvent>();
	public readonly onDidChangeRules = this.onDidChangeRulesEmitter.event;
	private snapshot: TemplateRuleSnapshot;

	public constructor(fingerprint: string) {
		this.snapshot = createTemplateRuleSnapshotForTest(fingerprint);
	}

	public setFingerprint(fingerprint: string): void {
		this.snapshot = createTemplateRuleSnapshotForTest(fingerprint);
		this.onDidChangeRulesEmitter.fire({
			version: this.snapshot.version,
			fingerprint: this.snapshot.fingerprint,
			changedRuleIds: [],
		});
	}

	public getSnapshot(): TemplateRuleSnapshot {
		return this.snapshot;
	}

	public async reload(): Promise<TemplateRuleSnapshot> {
		return this.snapshot;
	}
}

class TestTemplateService implements ITemplateService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeTemplatesEmitter = new Emitter<readonly TemplateApplyPresetRecord[]>();
	public readonly onDidChangeTemplates = this.onDidChangeTemplatesEmitter.event;

	private templates: readonly TemplateApplyPresetRecord[] = [];
	private templateListVersion = 0;

	public setTemplates(templates: readonly TemplateApplyPresetRecord[]): void {
		this.templates = templates;
		this.templateListVersion += 1;
		this.onDidChangeTemplatesEmitter.fire(this.templates);
	}

	public getSnapshot(): TemplateSnapshot {
		return createTemplateSnapshotFromApplyPresets(
			this.templates,
			this.templateListVersion,
		);
	}
	public getTemplate(id: string): TemplateSnapshot["templates"][number] | undefined {
		const templateId = String(id ?? "").trim();
		return this.getSnapshot().templates.find(template => String(template.id ?? "").trim() === templateId);
	}
	public getTemplateList(): readonly TemplateApplyPresetRecord[] { return this.templates; }
	public hasLoadedTemplateList(): boolean { return true; }
	public refreshTemplates(): Promise<readonly TemplateApplyPresetRecord[]> { return Promise.resolve(this.templates); }
	public deleteTemplate(_id: string): Promise<void> { return Promise.resolve(); }
	public saveTemplate(template: TemplateApplyPresetSaveInput): Promise<TemplateApplyPresetRecord> { return Promise.resolve(template); }
}

const createTemplateRuleSnapshotForTest = (
	fingerprint: string,
): TemplateRuleSnapshot => ({
	version: 1,
	fingerprint,
	rules: [],
	diagnostics: [],
});

const createInlineImportResult = (): FileImportResult => ({
	createdAt: 123,
	diagnostics: [],
	files: [{
		id: "file-a",
		kind: "csv",
		name: "Transfer.csv",
		raw: {
			fileId: "file-a",
			fileName: "2.csv",
			relativePath: "293K/OUTPUT/2.csv",
			rawTablesById: {
				"table-a": {
					columnCount: 2,
					fileId: "file-a",
					maxCellLengths: [2, 4],
					rawTableId: "table-a",
					rowCount: 2,
					rows: {
						kind: "inline",
						values: [["Vg", "Id"], ["0", "1e-9"]],
					},
					source: {
						kind: "csv",
					},
				},
			},
			rawTableOrder: ["table-a"],
		},
	}],
});

const createProfileConfirmationImportResult = (): FileImportResult => ({
	createdAt: 123,
	diagnostics: [],
	files: [{
		id: "file-profile",
		kind: "csv",
		name: "custom.csv",
		raw: {
			fileId: "file-profile",
			fileName: "custom.csv",
			relativePath: "custom.csv",
			rawTablesById: {
				"table-profile": {
					columnCount: 3,
					fileId: "file-profile",
					maxCellLengths: [9, 7, 8],
					rawTableId: "table-profile",
					rowCount: 4,
					rows: {
						kind: "inline",
						values: [
							["DataName", "Input A", "Output B"],
							["DataValue", "-1", "1e-12"],
							["DataValue", "0", "1e-9"],
							["DataValue", "1", "2e-7"],
						],
					},
					source: {
						kind: "csv",
					},
				},
			},
			rawTableOrder: ["table-profile"],
		},
	}],
});

const createMultiInlineImportResult = (count: number): FileImportResult => ({
	createdAt: 123,
	diagnostics: [],
	files: Array.from({ length: count }, (_value, index) => {
		const fileId = `file-${index}`;
		const rawTableId = `table-${index}`;
		return {
			id: fileId,
			kind: "csv",
			name: `${index}.csv`,
			raw: {
				fileId,
				fileName: `${index}.csv`,
				relativePath: `293K/output/${index}.csv`,
				rawTablesById: {
					[rawTableId]: {
						columnCount: 2,
						fileId,
						maxCellLengths: [2, 4],
						rawTableId,
						rowCount: 2,
						rows: {
							kind: "inline",
							values: [["Vg", "Id"], ["0", "1e-9"]],
						},
						source: {
							kind: "csv",
						},
					},
				},
				rawTableOrder: [rawTableId],
			},
		};
	}),
});

const settlePromises = async (): Promise<void> => {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
};

const waitUntil = async (
	predicate: () => boolean,
): Promise<void> => {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		if (predicate()) {
			return;
		}

		await new Promise<void>(resolve => setTimeout(resolve, 0));
	}

	assert.ok(predicate(), "Timed out waiting for asynchronous assessment work.");
};

class TestRawTableRowsReaderService implements IRawTableRowsReaderService {
	public declare readonly _serviceBrand: undefined;

	public readonly inputs: RawTableRowsReadInput[] = [];

	public readRawTableRows(input: RawTableRowsReadInput): Promise<RawTableRows | null> {
		this.inputs.push(input);
		const rowStore = input.rowStore;
		if (!rowStore || rowStore.kind !== "memory") {
			return Promise.resolve(null);
		}

		const rows = typeof input.maxRows === "number"
			? rowStore.rows.slice(0, input.maxRows)
			: rowStore.rows;
		return Promise.resolve(rows.map(row =>
			row.map(cell => cell == null ? "" : String(cell))
		));
	}
}

class BlockingRawTableRowsReaderService extends TestRawTableRowsReaderService {
	private firstRead:
		| { readonly resolve: (rows: RawTableRows | null) => void; readonly rows: RawTableRows | null }
		| null = null;

	public override readRawTableRows(input: RawTableRowsReadInput): Promise<RawTableRows | null> {
		if (this.inputs.length > 0) {
			return super.readRawTableRows(input);
		}

		const rows = getRowsFromReadInput(input);
		this.inputs.push(input);
		return new Promise(resolve => {
			this.firstRead = { resolve, rows };
		});
	}

	public resolveFirstRead(): void {
		this.firstRead?.resolve(this.firstRead.rows);
		this.firstRead = null;
	}
}

const getRowsFromReadInput = (
	input: RawTableRowsReadInput,
): RawTableRows | null => {
	const rowStore = input.rowStore;
	if (!rowStore || rowStore.kind !== "memory") {
		return null;
	}

	const rows = typeof input.maxRows === "number"
		? rowStore.rows.slice(0, input.maxRows)
		: rowStore.rows;
	return rows.map(row =>
		row.map(cell => cell == null ? "" : String(cell))
	);
};
