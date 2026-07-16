/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	FileSystemProviderCapabilities,
	FileType,
	type IFileService,
} from "src/cs/platform/files/common/files";
import { StorageScope } from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import { DataResourceContentService } from "src/cs/workbench/services/dataResource/browser/dataResourceContentService";
import { DataResourceService } from "src/cs/workbench/services/dataResource/browser/dataResourceService";
import { testStructuredContentEvidenceService } from "src/cs/workbench/services/dataResource/test/common/testStructuredContentEvidenceService";
import type {
	DataResourceStructuredContentResolution,
	IDataResourceService,
	IDataResourceStructuredContentReference,
} from "src/cs/workbench/services/dataResource/common/dataResource";
import type { IStructuredContentEvidenceService } from "src/cs/workbench/services/dataResource/common/structuredContentEvidenceService";
import {
	createEmptyStructuredContentStructure,
	type StructuredColumnProfile,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import { ReviewService } from "src/cs/workbench/services/review/browser/reviewService";
import type {
	ReviewEvidence,
	ReviewSummary,
	ReviewSummaryTarget,
	ReviewedTemplate,
} from "src/cs/workbench/services/review/common/reviewModel";
import { deriveReviewResult } from "src/cs/workbench/services/review/common/reviewDecision";
import type {
	ISchemaProfileService,
	SchemaProfile,
	SchemaProfileSnapshot,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import {
	createSchemaProfileFromConfirmation,
	type ConfirmSchemaProfileInput,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfileConfirmation";
import {
	TableModel as TableContentModel,
	type ITableModel,
	type TableModelContentSnapshot,
	type TableParseDiagnostic,
} from "src/cs/workbench/services/table/common/model";
import type { TableSource } from "src/cs/workbench/services/table/common/table";
import type {
	ITableModelReference,
	ITableModelService,
} from "src/cs/workbench/services/table/common/resolverService";
import { parseTableStructure } from "src/cs/workbench/services/table/common/tableStructureParser";
import type { ITableStructureParserService } from "src/cs/workbench/services/table/common/tableStructureParserService";
import { TableFileService } from "src/cs/workbench/services/tableFile/browser/tableFileService";
import { TestDataResourceContentService } from "src/cs/workbench/services/dataResource/test/common/testDataResourceContentService";
import type { Template } from "src/cs/workbench/services/template/common/template";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import { UserDataProfileResourceService } from "src/cs/workbench/services/userDataProfile/browser/userDataProfileResourceService";
import type { IUserTemplateService } from "src/cs/workbench/services/userTemplate/common/userTemplate";
import { UserTemplateService } from "src/cs/workbench/services/userTemplate/browser/userTemplateService";
import { UserTemplateStoreService } from "src/cs/workbench/services/userTemplate/browser/userTemplateStoreService";
import type { ISettingsService } from "src/cs/workbench/services/settings/common/settings";

suite("workbench/services/review/test/browser/reviewService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const createUserTemplateStoreServiceForTest = () => {
		const storageService = store.add(new TestStorageService());
		const userDataProfileResourceService = store.add(new UserDataProfileResourceService(storageService));
		return store.add(new UserTemplateStoreService(userDataProfileResourceService, storageService));
	};
	const createUserTemplateServiceForTest = () =>
		store.add(new UserTemplateService(createUserTemplateStoreServiceForTest()));
	const createReviewServiceForTest = (
		userTemplateService: IUserTemplateService,
		dataResourceService?: IDataResourceService,
		schemaProfileService?: ISchemaProfileService,
	) => store.add(new ReviewService(
		userTemplateService,
		dataResourceService,
		schemaProfileService,
	));
	const createDataResourceServiceForTest = (
		resource: URI,
		diagnostics: readonly TableParseDiagnostic[] = [],
		fixedSheetId: string | null = null,
		content: TableModelContentSnapshot = createTestTableModelContent(),
		conductorSettings: Record<string, unknown> | null = null,
	): IDataResourceService =>
		store.add(new DataResourceService(store.add(new TestDataResourceContentService(store.add(new TestTableModelService(resource, diagnostics, fixedSheetId, content)))), {
			onDidChangeConductorSettings: Event.None,
			getConductorSettings: () => conductorSettings,
		} as unknown as ISettingsService, testStructuredContentEvidenceService));
	const createReviewTargetForTest = (fileName = "Transfer.csv") => ({
		resource: URI.file(`/workspace/${fileName}`),
		modelVersion: 1,
		sourceVersion: 1,
	});

	test("derives DataResource review candidates into a system-recommended review decision", () => {
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidence(),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			rowCount: 3,
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.semanticRulesFingerprint, "semantic:test");
		assert.equal(result.reviewPolicyVersion, 14);
		assert.equal(typeof result.evidenceFingerprint, "string");
		assert.equal(typeof result.candidates[0]?.providerRank, "number");
		assert.equal(result.reviewedTemplate, result.decision.kind === "ready" ? result.decision.reviewedTemplate : undefined);
		assert.equal(typeof result.reviews[0]?.factors.selectorScore, "number");
		assert.deepEqual(result.reviews[0]?.findings, []);
		assert.equal(result.decision.kind, "ready");
		assert.equal(result.decision.kind === "ready" && result.decision.application.kind, "systemRecommended");
		assert.equal(result.decision.kind === "ready" && result.decision.reviewedTemplate.source.kind, "dataResource");
		assert.equal(result.reviewedTemplate?.reviewedType, "transfer");
		assert.deepEqual(result.reviewedTemplate?.template.measurement, {
			curveFamily: "iv",
			ivMode: "transfer",
		});
	});

	test("uses exact schema profile matches as review semantic evidence", () => {
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidenceWithSchemaProfileColumns(),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			rowCount: 3,
			schemaProfileSnapshot: createSchemaProfileSnapshot([createSchemaProfile()]),
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.exactFingerprint"), true);
		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.bindingMatched"), true);
		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.bindingIncomplete"), false);
		assert.equal(result.reviews[0]?.factors.semanticScore, 0.96);
	});

	test("prefers exact schema profile matches over similar profile matches", () => {
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidenceWithSchemaProfileColumns(),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			rowCount: 3,
			schemaProfileSnapshot: createSchemaProfileSnapshot([
				createSchemaProfile({
					id: "schema:older",
					schemaFingerprint: "schema-older",
				}),
				createSchemaProfile(),
			]),
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.exactFingerprint"), true);
		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.similarSchema"), false);
		assert.equal(result.reviews[0]?.factors.semanticScore, 0.96);
	});

	test("uses similar schema profile matches only as manual-assist review evidence", () => {
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidenceWithSchemaProfileColumns({
				blockConfidence: 0.75,
				fingerprint: "schema-b",
			}),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			rowCount: 3,
			schemaProfileSnapshot: createSchemaProfileSnapshot([createSchemaProfile({
				id: "schema:older",
				schemaFingerprint: "schema-a",
			})]),
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.exactFingerprint"), false);
		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.similarSchema"), true);
		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.bindingIncomplete"), false);
		assert.equal(result.reviews[0]?.factors.semanticScore, 0.75);
		assert.equal(result.decision.kind, "ready");
		assert.equal(result.decision.kind === "ready" && result.decision.application.kind, "userActionRequired");
	});

	test("does not use similar schema profile matches to bypass conflicted exact profiles", () => {
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidenceWithSchemaProfileColumns({
				blockConfidence: 0.75,
				fingerprint: "schema-b",
			}),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			rowCount: 3,
			schemaProfileSnapshot: createSchemaProfileSnapshot([
				createSchemaProfile({
					conflictCount: 1,
					id: "schema:conflicted-current",
					schemaFingerprint: "schema-b",
				}),
				createSchemaProfile({
					id: "schema:older",
					schemaFingerprint: "schema-a",
				}),
			]),
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.similarSchema"), false);
		assert.equal(result.reviews[0]?.factors.semanticScore, 0.75);
	});

	test("does not boost review scoring for incomplete exact schema profile bindings", () => {
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidenceWithSchemaProfileColumns(),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			rowCount: 3,
			schemaProfileSnapshot: createSchemaProfileSnapshot([createSchemaProfile({
				bindings: [{
					selector: {
						columnIndex: 0,
						normalizedHeader: "vg",
					},
					role: "vg",
					axis: "x",
					canonicalUnit: "V",
				}],
			})]),
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.exactFingerprint"), true);
		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.bindingMatched"), false);
		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.bindingIncomplete"), true);
		assert.equal(result.reviews[0]?.factors.semanticScore, 0.95);
	});

	test("ignores conflicted schema profile matches for review scoring", () => {
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidenceWithSchemaProfileColumns(),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			rowCount: 3,
			schemaProfileSnapshot: createSchemaProfileSnapshot([createSchemaProfile({ conflictCount: 1 })]),
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.reviews[0]?.reasons.includes("schemaProfile.exactFingerprint"), false);
		assert.equal(result.reviews[0]?.factors.semanticScore, 0.95);
	});

	test("uses the Review decision application as the system application gate", () => {
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidence(),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			rowCount: 3,
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.decision.kind, "ready");
		assert.equal(result.decision.kind === "ready" && result.decision.application.kind, "systemRecommended");
		assert.equal(result.decision.kind === "ready" && result.decision.application.reason, "review.ready.systemRecommended");
	});

	test("requires adjustment when Review cannot rank top candidates distinctly", () => {
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidence({ ambiguousBindings: true }),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			rowCount: 3,
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.decision.kind, "needsManualAdjustment");
		assert.equal(result.reviewedTemplate, undefined);
		assert.equal(result.reviews.every(review => review.status !== "ready"), true);
		assert.equal(
			result.reviews.every(review => review.findings.some(finding => finding.code === "review.ambiguousCandidates")),
			true,
		);
	});

	test("does not require adjustment when top candidate confidence is distinct", () => {
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidence({
				ambiguousBindingConfidence: 0.86,
				ambiguousBindings: true,
				bindingConfidence: 1,
			}),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			rowCount: 3,
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.decision.kind, "ready");
		assert.equal(result.reviewedTemplate?.candidateId, result.candidates[0]?.id);
		assert.equal(result.reviews[0]?.findings.some(finding => finding.code === "review.ambiguousCandidates"), false);
	});

	test("does not resolve time and voltage X ambiguity from semantic domain intent", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/FastIvTransfer.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource, [], null, createTestTableModelContent([
				["FastIV", "interval", ""],
				["DataName", "Time", "Vg", "Id"],
				["DataValue", "0", "0", "1e-12"],
				["DataValue", "1", "0.5", "2e-12"],
				["DataValue", "2", "1", "3e-12"],
				["DataValue", "3", "1.5", "4e-12"],
			])),
		);

		const reviewExecution = await service.reviewResourceForExecution({ resource });

		assert.equal(reviewExecution?.summary.state, "needsAdjustment");
		assert.equal(reviewExecution?.summary.findingCodes.includes("review.ambiguousCandidates"), true);
		assert.equal(reviewExecution?.systemRecommendedReviewedTemplate, undefined);
	});

	test("derives IV output review from stepped CH2 proof across repeated CH1 sweeps", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/SteppedChannelOutput.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource, [], null, createTestTableModelContent([
				["CH1 Voltage", "CH1 Current", "CH1 Resistance", "CH2 Voltage"],
				["0", "1e-12", "100", "0"],
				["0.5", "2e-12", "110", "0"],
				["1", "4e-12", "120", "0"],
				["0", "5e-12", "130", "1"],
				["0.5", "6e-12", "140", "1"],
				["1", "8e-12", "150", "1"],
			])),
		);

		const reviewExecution = await service.reviewResourceForExecution({ resource });

		assert.equal(reviewExecution?.summary.state, "ready");
		assert.equal(reviewExecution?.summary.reviewedType, "output");
		assert.equal(reviewExecution?.systemRecommendedReviewedTemplate?.template.measurement?.ivMode, "output");
		assert.deepEqual(reviewExecution?.systemRecommendedReviewedTemplate?.evidence?.proofRanges, [{
			column: 3,
			startRow: 1,
			endRow: 6,
		}]);
	});

	test("derives IV output review from stepped CH2 proof with instrument export columns", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/InstrumentOutput.csv");
		const rows: string[][] = [[
			"Repeat",
			"VAR2",
			"Point",
			"CH1 Voltage",
			"CH1 Current",
			"CH1 Resistance",
			"CH1 Time",
			"CH2 Voltage",
			"CH2 Current",
			"CH2 Time",
			"R",
		]];
		const ch2Values = [-60, -40, -20, 0, 20, 40, 60];
		for (let groupIndex = 0; groupIndex < ch2Values.length; groupIndex += 1) {
			for (let point = 0; point < 201; point += 1) {
				const ch1Voltage = -3 + point * 0.03;
				const ch2Voltage = ch2Values[groupIndex] +
					(groupIndex === 2 && point % 2 === 0 ? -1e-5 : 0) +
					(groupIndex === 3 ? (point % 5 - 2) * 1e-6 : 0) +
					(groupIndex === 4 && point % 2 === 0 ? -1e-5 : 0);
				rows.push([
					"1",
					String(groupIndex + 1),
					String(point + 1),
					ch1Voltage.toFixed(5),
					(-3e-9 + groupIndex * 1e-10 + point * 1e-12).toExponential(6),
					String(800 + groupIndex * 20 + point),
					String(point * 0.12),
					String(ch2Voltage),
					String(1 + groupIndex * 0.1 + point * 0.001),
					String(point * 0.12),
					String(800 + groupIndex * 20 + point),
				]);
			}
		}
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource, [], null, createTestTableModelContent(rows)),
		);

		const reviewExecution = await service.reviewResourceForExecution({ resource });

		assert.equal(reviewExecution?.summary.state, "ready");
		assert.equal(reviewExecution?.summary.reviewedType, "output");
		assert.equal(reviewExecution?.systemRecommendedReviewedTemplate?.template.measurement?.ivMode, "output");
		assert.deepEqual(reviewExecution?.systemRecommendedReviewedTemplate?.evidence?.proofRanges, [{
			column: 7,
			startRow: 1,
			endRow: rows.length - 1,
		}]);
	});

	test("derives IV output review when transfer-priority settings keep noisy CH2 current as transfer proof", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/ConfiguredInstrumentOutput.csv");
		const rows: string[][] = [[
			"Repeat",
			"VAR2",
			"Point",
			"CH1 Voltage",
			"CH1 Current",
			"CH1 Resistance",
			"CH1 Time",
			"CH2 Voltage",
			"CH2 Current",
			"CH2 Time",
			"R",
		]];
		for (let groupIndex = 0; groupIndex < 2; groupIndex += 1) {
			for (let point = 0; point < 3; point += 1) {
				rows.push([
					"1",
					String(groupIndex + 1),
					String(point + 1),
					String(point * 0.5),
					String((1 + groupIndex + point) * 1e-12),
					String(100 + point),
					String(point * 0.12),
					String(groupIndex ? 20 + (point - 1) * 1e-5 : 0),
					String((1 + point * 0.4 - groupIndex * 0.1) * 1e-9),
					String(point * 0.12),
					String(100 + point),
				]);
			}
		}
		const conductorSettings = {
			templateSemanticPatches: {
				terms: [],
				rules: [
					{
						id: "iv:1",
						priority: 0,
						yKeys: { addKeys: [], removeKeys: ["ch1resistance"] },
					},
					{
						id: "iv:2",
						priority: 1,
						proofKeys: { addKeys: [], removeKeys: ["ch2current", "ch2resistance"] },
						yKeys: { addKeys: [], removeKeys: ["ch1resistance"] },
					},
				],
			},
		};
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource, [], null, createTestTableModelContent(rows), conductorSettings),
		);

		const reviewExecution = await service.reviewResourceForExecution({ resource });

		assert.equal(reviewExecution?.summary.state, "ready");
		assert.equal(reviewExecution?.summary.reviewedType, "output");
		assert.equal(reviewExecution?.systemRecommendedReviewedTemplate?.template.measurement?.ivMode, "output");
	});

	test("does not require adjustment when a repeated-block candidate covers child block candidates", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/RepeatedBlocks.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource, [], null, createTestTableModelContent([
				["CH1 Voltage", "CH1 Current", "CH1 Resistance", "", "CH1 Voltage", "CH1 Current", "CH1 Resistance"],
				["0", "1e-12", "100", "", "0", "1e-11", "200"],
				["0.5", "2e-12", "110", "", "0.5", "2e-11", "210"],
				["1", "4e-12", "120", "", "1", "4e-11", "220"],
			])),
		);

		const reviewExecution = await service.reviewResourceForExecution({ resource });

		assert.equal(reviewExecution?.summary.state, "ready");
		assert.equal(reviewExecution?.summary.findingCodes.includes("review.ambiguousCandidates"), false);
		assert.equal(
			reviewExecution?.systemRecommendedReviewedTemplate?.source.kind === "dataResource"
				? reviewExecution.systemRecommendedReviewedTemplate.source.bindingCandidateId
				: null,
			"binding:repeated-blocks",
		);
		assert.equal(reviewExecution?.systemRecommendedReviewedTemplate?.template.blocks.length, 2);
	});

	test("derives repeated DataName/DataValue transfer review without metadata ambiguity", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/TransferRepeatedDataName.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource, [], null, createTestTableModelContent([
				["SetupTitle", "Transfer1-3"],
				["AnalysisSetup", "Analysis.Setup.Vector.Graph.XAxis.Name", "Vg"],
				["AnalysisSetup", "Analysis.Setup.Vector.Graph.XAxis.Left", "-5"],
				["AnalysisSetup", "Analysis.Setup.Vector.Graph.XAxis.Right", "20"],
				["DataName", "Vg", "Id", "gm"],
				["DataValue", "-5", "1e-12", "2e-12"],
				["DataValue", "-4.875", "2e-12", "3e-12"],
				["DataValue", "-4.75", "3e-12", "4e-12"],
				["SetupTitle", "Transfer1-3"],
				["AnalysisSetup", "Analysis.Setup.Vector.Graph.XAxis.Name", "Vg"],
				["AnalysisSetup", "Analysis.Setup.Vector.Graph.XAxis.Left", "-5"],
				["AnalysisSetup", "Analysis.Setup.Vector.Graph.XAxis.Right", "20"],
				["DataName", "Vg", "Id", "gm"],
				["DataValue", "-5", "1.5e-12", "2.5e-12"],
				["DataValue", "-4.875", "2.5e-12", "3.5e-12"],
				["DataValue", "-4.75", "3.5e-12", "4.5e-12"],
			])),
		);

		const reviewExecution = await service.reviewResourceForExecution({ resource });

		assert.equal(reviewExecution?.summary.state, "ready");
		assert.equal(reviewExecution?.summary.reviewedType, "transfer");
		assert.equal(reviewExecution?.summary.findingCodes.includes("review.ambiguousCandidates"), false);
		assert.ok(
			reviewExecution?.systemRecommendedReviewedTemplate?.source.kind === "dataResource" &&
			reviewExecution.systemRecommendedReviewedTemplate.source.bindingCandidateId.startsWith("binding:vertical-repeated-blocks:"),
		);
		assert.equal(reviewExecution?.systemRecommendedReviewedTemplate?.template.blocks.length, 2);
	});

	test("derives user template candidates from the user template snapshot", async () => {
		const template = createTemplate({
			id: "template-a",
			applicability: {
				schemaFingerprint: createEmptyStructuredContentStructure().fingerprint,
				columnCount: 2,
			},
		});
		const userTemplateService = createUserTemplateServiceForTest();
		await userTemplateService.createTemplate({
			id: "template-a",
			name: "Transfer",
			template,
		});

		const result = deriveReviewResult({
			evidence: createReviewEvidence({ includeDataResourceBinding: false }),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			rowCount: 3,
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.userTemplateCatalogVersion, 1);
		assert.equal(result.candidates[0]?.source.kind, "user");
		assert.equal(result.decision.kind, "ready");
		assert.equal(result.decision.kind === "ready" && result.decision.reviewedTemplate.source.kind, "user");
	});

	test("requires adjustment when Review confidence is below the ready threshold", async () => {
		const userTemplateService = createUserTemplateServiceForTest();

		const result = deriveReviewResult({
			evidence: createReviewEvidence({ bindingConfidence: 0.2 }),
			columnCount: 2,
			fileName: "Transfer.csv",
			...createReviewTargetForTest(),
			rowCount: 3,
			userTemplateSnapshot: userTemplateService.getSnapshot(),
		});

		assert.equal(result.decision.kind, "needsManualAdjustment");
		assert.equal(result.reviews[0]?.status, "needsAdjustment");
		assert.equal(result.reviewedTemplate, undefined);
		assert.equal(result.decision.kind === "needsManualAdjustment" && result.decision.candidateId, result.candidates[0]?.id);
		assert.equal(Object.hasOwn(result.reviews[0] ?? {}, "template"), false);
	});

	test("returns latest review summaries for URI-backed structured content", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource),
		);

		const target = {
			resource,
			sheetId: "table-a",
		};
		assert.equal(service.getLatestReviewSummary(target).state, "missing");
		const reviewExecution = await service.reviewResourceForExecution(target);
		assert.ok(reviewExecution);

		const summary = service.getLatestReviewSummary(target);
		assert.equal(summary.state, "ready");
		assert.equal(summary.resource, resource);
		assert.equal(summary.sheetId, "table-a");
		assert.equal(summary.reviewedType, "transfer");
		assert.equal(summary.reviewedSemanticLabel, "Detected Transfer");
		assert.equal(summary.message, "Review is ready and recommended for system application.");
		assert.deepEqual(summary.findingCodes, []);
		assert.equal(typeof summary.confidence, "number");
		assert.equal(Boolean(summary.reviewSignature), true);
		assert.equal(Boolean(summary.templateFingerprint), true);

		assert.equal(reviewExecution.resource.toString(), resource.toString());
		assert.equal(reviewExecution.sheetId, "table-a");
		assert.equal(reviewExecution.sourceModelVersion, 1);
		assert.equal(reviewExecution.sourceVersion, 1);
		assert.equal(reviewExecution.systemRecommendedReviewedTemplate?.template.measurement?.curveFamily, "iv");
		assert.equal(reviewExecution.systemRecommendedReviewedTemplate?.template.measurement?.ivMode, "transfer");
		assert.equal(reviewExecution.systemRecommendedReviewedTemplate?.reviewedType, "transfer");
		assert.equal(service.getLatestReviewSummary(target).reviewSignature, reviewExecution.reviewSignature);
		assert.equal(service.getLatestReviewSummary(target).state, "ready");
	});

	test("resolves URI review summaries for import scheduling", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource),
		);

		const target = {
			resource,
			sheetId: "table-a",
		};
		assert.equal(service.getLatestReviewSummary(target).state, "missing");

		const summary = await service.resolveReviewSummary(target);

		assert.equal(summary?.state, "ready");
		assert.equal(summary?.reviewedType, "transfer");
		assert.equal(summary?.reviewedSemanticLabel, "Detected Transfer");
		assert.equal(service.getLatestReviewSummary(target).state, "ready");
		assert.equal(service.getLatestReviewSummary(target).reviewSignature, summary?.reviewSignature);
	});

	test("resolves Review through physical content while the table model stays idle", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/ReviewOnly.csv");
		let readCount = 0;
		let evidenceCreateCount = 0;
		let releaseEvidence: () => void = () => undefined;
		let signalEvidenceStarted: () => void = () => undefined;
		const evidenceGate = new Promise<void>(resolve => {
			releaseEvidence = resolve;
		});
		const evidenceStarted = new Promise<void>(resolve => {
			signalEvidenceStarted = resolve;
		});
		const evidenceService: IStructuredContentEvidenceService = {
			_serviceBrand: undefined,
			create: async (content, patches) => {
				evidenceCreateCount += 1;
				signalEvidenceStarted();
				await evidenceGate;
				return testStructuredContentEvidenceService.create(content, patches);
			},
			dispose: () => undefined,
		};
		const fileService = {
			_serviceBrand: undefined,
			getProviderCapabilities: () => FileSystemProviderCapabilities.FileRead,
			onDidFilesChange: Event.None,
			readFile: async () => {
				readCount += 1;
				return {
					value: new TextEncoder().encode("Vg,Id\n0,1\n1,2"),
				};
			},
			stat: async () => ({
				ctime: 1,
				mtime: 10,
				path: resource.path,
				size: 16,
				type: FileType.File,
			}),
		} as unknown as IFileService;
		const tableStructureParserService: ITableStructureParserService = {
			_serviceBrand: undefined,
			dispose: () => undefined,
			parse: parseTableStructure,
		};
		const tableFileService = store.add(new TableFileService(
			fileService,
			tableStructureParserService,
		));
		const contentService = store.add(new DataResourceContentService(tableFileService));
		const dataResourceService = store.add(new DataResourceService(
			contentService,
			{
				onDidChangeConductorSettings: Event.None,
				getConductorSettings: () => null,
			} as unknown as ISettingsService,
			evidenceService,
		));
		const service = createReviewServiceForTest(userTemplateService, dataResourceService);

		const resolvingSummary = service.resolveReviewSummary({ resource });
		await evidenceStarted;

		assert.deepStrictEqual({
			evidenceCreateCount,
			modelState: tableFileService.get(resource)?.getSnapshot().loadState.state,
			readCount,
		}, {
			evidenceCreateCount: 1,
			modelState: "idle",
			readCount: 1,
		});

		releaseEvidence();
		const summary = await resolvingSummary;

		assert.deepStrictEqual({
			readCount,
			reviewedType: summary?.reviewedType,
			state: summary?.state,
		}, {
			readCount: 1,
			reviewedType: "transfer",
			state: "ready",
		});
	});

	test("derives IV output review from explicit drain voltage URI content", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Output.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource, [], null, createTestTableModelContent([
				["Vd", "Id"],
				["0", "1"],
				["1", "2"],
			])),
		);

		const target = {
			resource,
			sheetId: "table-a",
		};
		assert.equal(service.getLatestReviewSummary(target).state, "missing");
		const reviewExecution = await service.reviewResourceForExecution(target);
		assert.ok(reviewExecution);

		const summary = service.getLatestReviewSummary(target);
		assert.equal(summary.state, "ready");
		assert.equal(summary.reviewedType, "output");
		assert.equal(summary.reviewedSemanticLabel, "Detected Output");

		assert.equal(reviewExecution?.systemRecommendedReviewedTemplate?.template.measurement?.curveFamily, "iv");
		assert.equal(reviewExecution?.systemRecommendedReviewedTemplate?.template.measurement?.ivMode, "output");
		assert.equal(reviewExecution?.systemRecommendedReviewedTemplate?.reviewedType, "output");
	});

	test("keeps stale summary reads off policy refresh work", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Output.csv");
		const dataResourceService = store.add(new CountingDataResourceService(
			createDataResourceServiceForTest(resource, [], null, createTestTableModelContent([
				["Vd", "Id"],
				["0", "1"],
				["1", "2"],
			])),
		));
		const service = createReviewServiceForTest(
			userTemplateService,
			dataResourceService,
		);

		const target = {
			resource,
			sheetId: "table-a",
		};
		const reviewExecution = await service.reviewResourceForExecution(target);
		assert.equal(reviewExecution?.summary.reviewedType, "output");

		const cacheProbe = service as unknown as {
			readonly uriReviewCacheByKey: Map<string, {
				readonly reviewEngineVersion: number;
				readonly reviewPolicyVersion: number;
				readonly summary: ReviewSummary;
				readonly [key: string]: unknown;
			}>;
		};
		const cacheEntries = Array.from(cacheProbe.uriReviewCacheByKey.entries());
		assert.equal(cacheEntries.length, 1);
		const [cacheKey, cachedEntry] = cacheEntries[0] ?? [];
		assert.ok(cacheKey);
		assert.ok(cachedEntry);
		cacheProbe.uriReviewCacheByKey.set(cacheKey, {
			...cachedEntry,
			reviewEngineVersion: 0,
			reviewPolicyVersion: 0,
			summary: {
				...cachedEntry.summary,
				reviewedSemanticLabel: "Detected Transfer",
				reviewedType: "transfer",
			},
		});

		const staleSummary = service.getLatestReviewSummary(target);
		assert.equal(staleSummary.state, "stale");
		assert.equal(staleSummary.reviewedType, "transfer");

		const resolveStructuredContentCalls = dataResourceService.resolveStructuredContentCalls;
		await new Promise(resolve => setTimeout(resolve, 25));
		assert.equal(dataResourceService.resolveStructuredContentCalls, resolveStructuredContentCalls);
		assert.equal(service.getLatestReviewSummary(target).state, "stale");

		const refreshedSummary = await service.resolveReviewSummary(target);
		assert.equal(refreshedSummary?.state, "ready");
		assert.equal(refreshedSummary?.reviewedType, "output");
	});

	test("derives IV transfer review from B1500 DataName metadata rows", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/TransferMetadata.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource, [], null, createTestTableModelContent([
				["SetupTitle", "Transfer_DB"],
				["TestParameter", "Channel.VName", "Vg", "Vd", "Vs"],
				["TestParameter", "Channel.Func", "VAR1", "VAR2", "CONST"],
				["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
				["AnalysisSetup", "Analysis.Setup.Vector.Graph.Notes", "[VAR1] Unit=SMU3:MP, Name=Vg, Start=-1 V"],
				["DataName", "Vg", "Id", "Ig"],
				["DataValue", "-1", "-2.63E-12", "-2.05E-12"],
				["DataValue", "0", "-1.24E-11", "-4.12E-12"],
			])),
		);

		const target = {
			resource,
			sheetId: "table-a",
		};
		const reviewExecution = await service.reviewResourceForExecution(target);

		assert.equal(reviewExecution?.summary.state, "ready");
		assert.equal(reviewExecution?.systemRecommendedReviewedTemplate?.template.measurement?.curveFamily, "iv");
		assert.equal(reviewExecution?.systemRecommendedReviewedTemplate?.template.measurement?.ivMode, "transfer");
		assert.deepEqual(reviewExecution?.systemRecommendedReviewedTemplate?.template.blocks[0]?.rowRange, {
			startRow: 6,
			endRow: 7,
		});
		assert.deepEqual(reviewExecution?.systemRecommendedReviewedTemplate?.template.blocks[0]?.x.columns, [1]);
		assert.deepEqual(reviewExecution?.systemRecommendedReviewedTemplate?.template.blocks[0]?.x.ranges, [{
			column: 1,
			startRow: 6,
			endRow: 7,
		}]);
		assert.deepEqual(reviewExecution?.systemRecommendedReviewedTemplate?.template.blocks[0]?.y.columns, [2, 3]);
		assert.deepEqual(reviewExecution?.systemRecommendedReviewedTemplate?.template.blocks[0]?.y.ranges, [{
			column: 2,
			startRow: 6,
			endRow: 7,
		}, {
			column: 3,
			startRow: 6,
			endRow: 7,
		}]);
	});

	test("does not derive review candidates from DataName columns without numeric values", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/TransferHeadersOnly.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource, [], null, createTestTableModelContent([
				["SetupTitle", "Transfer_DB"],
				["DataName", "Vg", "Id"],
				["DataValue", "", ""],
				["DataValue", "not ready", "not measured"],
			])),
		);

		const reviewExecution = await service.reviewResourceForExecution({
			resource,
			sheetId: "table-a",
		});

		assert.equal(reviewExecution?.summary.state, "invalid");
		assert.equal(reviewExecution?.systemRecommendedReviewedTemplate, undefined);
		assert.deepEqual(reviewExecution?.summary.findingCodes, ["review.noCandidates"]);
	});

	test("derives PV measurement from generic voltage URI content without IV mode", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Instrument.csv");
		const dataResourceService = store.add(new CountingDataResourceService(
			createDataResourceServiceForTest(resource, [], null, createTestTableModelContent([
				["Voltage", "Current"],
				["0", "1"],
				["1", "2"],
			])),
		));
		const service = createReviewServiceForTest(
			userTemplateService,
			dataResourceService,
		);

		const target = {
			resource,
			sheetId: "table-a",
		};
		assert.equal(service.getLatestReviewSummary(target).state, "missing");
		assert.equal(dataResourceService.resolveStructuredContentCalls, 0);
		const reviewExecution = await service.reviewResourceForExecution(target);
		assert.ok(reviewExecution);
		assert.equal(reviewExecution.systemRecommendedReviewedTemplate?.template.measurement?.curveFamily, "pv");
		assert.equal(reviewExecution.systemRecommendedReviewedTemplate?.template.measurement?.ivMode, undefined);
		assert.equal(reviewExecution.summary.state, "ready");

		const summary = service.getLatestReviewSummary(target);
		assert.deepEqual({
			findingCodes: summary.findingCodes,
			reviewedType: summary.reviewedType,
			reviewedSemanticLabel: summary.reviewedSemanticLabel,
			state: summary.state,
		}, {
			findingCodes: [],
			reviewedType: "pv",
			reviewedSemanticLabel: "Detected Pv",
			state: "ready",
		});

		const resolveStructuredContentCalls = dataResourceService.resolveStructuredContentCalls;
		const secondReviewExecution = await service.reviewResourceForExecution(target);
		assert.equal(secondReviewExecution?.systemRecommendedReviewedTemplate?.template.measurement?.ivMode, undefined);
		assert.equal(dataResourceService.resolveStructuredContentCalls, resolveStructuredContentCalls);
	});

	test("keeps latest review summary reads off structured-content resolution", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Transfer.csv");
		const dataResourceService = store.add(new CountingDataResourceService(
			createDataResourceServiceForTest(resource),
		));
		const service = createReviewServiceForTest(
			userTemplateService,
			dataResourceService,
		);
		const target = {
			resource,
			sheetId: "table-a",
		};

		assert.equal(service.getLatestReviewSummary(target).state, "missing");
		assert.equal(service.getLatestReviewSummary(target).state, "missing");
		assert.equal(dataResourceService.resolveStructuredContentCalls, 0);

		await service.reviewResourceForExecution(target);
		const resolveStructuredContentCalls = dataResourceService.resolveStructuredContentCalls;

		assert.equal(service.getLatestReviewSummary(target).state, "ready");
		assert.equal(service.getLatestReviewSummary(target).state, "ready");
		assert.equal(dataResourceService.resolveStructuredContentCalls, resolveStructuredContentCalls);
	});

	test("does not start URI review work from summary reads", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const dataResourceService = store.add(new ResolvingDataResourceService());
		const service = createReviewServiceForTest(
			userTemplateService,
			dataResourceService,
		);

		for (let index = 0; index < 520; index += 1) {
			assert.equal(service.getLatestReviewSummary({
				resource: URI.file(`/workspace/table-${index}.csv`),
			}).state, "missing");
		}

		await new Promise(resolve => setTimeout(resolve, 0));
		assert.equal(dataResourceService.resolveStructuredContentCalls, 0);
	});

	test("reuses an active explicit URI review for execution", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const dataResourceService = store.add(new ControlledDataResourceService());
		const service = createReviewServiceForTest(
			userTemplateService,
			dataResourceService,
		);
		const target = {
			resource: URI.file("/workspace/Transfer.csv"),
			sheetId: "table-a",
		};

		const firstReviewExecution = service.reviewResourceForExecution(target);
		await waitUntil(() => dataResourceService.resolveStructuredContentCalls === 1);
		assert.equal(service.getLatestReviewSummary(target).state, "pending");
		const secondReviewExecution = service.reviewResourceForExecution(target);
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.equal(dataResourceService.resolveStructuredContentCalls, 1);

		dataResourceService.resolveNext({
			kind: "missingContent",
		});
		assert.equal(await firstReviewExecution, null);
		assert.equal(await secondReviewExecution, null);
		assert.equal(dataResourceService.resolveStructuredContentCalls, 1);
	});

	test("dispatches all independent URI reviews immediately without a concurrency cap", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const dataResourceService = store.add(new ControlledDataResourceService());
		const service = createReviewServiceForTest(userTemplateService, dataResourceService);
		const reviewCount = 64;

		const reviews = Array.from({ length: reviewCount }, (_, index) =>
			service.resolveReviewSummary({
				resource: URI.file(`/workspace/Review-${index}.csv`),
			})
		);

		assert.equal(dataResourceService.resolveStructuredContentCalls, reviewCount);
		for (let index = 0; index < reviewCount; index += 1) {
			dataResourceService.resolveNext({ kind: "missingContent" });
		}
		const summaries = await Promise.all(reviews);
		assert.equal(summaries.length, reviewCount);
	});

	test("does not commit a superseded active Review through a later waiter", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Transfer.csv");
		const dataResourceService = store.add(new ControlledDataResourceService());
		const service = createReviewServiceForTest(userTemplateService, dataResourceService);
		const target = { resource, sheetId: "table-a" };
		const readyReference = store.add(
			await createDataResourceServiceForTest(resource).resolveStructuredContent(target),
		);

		const initialReview = service.reviewResourceForExecution(target);
		await waitUntil(() => dataResourceService.resolveStructuredContentCalls === 1);
		dataResourceService.resolveNext(readyReference.object);
		await initialReview;
		assert.equal(service.getLatestReviewSummary(target).state, "ready");

		dataResourceService.fireDidChangeResource(resource);
		await waitUntil(() => dataResourceService.resolveStructuredContentCalls === 2, 40, 5);
		dataResourceService.fireDidChangeResource(resource);
		const laterWaiter = service.reviewResourceForExecution(target);
		dataResourceService.resolveNext({ kind: "missingContent" });

		assert.equal(await laterWaiter, null);
		assert.equal(service.getLatestReviewSummary(target).state, "stale");
		await waitUntil(() => dataResourceService.resolveStructuredContentCalls === 3, 40, 5);
		dataResourceService.resolveNext(readyReference.object);
		await waitUntil(() => service.getLatestReviewSummary(target).state === "ready", 40, 5);
	});

	test("keeps cached Review results when more than 512 targets are tracked", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource),
		);
		const target = { resource, sheetId: "table-a" };
		await service.resolveReviewSummary(target);
		await new Promise(resolve => setTimeout(resolve, 25));

		const cacheProbe = service as unknown as {
			trackUriReviewTarget(
				key: string,
				target: { readonly resource: URI; readonly sheetId?: string },
			): void;
		};
		for (let index = 0; index < 512; index += 1) {
			cacheProbe.trackUriReviewTarget(`test:${index}`, {
				resource: URI.file(`/workspace/Other-${index}.csv`),
			});
		}
		assert.equal(service.getLatestReviewSummary(target).state, "ready");
	});

	test("publishes pending state when explicit URI review starts", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const dataResourceService = store.add(new ControlledDataResourceService());
		const service = createReviewServiceForTest(
			userTemplateService,
			dataResourceService,
		);
		const target = {
			resource: URI.file("/workspace/Pending.csv"),
			sheetId: "table-a",
		};
		let reviewChangeCount = 0;
		const changedTargets: ReviewSummaryTarget[] = [];
		store.add(service.onDidChangeReview(targets => {
			reviewChangeCount += 1;
			changedTargets.push(...targets);
		}));

		const review = service.resolveReviewSummary(target);
		await waitUntil(() => dataResourceService.resolveStructuredContentCalls === 1);
		assert.equal(service.getLatestReviewSummary(target).state, "pending");
		await waitUntil(() => reviewChangeCount > 0, 40, 5);
		assert.equal(service.getLatestReviewSummary(target).state, "pending");
		assert.deepEqual(changedTargets.map(changedTarget => ({
			resource: changedTarget.resource.toString(),
			sheetId: changedTarget.sheetId,
		})), [{
			resource: target.resource.toString(),
			sheetId: "table-a",
		}]);

		dataResourceService.resolveNext({ kind: "missingContent" });
		await review;
	});

	test("keeps uncached active URI review isolated from resource-change reruns", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Transfer.csv");
		const dataResourceService = store.add(new ControlledDataResourceService());
		const service = createReviewServiceForTest(
			userTemplateService,
			dataResourceService,
		);
		const target = {
			resource,
			sheetId: "table-a",
		};

		const reviewExecution = service.reviewResourceForExecution(target);
		await waitUntil(() => dataResourceService.resolveStructuredContentCalls === 1);
		assert.equal(service.getLatestReviewSummary(target).state, "pending");
		dataResourceService.fireDidChangeResource(resource);
		dataResourceService.resolveNext({
			kind: "missingContent",
		});

		assert.equal(await reviewExecution, null);
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.equal(dataResourceService.resolveStructuredContentCalls, 1);
		assert.equal(service.getLatestReviewSummary(target).state, "invalid");
	});

	test("normalizes structured-cloned URI review targets before resolving models", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource),
		);
		const target: ReviewSummaryTarget = {
			resource: resource.toJSON() as unknown as URI,
			sheetId: "table-a",
		};

		assert.equal(service.getLatestReviewSummary(target).state, "missing");
		const reviewExecution = await service.reviewResourceForExecution(target);

		const summary = service.getLatestReviewSummary(target);
		assert.equal(summary.state, "ready");
		assert.equal(summary.resource.toString(), resource.toString());
		assert.equal(summary.reviewSignature?.includes("[object Object]"), false);

		assert.equal(reviewExecution?.resource.toString(), resource.toString());
		assert.equal(reviewExecution?.reviewSignature.includes("[object Object]"), false);
	});

	test("does not expose the default sheet id when the URI review target has no sheet", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource),
		);
		const target = { resource };

		assert.equal(service.getLatestReviewSummary(target).state, "missing");
		const reviewExecution = await service.reviewResourceForExecution(target);

		const summary = service.getLatestReviewSummary(target);
		assert.equal(summary.state, "ready");
		assert.equal(summary.sheetId, undefined);

		assert.equal(reviewExecution?.sheetId, undefined);
		assert.equal(reviewExecution?.summary.sheetId, undefined);
	});

	test("does not fall back to another sheet when a URI review sheet target is missing", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource, [], "table-a"),
		);
		const target = {
			resource,
			sheetId: "missing-sheet",
		};

		assert.equal(service.getLatestReviewSummary(target).state, "missing");
		await service.reviewResourceForExecution(target);

		const summary = service.getLatestReviewSummary(target);
		assert.equal(summary.state, "invalid");
		assert.deepEqual(summary.findingCodes, ["review.sheetNotFound"]);

		const manualResult = await service.reviewResourceManualTemplate({
			resource: target.resource,
			sheetId: target.sheetId,
			selection: {
				kind: "user",
				templateId: "template-a",
			},
		});
		assert.equal(manualResult.kind, "invalid");
		if (manualResult.kind === "invalid") {
			assert.deepEqual(manualResult.diagnostics.map(diagnostic => diagnostic.code), ["review.manual.sheetNotFound"]);
		}
	});

	test("refreshes cached URI reviews when review inputs change", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource),
		);
		const target = {
			resource,
			sheetId: "table-a",
		};
		await service.reviewResourceForExecution(target);
		assert.equal(service.getLatestReviewSummary(target).state, "ready");

		await userTemplateService.createTemplate({
			id: "template-a",
			name: "Transfer",
			template: createTemplate({ id: "template-a" }),
		});

		const staleSummary = service.getLatestReviewSummary(target);
		assert.equal(staleSummary.state, "stale");
		assert.equal(staleSummary.findingCodes.includes("review.stale"), true);
		assert.equal(staleSummary.templateFingerprint, undefined);

		await waitUntil(() => service.getLatestReviewSummary(target).state === "ready", 40, 5);
		assert.equal(service.getLatestReviewSummary(target).state, "ready");
	});

	test("refreshes cached URI reviews when schema profiles change", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const schemaProfileService = store.add(new TestSchemaProfileService());
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource),
			schemaProfileService,
		);
		const target = {
			resource,
			sheetId: "table-a",
		};
		await service.reviewResourceForExecution(target);
		assert.equal(service.getLatestReviewSummary(target).state, "ready");

		schemaProfileService.setSnapshot(createSchemaProfileSnapshot([createSchemaProfile()]));

		const staleSummary = service.getLatestReviewSummary(target);
		assert.equal(staleSummary.state, "stale");
		assert.equal(staleSummary.findingCodes.includes("review.stale"), true);

		await waitUntil(() => service.getLatestReviewSummary(target).state === "ready", 40, 5);
		assert.equal(service.getLatestReviewSummary(target).state, "ready");
	});

	test("does not confirm reviewed templates without structured column roles", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const schemaProfileService = store.add(new TestSchemaProfileService());
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource),
			schemaProfileService,
		);
		const reviewExecution = await service.reviewResourceForExecution({
			resource,
			sheetId: "table-a",
		});
		const reviewedTemplate = reviewExecution?.systemRecommendedReviewedTemplate;
		assert.ok(reviewedTemplate);
		assert.equal(schemaProfileService.confirmations.length, 0);

		const profile = await service.confirmReviewedTemplate({
			resource,
			sheetId: "table-a",
			reviewedTemplate,
			reason: "user",
		});

		assert.equal(profile, null);
		assert.equal(schemaProfileService.confirmations.length, 0);
	});

	test("does not learn schema profiles from automatic URI review derivation", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const schemaProfileService = store.add(new TestSchemaProfileService());
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource),
			schemaProfileService,
		);

		await service.reviewResourceForExecution({
			resource,
			sheetId: "table-a",
		});

		assert.equal(schemaProfileService.confirmations.length, 0);
		assert.deepEqual(schemaProfileService.getProfiles(), []);
	});

	test("returns null when reviewed template confirmation cannot resolve content", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const schemaProfileService = store.add(new TestSchemaProfileService());
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(URI.file("/workspace/Transfer.csv")),
			schemaProfileService,
		);

		const profile = await service.confirmReviewedTemplate({
			resource: URI.file("/workspace/Missing.csv"),
			reviewedTemplate: createReviewedTemplateForTest(),
			reason: "user",
		});

		assert.equal(profile, null);
		assert.equal(schemaProfileService.confirmations.length, 0);
	});

	test("returns null when reviewed template columns cannot be mapped to structured roles", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const schemaProfileService = store.add(new TestSchemaProfileService());
		const resource = URI.file("/workspace/Transfer.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource),
			schemaProfileService,
		);

		const profile = await service.confirmReviewedTemplate({
			resource,
			sheetId: "table-a",
			reviewedTemplate: createReviewedTemplateForTest(createTemplate({
				blocks: [{
					rowRange: {
						startRow: 1,
						endRow: 2,
					},
					x: {
						columns: [99],
						unit: "V",
					},
					y: {
						columns: [100],
						unit: "A",
					},
					segmentation: {
						kind: "none",
					},
					legend: {
						target: "auto",
					},
				}],
			})),
			reason: "user",
		});

		assert.equal(profile, null);
		assert.equal(schemaProfileService.confirmations.length, 0);
	});

	test("carries URI parser diagnostics into review summaries", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Malformed.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource, [{
				code: "table.parser.MissingQuotes",
				message: "Quoted field unterminated.",
				rowIndex: 1,
				severity: "fatal",
			}]),
		);

		const target = { resource };
		assert.equal(service.getLatestReviewSummary(target).state, "missing");
		const reviewExecution = await service.reviewResourceForExecution(target);

		const summary = service.getLatestReviewSummary(target);
		assert.equal(summary.state, "invalid");
		assert.deepEqual(summary.findingCodes, ["review.parserFatalDiagnostic"]);
		assert.equal(summary.message, "Review candidates are invalid.");

		assert.equal(reviewExecution?.summary.findingCodes.includes("review.parserFatalDiagnostic"), true);
	});

	test("does not treat recoverable URI parser errors as fatal review findings", async () => {
		const userTemplateService = createUserTemplateServiceForTest();
		const resource = URI.file("/workspace/Recoverable.csv");
		const service = createReviewServiceForTest(
			userTemplateService,
			createDataResourceServiceForTest(resource, [{
				code: "table.parser.BadRow",
				message: "A row was recovered with fewer cells.",
				rowIndex: 2,
				severity: "error",
			}]),
		);

		const target = { resource };
		assert.equal(service.getLatestReviewSummary(target).state, "missing");
		const reviewExecution = await service.reviewResourceForExecution(target);

		const summary = service.getLatestReviewSummary(target);
		assert.notEqual(summary.state, "invalid");
		assert.equal(summary.findingCodes.includes("review.parserFatalDiagnostic"), false);

		assert.equal(reviewExecution?.summary.findingCodes.includes("review.parserFatalDiagnostic"), false);
	});

});

class TestSchemaProfileService extends Disposable implements ISchemaProfileService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeSchemaProfilesEmitter = this._register(new Emitter<SchemaProfileSnapshot>());
	public readonly onDidChangeSchemaProfiles = this.onDidChangeSchemaProfilesEmitter.event;
	public readonly confirmations: ConfirmSchemaProfileInput[] = [];

	private snapshot: SchemaProfileSnapshot = createSchemaProfileSnapshot([]);

	public setSnapshot(snapshot: SchemaProfileSnapshot): void {
		this.snapshot = snapshot;
		this.onDidChangeSchemaProfilesEmitter.fire(snapshot);
	}

	public clearProfiles(): void {
		this.setSnapshot(createSchemaProfileSnapshot([]));
	}

	public confirmProfile(input: Parameters<ISchemaProfileService["confirmProfile"]>[0]): SchemaProfile | null {
		const profile = createSchemaProfileFromConfirmation(input);
		if (!profile) {
			return null;
		}

		this.confirmations.push(input);
		this.upsertProfile(profile);
		return profile;
	}

	public getProfiles(): readonly SchemaProfile[] {
		return this.snapshot.profiles;
	}

	public getSnapshot(): SchemaProfileSnapshot {
		return this.snapshot;
	}

	public getVersion(): number {
		return this.snapshot.version;
	}

	public removeProfile(profileId: string): void {
		this.setSnapshot({
			version: this.snapshot.version + 1,
			profiles: this.snapshot.profiles.filter(profile => profile.id !== profileId),
		});
	}

	public upsertProfile(profile: SchemaProfile): SchemaProfile {
		this.setSnapshot({
			version: this.snapshot.version + 1,
			profiles: [
				...this.snapshot.profiles.filter(candidate => candidate.id !== profile.id),
				profile,
			],
		});
		return profile;
	}
}

class CountingDataResourceService extends Disposable implements IDataResourceService {
	public declare readonly _serviceBrand: undefined;

	public readonly onDidChangeResource: IDataResourceService["onDidChangeResource"];
	public resolveStructuredContentCalls = 0;
	private readonly delegate: IDataResourceService;

	public constructor(
		delegate: IDataResourceService,
	) {
		super();
		this.delegate = delegate;
		this.onDidChangeResource = delegate.onDidChangeResource;
	}

	public canHandleResource(
		resource: Parameters<IDataResourceService["canHandleResource"]>[0],
	): ReturnType<IDataResourceService["canHandleResource"]> {
		return this.delegate.canHandleResource(resource);
	}

	public resolveStructuredContent(
		target: Parameters<IDataResourceService["resolveStructuredContent"]>[0],
	): ReturnType<IDataResourceService["resolveStructuredContent"]> {
		this.resolveStructuredContentCalls += 1;
		return this.delegate.resolveStructuredContent(target);
	}

	public resolve(
		target: Parameters<IDataResourceService["resolve"]>[0],
	): ReturnType<IDataResourceService["resolve"]> {
		return this.delegate.resolve(target);
	}
}

class ResolvingDataResourceService extends Disposable implements IDataResourceService {
	public declare readonly _serviceBrand: undefined;

	public readonly onDidChangeResource = Event.None as IDataResourceService["onDidChangeResource"];
	public resolveStructuredContentCalls = 0;

	public canHandleResource(): boolean {
		return true;
	}

	public async resolveStructuredContent(): Promise<IDataResourceStructuredContentReference> {
		this.resolveStructuredContentCalls += 1;
		return {
			object: {
				kind: "missingContent",
			},
			dispose: () => undefined,
		};
	}

	public resolve(): void {}
}

class ControlledDataResourceService extends Disposable implements IDataResourceService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeResourceEmitter = this._register(new Emitter<URI>());
	public readonly onDidChangeResource = this.onDidChangeResourceEmitter.event;
	public resolveStructuredContentCalls = 0;
	private readonly pendingResolvers: Array<(reference: IDataResourceStructuredContentReference) => void> = [];

	public canHandleResource(): boolean {
		return true;
	}

	public resolveStructuredContent(): Promise<IDataResourceStructuredContentReference> {
		this.resolveStructuredContentCalls += 1;
		return new Promise(resolve => {
			this.pendingResolvers.push(resolve);
		});
	}

	public resolve(): void {}

	public fireDidChangeResource(resource: URI): void {
		this.onDidChangeResourceEmitter.fire(resource);
	}

	public resolveNext(resolution: DataResourceStructuredContentResolution): void {
		const resolve = this.pendingResolvers.shift();
		assert.ok(resolve, "Expected a pending structured-content resolution.");
		resolve({
			object: resolution,
			dispose: () => undefined,
		});
	}
}

class TestStorageService extends AbstractStorageService {
	private readonly values = new Map<string, string>();

	protected readValue(key: string, scope: StorageScope): string | undefined {
		return this.values.get(this.storageKey(key, scope));
	}

	protected writeValue(key: string, scope: StorageScope, value: string): void {
		this.values.set(this.storageKey(key, scope), value);
	}

	protected deleteValue(key: string, scope: StorageScope): void {
		this.values.delete(this.storageKey(key, scope));
	}

	protected readKeys(scope: StorageScope): string[] {
		const prefix = this.storageKey("", scope);
		return [...this.values.keys()]
			.filter(key => key.startsWith(prefix))
			.map(key => key.slice(prefix.length));
	}

	private storageKey(key: string, scope: StorageScope): string {
		return `${scope}:${key}`;
	}
}

class TestTableModelService extends Disposable implements ITableModelService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeModelEmitter = this._register(new Emitter<ITableModel>());
	public readonly onDidChangeModel = this.onDidChangeModelEmitter.event;
	private readonly model: TableContentModel;

	public constructor(
		private readonly resource: URI,
		private readonly diagnostics: readonly TableParseDiagnostic[] = [],
		private readonly fixedSheetId: string | null = null,
		private readonly content: TableModelContentSnapshot = createTestTableModelContent(),
	) {
		super();
		this.model = this._register(new TableContentModel(resource));
	}

	public canHandleResource(resource: URI): boolean {
		return resource.toString() === this.resource.toString();
	}

	public async createModelReference(
		resource: URI,
		source?: TableSource | null,
	): Promise<ITableModelReference> {
		if (!this.canHandleResource(resource)) {
			throw new Error(`Unsupported test table resource: ${resource.toString()}`);
		}

		await this.resolveModel(source);
		return {
			object: this.model,
			dispose: () => undefined,
		};
	}

	public get(resource: URI | null | undefined): ITableModel | undefined {
		return resource && this.canHandleResource(resource)
			? this.model
			: undefined;
	}

	public resolve(resource: URI, source?: TableSource | null): void {
		if (!this.canHandleResource(resource)) {
			return;
		}

		void this.resolveModel(source);
	}

	private async resolveModel(source?: TableSource | null): Promise<void> {
		if (this.model.getSnapshot().loadState.state === "ready") {
			return;
		}

		const sheetId = this.fixedSheetId ?? String(source?.sheetId ?? "table-a");
		await this.model.resolve({
			resolveContent: async () => ({
				content: this.content,
				diagnostics: this.diagnostics,
				format: "csv",
				resource: this.resource,
				sheets: [{
					content: this.content,
					sheetId,
					sheetName: null,
				}],
				sourceVersion: 1,
			}),
		});
		this.onDidChangeModelEmitter.fire(this.model);
	}
}

const waitUntil = async (
	condition: () => boolean,
	attempts = 20,
	delayMs = 0,
): Promise<void> => {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		if (condition()) {
			return;
		}
		await new Promise(resolve => setTimeout(resolve, delayMs));
	}
	assert.fail("Timed out waiting for condition.");
};

const createTestTableModelContent = (
	rows: readonly (readonly string[])[] = [
		["Vg", "Id"],
		["0", "1"],
		["1", "2"],
	],
): TableModelContentSnapshot => {
	const columnCount = rows.reduce((count, row) => Math.max(count, row.length), 0);
	return {
		columnCount,
		maxCellLengths: Array.from({ length: columnCount }, (_, column) =>
			rows.reduce((length, row) => Math.max(length, String(row[column] ?? "").length), 0)
		),
		rowCount: rows.length,
		rows,
	};
};

const createSchemaProfileSnapshot = (
	profiles: readonly SchemaProfile[],
	version = profiles.length,
): SchemaProfileSnapshot => ({
	version,
	profiles,
});

const createSchemaProfile = ({
	bindings = defaultSchemaProfileBindings,
	conflictCount = 0,
	confirmedCount = 1,
	id = "schema:schema-a",
	schemaFingerprint = "schema-a",
}: {
	readonly bindings?: SchemaProfile["bindings"];
	readonly conflictCount?: number;
	readonly confirmedCount?: number;
	readonly id?: string;
	readonly schemaFingerprint?: string;
} = {}): SchemaProfile => ({
	id,
	scope: "workspace",
	schemaFingerprint,
	confirmedCount,
	conflictCount,
	bindings,
});

const defaultSchemaProfileBindings: SchemaProfile["bindings"] = [{
	selector: {
		columnIndex: 0,
		normalizedHeader: "vg",
	},
	role: "vg",
	axis: "x",
	canonicalUnit: "V",
}, {
	selector: {
		columnIndex: 1,
		normalizedHeader: "id",
	},
	role: "id",
	axis: "y",
	canonicalUnit: "A",
}];

const createReviewEvidenceWithSchemaProfileColumns = ({
	blockConfidence = 0.95,
	fingerprint = "schema-a",
}: {
	readonly blockConfidence?: number;
	readonly fingerprint?: string;
} = {}): ReviewEvidence => {
	const evidence = createReviewEvidence();
	assert.ok(evidence.structuredContent);
	return {
		...evidence,
		structuredContent: {
			...evidence.structuredContent,
			structure: {
				...evidence.structuredContent.structure,
				fingerprint,
			},
			columnProfiles: createSchemaProfileColumnProfiles(),
			blocks: evidence.structuredContent.blocks.map(block => ({
				...block,
				confidence: blockConfidence,
			})),
			bindingCandidates: evidence.structuredContent.bindingCandidates.map(binding => ({
				...binding,
				confidence: blockConfidence,
			})),
		},
	};
};

const createSchemaProfileColumnProfiles = (): readonly StructuredColumnProfile[] => [{
	rawCol: 0,
	headerText: "Vg",
	normalizedHeader: "vg",
	kind: "numeric",
}, {
	rawCol: 1,
	headerText: "Id",
	normalizedHeader: "id",
	kind: "numeric",
}];

const createReviewEvidence = ({
	ambiguousBindings = false,
	bindingConfidence = 0.95,
	ambiguousBindingConfidence = bindingConfidence,
	includeDataResourceBinding = true,
}: {
	readonly ambiguousBindingConfidence?: number;
	readonly ambiguousBindings?: boolean;
	readonly bindingConfidence?: number;
	readonly includeDataResourceBinding?: boolean;
} = {}): ReviewEvidence => ({
	sourceMetadata: {
		fileName: "Transfer.csv",
		rowCount: 3,
		columnCount: 2,
	},
	structuredContent: {
		structure: createEmptyStructuredContentStructure(),
		columnProfiles: [],
		xRangeCandidates: [{
			id: "x-range-a",
			column: 0,
			startRow: 1,
			endRow: 2,
			direction: "ascending",
			stepKind: "constant",
			step: 1,
			pointCount: 2,
			confidence: bindingConfidence,
			reasons: ["xRange.test"],
		}],
		xGroupCandidates: [],
		dataBlockCandidates: [{
			id: "block-a",
			xRangeCandidateId: "x-range-a",
			xGroupCandidateIds: [],
			startRow: 1,
			endRow: 2,
			startCol: 0,
			endCol: 1,
			xColumn: 0,
			dependentColumns: [1],
			separatorColumns: [],
			columnDirection: "rightPreferred",
			confidence: bindingConfidence,
			reasons: ["dataBlock.test"],
		}],
		dependentValueCandidates: [{
			id: "dependent-a",
			column: 1,
			xRangeCandidateIds: ["x-range-a"],
			dataBlockCandidateIds: ["block-a"],
			numericCoverage: 1,
			confidence: bindingConfidence,
			reasons: ["dependent.test"],
		}],
		columnTitleSpans: [],
		infoCellNeighborhoods: [],
		bindingCandidates: includeDataResourceBinding ? [
			{
				id: "binding-a",
				xRangeCandidateIds: ["x-range-a"],
				dependentValueCandidateIds: ["dependent-a"],
				dataBlockCandidateIds: ["block-a"],
				relation: "oneX-oneY",
				confidence: bindingConfidence,
				ambiguityCodes: [],
				reasons: ["binding.test"],
			},
			...(ambiguousBindings ? [{
				id: "binding-b",
				xRangeCandidateIds: ["x-range-a"],
				dependentValueCandidateIds: ["dependent-a"],
				dataBlockCandidateIds: ["block-a"],
				relation: "oneX-oneY" as const,
				confidence: ambiguousBindingConfidence,
				ambiguityCodes: [],
				reasons: ["binding.test"],
			}] : []),
		] : [],
		semanticRulesFingerprint: "semantic:test",
		semanticCandidates: [],
		groups: [],
		blocks: [{
			id: "block-a",
			fileId: "file-a",
			rawTableId: "table-a",
			label: "Transfer",
			type: "transfer",
			family: "iv",
			ivMode: "transfer",
			source: {
				fullRange: {
					startRow: 0,
					endRow: 2,
					startCol: 0,
					endCol: 1,
				},
				dataRange: {
					startRow: 1,
					endRow: 2,
					startCol: 0,
					endCol: 1,
				},
			},
			columns: {
				columns: [{
					rawCol: 0,
					role: "vg",
					unit: "V",
					headerText: "Vg",
					confidence: 0.95,
					sourceRange: {
						startRow: 0,
						endRow: 2,
						startCol: 0,
						endCol: 0,
					},
					dataRange: {
						startRow: 1,
						endRow: 2,
						startCol: 0,
						endCol: 0,
					},
				}, {
					rawCol: 1,
					role: "id",
					unit: "A",
					headerText: "Id",
					confidence: 0.95,
					sourceRange: {
						startRow: 0,
						endRow: 2,
						startCol: 1,
						endCol: 1,
					},
					dataRange: {
						startRow: 1,
						endRow: 2,
						startCol: 1,
						endCol: 1,
					},
				}],
			},
			rowCount: 3,
			columnCount: 2,
			confidence: bindingConfidence,
			diagnosticCodes: [],
		}],
		diagnostics: [],
	},
});

const createTemplate = (
	overrides: Partial<Template> = {},
): Template => ({
	schemaVersion: 1,
	id: "template-a",
	name: "Transfer",
	version: 1,
	blocks: [{
		rowRange: {
			startRow: 1,
			endRow: 2,
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
			kind: "none",
		},
		legend: {
			target: "auto",
		},
	}],
	stopOnError: false,
	...overrides,
});

const createReviewedTemplateForTest = (
	template = createTemplate(),
): ReviewedTemplate => {
	const templateFingerprint = createTemplateFingerprint(template);
	return {
		candidateId: "candidate:test",
		source: {
			kind: "user",
			templateId: "template-a",
			templateVersion: 1,
		},
		template,
		templateFingerprint,
		review: {
			candidateId: "candidate:test",
			interpretationFingerprint: templateFingerprint,
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
	};
};
