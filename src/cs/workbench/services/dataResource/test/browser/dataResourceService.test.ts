/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { CancellationTokenSource } from "src/cs/base/common/cancellation";
import { isCancellationError } from "src/cs/base/common/errors";
import { Emitter, Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	DataResourceContentMemoryEstimator,
	DataResourceContentMemoryGate,
	estimateDataResourceContentMemoryBytes,
} from "src/cs/workbench/services/dataResource/browser/dataResourceContentMemoryGate";
import {
	createStructuredContentEvidence,
	DataResourceService,
} from "src/cs/workbench/services/dataResource/browser/dataResourceService";
import {
	builtinRules,
	createSemanticMatcher,
	isCustomSemanticMatchTermAllowed,
	matchSemanticRowMarker,
	matchSemanticTitle,
	toSemanticTermKey,
} from "src/cs/workbench/services/dataResource/common/semanticRules";
import type {
	ISettingsService,
	TemplateSemanticPatches,
	TemplateSemanticTermPatch,
} from "src/cs/workbench/services/settings/common/settings";
import {
	createStructuredContentPhysicalAnalysisBuilder,
	type StructuredContentEvidence,
} from "src/cs/workbench/services/dataResource/common/structuredContent";
import type { IStructuredContentEvidenceService } from "src/cs/workbench/services/dataResource/common/structuredContentEvidenceService";
import {
	TableModel as TableContentModel,
	type ITableModel,
	type TableModelContentSnapshot,
} from "src/cs/workbench/services/table/common/model";
import type { TableSource } from "src/cs/workbench/services/table/common/table";
import type {
	ITableModelReference,
	ITableModelService,
} from "src/cs/workbench/services/table/common/resolverService";
import { TestDataResourceContentService } from "src/cs/workbench/services/dataResource/test/common/testDataResourceContentService";
import { testStructuredContentEvidenceService } from "src/cs/workbench/services/dataResource/test/common/testStructuredContentEvidenceService";

suite("workbench/services/dataResource/test/browser/dataResourceService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let resourceCounter = 0;

	const resolveEvidence = async (
		rows: readonly (readonly string[])[],
		conductorSettings: Record<string, unknown> | null = null,
	): Promise<StructuredContentEvidence> => {
		resourceCounter += 1;
		const resource = URI.file(`/workspace/data-resource-${resourceCounter}.csv`);
		const tableModelService = store.add(new TestTableModelService(resource, createTableContent(rows)));
		const settingsService = {
			onDidChangeConductorSettings: Event.None,
			getConductorSettings: () => conductorSettings,
		} as unknown as ISettingsService;
		const service = store.add(new DataResourceService(
			store.add(new TestDataResourceContentService(tableModelService)),
			settingsService,
			testStructuredContentEvidenceService,
		));
		const reference = await service.resolveStructuredContent({ resource });
		const resolution = reference.object;
		if (resolution.kind !== "ready") {
			assert.fail(`Expected ready DataResource resolution, got ${resolution.kind}.`);
		}
		const evidence = resolution.snapshot.structuredContent;
		reference.dispose();
		return evidence;
	};

	test("matches semantic title and row marker terms", () => {
		const drainVoltageMatch = matchSemanticTitle("Drain Voltage");
		const gateVoltageXMatch = matchSemanticTitle("Gate Voltage X");
		const gateVoltageYMatch = matchSemanticTitle("Gate Voltage Y");

		assert.equal(drainVoltageMatch?.axisTendency, "x");
		assert.equal(drainVoltageMatch?.canonicalRole, "unknown");
		assert.equal(gateVoltageXMatch?.axisTendency, "x");
		assert.equal(gateVoltageXMatch?.canonicalRole, "unknown");
		assert.equal(gateVoltageYMatch?.axisTendency, "dependent");
		assert.equal(gateVoltageYMatch?.canonicalRole, "unknown");
		assert.equal(matchSemanticTitle("vpn")?.canonicalRole, "unknown");
		assert.equal(matchSemanticTitle("vpn")?.axisTendency, "unknown");
		assert.equal(matchSemanticTitle("Cp")?.canonicalRole, "unknown");
		assert.equal(matchSemanticTitle("Cp")?.axisTendency, "dependent");
		assert.equal(matchSemanticTitle("Cp(vp=0.00000)"), null);
		const channelXMatch = matchSemanticTitle("CH1 Voltage");
		assert.equal(channelXMatch?.axisTendency, "x");
		assert.ok(channelXMatch?.semanticRules.some(rule =>
			rule.label === "iv transfer" &&
			rule.axisTendency === "x"
		));
		assert.ok(channelXMatch?.semanticRules.some(rule =>
			rule.label === "iv output" &&
			rule.axisTendency === "x"
		));
		assert.equal(matchSemanticTitle("CH1 Current")?.axisTendency, "dependent");
		assert.equal(matchSemanticTitle("CH1 Resistance")?.axisTendency, "dependent");
		const channelProofMatch = matchSemanticTitle("CH2 Voltage");
		assert.equal(channelProofMatch?.axisTendency, "unknown");
		assert.ok(channelProofMatch?.semanticRules.some(rule =>
			rule.label === "iv transfer" &&
			rule.axisTendency === "unknown"
		));
		assert.ok(channelProofMatch?.semanticRules.some(rule =>
			rule.label === "iv output" &&
			rule.axisTendency === "unknown"
		));
		const idVgHeaderMatch = matchSemanticTitle("drain TotalCurrent(IdVg_n938_des) X");
		assert.equal(idVgHeaderMatch?.axisTendency, "x");
		assert.ok(idVgHeaderMatch?.semanticRules.some(rule =>
			rule.label === "iv transfer" &&
			rule.axisTendency === "x"
		));
		for (const ambiguousTerm of ["V", "I", "C", "G", "t", "f"]) {
			assert.equal(matchSemanticTitle(ambiguousTerm), null);
		}
		assert.equal(matchSemanticTitle("ipt")?.canonicalRole, "unknown");
		assert.equal(matchSemanticTitle("ipt")?.axisTendency, "dependent");
		assert.equal(matchSemanticRowMarker("DataName"), "titleRow");
		assert.equal(matchSemanticRowMarker("DataValue"), "dataRow");
		assert.equal(matchSemanticRowMarker("Name"), null);
		assert.equal(matchSemanticRowMarker("Value"), null);
		const matcher = createSemanticMatcher();
		assert.deepEqual(matcher.matchRowMarkerInRow(["DataName", "Vg"]), {
			kind: "titleRow",
			column: 0,
			requiresSameMarkerColumn: true,
			supplementId: "supplement:1",
			supplementLabel: "title-data-row-markers",
		});
		assert.equal(matcher.matchRowMarkerInRow(["", "DataName"]), null);
	});

	test("keeps built-in IV semantic rules split between transfer and output", () => {
		const removedYTerms = new Set([
			"TotalCurrent",
			"CurrentDrain",
			"CurrentGate",
			"CurrentSource",
			"Current",
			"Ipt",
		]);
		const modeCurrentTerms = new Set([
			"Id",
			"Ids",
			"Ig",
			"Igs",
			"Is",
		]);
		assert.deepStrictEqual(
			builtinRules
				.filter(rule => rule.id.startsWith("iv:"))
				.map(rule => ({
					label: rule.label,
					type: rule.type,
					proofTerms: rule.proofTerms.filter(term => term === "Output" || term === "Transfer_DB" || term === "CH2 Voltage"),
					xTerms: rule.xTerms.filter(term => term === "idvg" || term === "idvd"),
					yTerms: rule.yTerms.filter(term => modeCurrentTerms.has(term)),
					removedYTerms: rule.yTerms.filter(term => removedYTerms.has(term)),
				})),
			[
				{
					label: "iv transfer",
					type: "transfer",
					proofTerms: ["Transfer_DB", "CH2 Voltage"],
					xTerms: ["idvg"],
					yTerms: ["Id", "Ids", "Ig", "Igs", "Is"],
					removedYTerms: [],
				},
				{
					label: "iv output",
					type: "output",
					proofTerms: ["Output", "CH2 Voltage"],
					xTerms: ["idvd"],
					yTerms: ["Id", "Ids"],
					removedYTerms: [],
				},
			],
		);
		assert.equal(matchSemanticTitle("Output")?.semanticRules[0]?.type, "output");
		assert.equal(matchSemanticTitle("Transfer_DB")?.semanticRules[0]?.type, "transfer");
		const totalCurrentRules = matchSemanticTitle("TotalCurrent")?.semanticRules ?? [];
		assert.equal(totalCurrentRules.some(rule => rule.id === "iv:1" || rule.id === "iv:2"), false);
	});

	test("keeps globally constant shared CH2 proof values from selecting IV mode for CH1 data blocks", async () => {
		const evidence = await resolveEvidence([
			["CH1 Voltage", "CH1 Current", "CH1 Resistance", "CH2 Voltage"],
			["0", "1e-12", "100", "1"],
			["0.5", "2e-12", "110", "1"],
			["1", "4e-12", "120", "1"],
			["0", "5e-12", "130", "1"],
			["0.5", "6e-12", "140", "1"],
			["1", "8e-12", "150", "1"],
		]);

		const block = evidence.blocks.find(candidate =>
			candidate.source.dataRange?.startCol === 0 &&
			candidate.source.dataRange?.endCol === 2
		);
		assert.ok(block);
		assert.equal(block.ivMode, undefined);
	});

	test("uses stepped shared CH2 proof values to select IV output for repeated CH1 sweeps", async () => {
		const evidence = await resolveEvidence([
			["CH1 Voltage", "CH1 Current", "CH1 Resistance", "CH2 Voltage"],
			["0", "1e-12", "100", "0"],
			["0.5", "2e-12", "110", "0"],
			["1", "4e-12", "120", "0"],
			["0", "5e-12", "130", "19.99999"],
			["0.5", "6e-12", "140", "20"],
			["1", "8e-12", "150", "20.00001"],
		]);

		const block = evidence.blocks.find(candidate =>
			candidate.source.dataRange?.startCol === 0 &&
			candidate.source.dataRange?.endCol === 2
		);
		assert.equal(block?.ivMode, "output");
		assert.deepEqual(block?.proofColumns, [3]);
	});

	test("keeps noisy nA CH2 current proof from overriding stepped CH2 voltage output proof", async () => {
		const semanticPatches: TemplateSemanticPatches = {
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
		};
		const evidence = await resolveEvidence([
			["CH1 Voltage", "CH1 Current", "CH1 Resistance", "CH2 Voltage", "CH2 Current"],
			["0", "1e-12", "100", "0", "1.0e-9"],
			["0.5", "2e-12", "110", "0", "1.4e-9"],
			["1", "4e-12", "120", "0", "0.9e-9"],
			["0", "5e-12", "130", "19.99999", "1.1e-9"],
			["0.5", "6e-12", "140", "20", "1.5e-9"],
			["1", "8e-12", "150", "20.00001", "1.0e-9"],
		], { templateSemanticPatches: semanticPatches });

		const block = evidence.blocks.find(candidate =>
			candidate.source.dataRange?.startCol === 0 &&
			candidate.source.dataRange?.endCol === 1
		);
		assert.equal(block?.ivMode, "output");
	});

	test("uses exclusive output proof title to select IV output for CH1 data blocks", async () => {
		const evidence = await resolveEvidence([
			["CH1 Voltage", "CH1 Current", "CH1 Resistance", "CH2 Voltage", "Output"],
			["0", "1e-12", "100", "0", "1"],
			["0.5", "2e-12", "110", "0", "1"],
			["1", "4e-12", "120", "0", "1"],
			["0", "5e-12", "130", "1", "1"],
			["0.5", "6e-12", "140", "1", "1"],
			["1", "8e-12", "150", "1", "1"],
		]);

		const block = evidence.blocks.find(candidate =>
			candidate.source.dataRange?.startCol === 0 &&
			candidate.source.dataRange?.endCol === 2
		);
		assert.equal(block?.ivMode, "output");
	});

	test("uses exclusive transfer proof title to select IV transfer for CH1 data blocks", async () => {
		const evidence = await resolveEvidence([
			["CH1 Voltage", "CH1 Current", "CH1 Resistance", "CH2 Voltage", "Transfer_DB"],
			["0", "1e-12", "100", "0", "1"],
			["0.5", "2e-12", "110", "0", "1"],
			["1", "4e-12", "120", "0", "1"],
			["0", "5e-12", "130", "1", "1"],
			["0.5", "6e-12", "140", "1", "1"],
			["1", "8e-12", "150", "1", "1"],
		]);

		const block = evidence.blocks.find(candidate =>
			candidate.source.dataRange?.startCol === 0 &&
			candidate.source.dataRange?.endCol === 2
		);
		assert.equal(block?.ivMode, "transfer");
	});

	test("uses template semantic term entries in DataResource matcher", async () => {
		const evidence = await resolveEvidence([
			["DriveBias", "SenseCurrent"],
			["0", "1e-12"],
			["0.5", "2e-12"],
			["1", "4e-12"],
		], {
				templateSemanticPatches: createRulePatchSettings({
					id: "drive-sense",
					label: "drive",
					type: "drive",
					proofTerms: ["Drive Legend"],
					xTerms: ["DriveBias"],
					yTerms: ["SenseCurrent"],
			}).templateSemanticPatches,
		});

		assert.ok(evidence.semanticRulesFingerprint.includes("data-resource-rules:"));
		assert.ok(evidence.columnTitleSpans.some(span =>
			span.targetColumn === 0 &&
			span.canonicalRole === "unknown" &&
			span.axisTendency === "x" &&
			span.reasons.includes("rules.term") &&
			span.semanticRules.some(rule => rule.id === "drive-sense" && rule.axisTendency === "x")
		));
		assert.ok(evidence.columnTitleSpans.some(span =>
			span.targetColumn === 1 &&
			span.canonicalRole === "unknown" &&
			span.axisTendency === "dependent" &&
			span.semanticRules.some(rule => rule.id === "drive-sense" && rule.axisTendency === "dependent")
		));
	});

	test("compiles template semantic aliases under term keys inside DataResource matcher", () => {
		const matcher = createSemanticMatcher({
			patches: createRulePatchSettings({
				id: "drive-bias-domain",
				label: "drive",
				proofTerms: ["Drive Legend"],
				xTerms: ["DriveBias"],
				yTerms: ["Drive_Bias", "Drive-Bias"],
			}).templateSemanticPatches,
		});
		const match = matcher.matchTitle("drive-bias");
		const proofMatch = matcher.matchTitle("Drive Legend");

		assert.equal(toSemanticTermKey("V_G_S"), "vgs");
		assert.equal(toSemanticTermKey("V-G-S"), "vgs");
		assert.equal(toSemanticTermKey("Drive-Bias"), "drivebias");
		assert.equal(match?.canonicalRole, "unknown");
		assert.equal(match?.axisTendency, "unknown");
		assert.ok(match?.reasons.includes("rules.term"));
		assert.ok(match?.semanticRules.some(rule => rule.axisTendency === "x"));
		assert.ok(match?.semanticRules.some(rule => rule.axisTendency === "dependent"));
		assert.equal(proofMatch?.axisTendency, "unknown");
		assert.ok(proofMatch?.semanticRules.some(rule =>
			rule.id === "drive-bias-domain" &&
			rule.axisTendency === "unknown"
		));
		assert.equal(matcher.matchTitle("drivebias")?.canonicalRole, "unknown");
		assert.equal(matcher.matchTitle("drive_bias")?.canonicalRole, "unknown");
	});

	test("keeps built-in rule matches when user rule terms compile to the same key", () => {
		const matcher = createSemanticMatcher({
			patches: createRulePatchSettings({
				id: "custom-vgs-domain",
				label: "custom",
				proofTerms: ["Custom Legend"],
				xTerms: ["DriveBias"],
				yTerms: ["V-G-S"],
			}).templateSemanticPatches,
		});
		const match = matcher.matchTitle("v_g_s");

		assert.equal(match?.canonicalRole, "unknown");
		assert.equal(match?.axisTendency, "unknown");
		assert.ok(match?.reasons.includes("rules.term"));
		assert.ok(match?.semanticRules.some(rule =>
			rule.id === "custom-vgs-domain" &&
			rule.axisTendency === "dependent"
		));
	});

	test("applies same-id user patches to built-in rule key links", () => {
		const builtinRule = builtinRules.find(rule => rule.label === "iv transfer");
		assert.ok(builtinRule);
		const builtinXTerm = builtinRule.xTerms[0];
		assert.ok(builtinXTerm);
		const matcher = createSemanticMatcher({
			patches: createRulePatchSettings({
				id: builtinRule.id,
				label: builtinRule.label,
				proofTerms: ["Override Legend"],
				xTerms: ["Override Gate"],
				yTerms: ["Override Current"],
			}, {
				xRemoveTerms: builtinRule.xTerms,
				yRemoveTerms: builtinRule.yTerms,
			}).templateSemanticPatches,
		});
		const builtinTermMatch = matcher.matchTitle(builtinXTerm);
		const overrideMatch = matcher.matchTitle("Override Gate");

		assert.equal(Boolean(builtinTermMatch?.semanticRules.some(rule => rule.id === builtinRule.id)), false);
		assert.equal(overrideMatch?.axisTendency, "x");
		assert.ok(overrideMatch?.semanticRules.some(rule =>
			rule.id === builtinRule.id &&
			rule.axisTendency === "x" &&
			rule.source === "builtin"
		));
	});

	test("ignores configured single-character template semantic term entries", async () => {
		const evidence = await resolveEvidence([
			["V", "I"],
			["0", "1e-12"],
			["0.5", "2e-12"],
			["1", "4e-12"],
		], {
			templateSemanticPatches: createRulePatchSettings({
				id: "single-domain",
				label: "single",
				proofTerms: ["Single Legend"],
				xTerms: ["V"],
				yTerms: ["I"],
			}).templateSemanticPatches,
		});

		assert.equal(isCustomSemanticMatchTermAllowed("V"), false);
		assert.equal(isCustomSemanticMatchTermAllowed("Id"), true);
		assert.ok(!evidence.columnTitleSpans.some(span =>
			(span.targetColumn === 0 || span.targetColumn === 1) &&
			span.semanticRules.some(rule => rule.id === "single-domain")
		));
	});

	test("uses Chinese template semantic term entries", async () => {
		assert.equal(toSemanticTermKey("栅 压"), "栅压");
		assert.equal(isCustomSemanticMatchTermAllowed("漏极电流"), true);
		assert.equal(isCustomSemanticMatchTermAllowed(";"), false);

		const evidence = await resolveEvidence([
			["栅压", "漏极电流"],
			["0", "1e-12"],
			["0.5", "2e-12"],
			["1", "4e-12"],
		], {
			templateSemanticPatches: createRulePatchSettings({
				id: "zh-domain",
				label: "中文领域",
				proofTerms: ["中文图例"],
				xTerms: ["栅压"],
				yTerms: ["漏极电流"],
			}).templateSemanticPatches,
		});

		assert.ok(evidence.columnTitleSpans.some(span =>
			span.targetColumn === 0 &&
			span.canonicalRole === "unknown" &&
			span.axisTendency === "x" &&
			span.semanticRules.some(rule => rule.id === "zh-domain" && rule.axisTendency === "x")
		));
		assert.ok(evidence.columnTitleSpans.some(span =>
			span.targetColumn === 1 &&
			span.canonicalRole === "unknown" &&
			span.axisTendency === "dependent" &&
			span.semanticRules.some(rule => rule.id === "zh-domain" && rule.axisTendency === "dependent")
		));
	});

	test("can disable built-in rules without deleting user rules", async () => {
		const builtinRule = builtinRules.find(rule => rule.label === "iv transfer");
		assert.ok(builtinRule);
		const evidence = await resolveEvidence([
			["Vg", "SenseCurrent"],
			["0", "1e-12"],
			["0.5", "2e-12"],
			["1", "4e-12"],
		], {
			templateSemanticPatches: {
				terms: createTermPatches(["Sense Legend", "DriveBias", "SenseCurrent"]),
				rules: [{
					id: builtinRule.id,
					enabled: false,
				}, {
					id: "sense-current",
					label: "sense",
					priority: 0,
					enabled: true,
					proofKeys: { addKeys: ["senselegend"], removeKeys: [] },
					xKeys: { addKeys: ["drivebias"], removeKeys: [] },
					yKeys: { addKeys: ["sensecurrent"], removeKeys: [] },
				}],
			},
		});

		assert.ok(!evidence.columnTitleSpans.some(span =>
			span.targetColumn === 0 &&
			span.semanticRules.some(rule => rule.id === builtinRule.id)
		));
		assert.ok(evidence.columnTitleSpans.some(span =>
			span.targetColumn === 1 &&
			span.canonicalRole === "unknown" &&
			span.semanticRules.some(rule => rule.id === "sense-current")
		));
	});

	test("detects first-row X/Y data blocks and bindings", async () => {
		const evidence = await resolveEvidence([
			["Vg", "Id"],
			["0", "1e-12"],
			["0.5", "2e-12"],
			["1", "4e-12"],
		]);

		const xRange = evidence.xRangeCandidates.find(candidate => candidate.column === 0);
		assert.ok(xRange);
		assert.equal(xRange.startRow, 1);
		assert.equal(xRange.endRow, 3);

		const block = evidence.dataBlockCandidates.find(candidate =>
			candidate.xColumn === 0 && candidate.dependentColumns.includes(1)
		);
		assert.ok(block);
		assert.equal(block.columnDirection, "rightPreferred");

		const binding = evidence.bindingCandidates.find(candidate =>
			candidate.dataBlockCandidateIds.includes(block.id)
		);
		assert.ok(binding);
		assert.equal(binding.relation, "oneX-oneY");
	});

	test("produces identical evidence from sparse native rows and full table rows", () => {
		const rows = [
			["Vg", "Id", "Ig"],
			["-1", "1e-12", "2e-13"],
			["0", "2e-9", "3e-13"],
			["1", "5e-6", "4e-13"],
		] as const;
		const fullContent = createTableContent(rows);
		const physicalAnalysis = createStructuredContentPhysicalAnalysisBuilder();
		for (const row of rows) {
			physicalAnalysis.appendRow(row);
		}
		const facts = physicalAnalysis.finish({
			columnCount: fullContent.columnCount,
			maxCellLengths: fullContent.maxCellLengths,
			rowCount: fullContent.rowCount,
		});
		const sparseContent: TableModelContentSnapshot = {
			columnCount: fullContent.columnCount,
			columnFacts: facts.columnFacts,
			contentFingerprint: facts.contentFingerprint,
			maxCellLengths: fullContent.maxCellLengths,
			rowCount: fullContent.rowCount,
			rows: [],
			rowWindows: [{
				startRowIndex: 0,
				rows: [rows[0], rows[1]],
			}],
			sparseRows: true,
		};
		const matcher = createSemanticMatcher();

		assert.deepStrictEqual(
			createStructuredContentEvidence(sparseContent, matcher),
			createStructuredContentEvidence(fullContent, matcher),
		);
	});

	test("uses numeric cells above shared-X dependent columns as legends", async () => {
		const evidence = await resolveEvidence([
			["Vg/Vbg", "-2", "-1", "0", "1", "2"],
			["-0.5", "6.99798e-25", "9.17778e-24", "1.20448e-22", "1.5787e-21", "2.06466e-20"],
			["-0.49", "1.02071e-24", "1.32659e-23", "1.72784e-22", "2.26435e-21", "2.96144e-20"],
			["-0.48", "1.78185e-24", "1.9823e-23", "2.47955e-22", "3.24689e-21", "4.24753e-20"],
			["-0.47", "2.29694e-24", "2.70037e-23", "3.55605e-22", "4.65956e-21", "6.09296e-20"],
		]);

		const block = evidence.blocks.find(candidate =>
			candidate.columns.columns.some(column => column.headerText === "Vg/Vbg") &&
			candidate.columns.columns.some(column => column.headerText === "-2")
		);
		assert.ok(block);
		assert.deepEqual(
			block.columns.columns.map(column => column.headerText),
			["Vg/Vbg", "-2", "-1", "0", "1", "2"],
		);
		assert.equal(block.source.headerRange?.startRow, 0);
		assert.equal(block.family, "iv");
		assert.equal(block.ivMode, "transfer");
		assert.ok(evidence.bindingCandidates.some(candidate =>
			candidate.relation === "oneX-manyY" &&
			candidate.dataBlockCandidateIds.includes(block.id)
		));
	});

	test("uses X evidence for headerless numeric data", async () => {
		const evidence = await resolveEvidence([
			["0", "1e-12"],
			["0.5", "2e-12"],
			["1", "4e-12"],
			["1.5", "8e-12"],
		]);

		assert.ok(evidence.xRangeCandidates.some(candidate =>
			candidate.column === 0 && candidate.startRow === 0 && candidate.endRow === 3
		));
		assert.ok(evidence.dataBlockCandidates.some(candidate =>
			candidate.xColumn === 0 &&
			candidate.dependentColumns.includes(1) &&
			candidate.columnDirection === "rightPreferred"
		));
		assert.ok(evidence.bindingCandidates.length > 0);
	});

	test("uses B1500 DataName/DataValue title rows as IV column evidence", async () => {
		const evidence = await resolveEvidence([
			["Device", "N1", "N1"],
			["DataName", "Vg", "Id"],
			["DataValue", "0", "1e-12"],
			["DataValue", "0.5", "2e-12"],
			["DataValue", "1", "4e-12"],
		]);

		assert.ok(evidence.columnTitleSpans.some(span =>
				span.targetColumn === 1 &&
				span.titleCell.row === 1 &&
				span.canonicalRole === "unknown" &&
				span.axisTendency === "x" &&
				span.semanticRules.some(rule => rule.type === "transfer")
			));
		assert.ok(evidence.dataBlockCandidates.some(candidate =>
			candidate.xColumn === 1 && candidate.dependentColumns.includes(2)
		));
	});

	test("keeps B1500 metadata numeric rows from competing with repeated DataName blocks", async () => {
		const rows = [
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
		];
		const evidence = await resolveEvidence(rows);

		assert.ok(evidence.xRangeCandidates.some(candidate => rows[candidate.startRow]?.[0] === "AnalysisSetup"));
		assert.ok(evidence.dataBlockCandidates.every(candidate => rows[candidate.startRow]?.[0] === "DataValue"));
		const repeatedBinding = evidence.bindingCandidates.find(candidate =>
			candidate.relation === "repeatedBlocks" &&
			candidate.dataBlockCandidateIds.length === 2
		);
		assert.ok(repeatedBinding);
		assert.equal(repeatedBinding.confidence, 1);
		assert.ok(repeatedBinding.reasons.includes("binding.repeatedBlocks.explicitDataRows"));
		const repeatedBlocks = repeatedBinding.dataBlockCandidateIds
			.map(blockId => evidence.blocks.find(block => block.id === blockId));
		assert.deepEqual(repeatedBlocks.map(block => block?.ivMode), ["transfer", "transfer"]);
	});

	test("uses DataName rows as boundary evidence after numeric-core block detection", async () => {
		const evidence = await resolveEvidence([
			["Setup", "Start", "Stop"],
			["Setup", "0", "100"],
			["Setup", "1", "200"],
			["DataName", "Vg", "Id"],
			["DataValue", "-1", "1e-12"],
			["DataValue", "0", "2e-12"],
			["DataValue", "1", "4e-12"],
		]);

		assert.ok(evidence.xRangeCandidates.some(candidate => candidate.startRow === 1));
		assert.equal(evidence.dataBlockCandidates.some(candidate => candidate.startRow === 1), false);
		const block = evidence.dataBlockCandidates.find(candidate =>
			candidate.startRow === 4 &&
			candidate.endRow === 6 &&
			candidate.startCol === 1 &&
			candidate.endCol === 2
		);
		assert.ok(block);
		assert.ok(block.reasons.includes("dataBlock.explicitDataRows"));
		assert.deepEqual(evidence.structure.dataRegions.map(region => region.range), [{
			startRow: 4,
			endRow: 6,
			startCol: 1,
			endCol: 2,
		}]);
	});

	test("does not create data range from DataName/DataValue markers without numeric-core binding", async () => {
		const evidence = await resolveEvidence([
			["DataName", "Vg", "Id"],
			["DataValue", "not numeric", ""],
			["DataValue", "", "also text"],
		]);

		assert.equal(evidence.xRangeCandidates.length, 0);
		assert.equal(evidence.dataBlockCandidates.length, 0);
		assert.equal(evidence.bindingCandidates.length, 0);
		assert.equal(evidence.structure.dataRegions.length, 0);
	});

	test("uses the direct Vg/Id pair before auxiliary dependent headers", async () => {
		const evidence = await resolveEvidence([
			["DataName", "Vg", "Id", "gm"],
			["DataValue", "-5", "1e-12", "2e-12"],
			["DataValue", "-4.875", "2e-12", "3e-12"],
			["DataValue", "-4.75", "3e-12", "4e-12"],
		], {
			templateSemanticPatches: {
				terms: [],
				rules: [
					{ id: "iv:1", priority: 5 },
					{ id: "cv:1", priority: 0 },
				],
			} satisfies TemplateSemanticPatches,
		});

		const block = evidence.blocks.find(candidate =>
			candidate.source.dataRange?.startCol === 1 &&
			candidate.source.dataRange?.endCol === 3
		);
		assert.equal(block?.ivMode, "transfer");
	});

	test("records four-neighbor info cell evidence as auxiliary title context", async () => {
		const evidence = await resolveEvidence([
			["FastIV", "point", "interval"],
			["DataName", "Time", "Vp"],
			["DataValue", "0", "0"],
			["DataValue", "1", "0.5"],
			["DataValue", "2", "1"],
		]);

		const timeNeighborhood = evidence.infoCellNeighborhoods.find(neighborhood =>
			neighborhood.targetColumn === 1 &&
			neighborhood.intentCandidates.some(candidate => candidate.intent === "rawTransient")
		);
		assert.ok(timeNeighborhood);
		assert.ok(timeNeighborhood.neighbors.some(neighbor => neighbor.direction === "up" && neighbor.text === "point"));
		assert.ok(evidence.columnTitleSpans.some(span => span.targetColumn === 1));
	});

	test("uses rule priority when several X ranges are legal", async () => {
		const rows = [
			["FastIV", "interval", ""],
			["DataName", "Time", "Vp", "Ipt"],
			["DataValue", "0", "0", "1e-12"],
			["DataValue", "1", "0.5", "2e-12"],
			["DataValue", "2", "1", "3e-12"],
		];
		const evidence = await resolveEvidence(rows);

		assert.equal(evidence.xRangeCandidates[0]?.column, 1);
			assert.ok(evidence.columnTitleSpans.some(span =>
				span.targetColumn === 1 &&
				span.semanticRules.some(rule => rule.type === "transient" && rule.axisTendency === "x")
			));
	});

	test("promotes pairwise XY blocks with identical X values to shared X bindings", async () => {
		const evidence = await resolveEvidence([
			[
				"drain TotalCurrent(IdVg_n938_des) X",
				"drain TotalCurrent(IdVg_n938_des) Y",
				"drain TotalCurrent(IdVd_n938_des) X",
				"drain TotalCurrent(IdVd_n938_des) Y",
			],
			["0", "1e-12", "0", "1e-11"],
			["0.5", "2e-12", "0.5", "2e-11"],
			["1", "4e-12", "1", "4e-11"],
		]);

		assert.ok(evidence.dataBlockCandidates.some(candidate =>
			candidate.xColumn === 0 && candidate.dependentColumns.length === 1
		));
		assert.ok(evidence.dataBlockCandidates.some(candidate =>
			candidate.xColumn === 2 && candidate.dependentColumns.length === 1
		));
		assert.ok(evidence.dataBlockCandidates.some(candidate =>
			candidate.xColumn === 0 &&
			candidate.dependentColumns.join(",") === "1,3" &&
			candidate.reasons.includes("dataBlock.sharedIdenticalXValues")
		));
		assert.equal(evidence.bindingCandidates.some(candidate => candidate.relation === "manyXYpairs"), false);
		assert.ok(evidence.bindingCandidates.some(candidate => candidate.relation === "oneX-manyY"));
	});

	test("keeps pairwise XY blocks separate when similar headers have different X values", async () => {
		const evidence = await resolveEvidence([
			[
				"c(g:g)(CV_n256_ac_des) X",
				"c(g:g)(CV_n256_ac_des) Y",
				"c(g:g)(CV_n350_ac_des) X",
				"c(g:g)(CV_n350_ac_des) Y",
			],
			["-0.5", "9.84e-16", "-0.45", "9.87e-16"],
			["0", "1.00e-15", "0.05", "1.01e-15"],
			["0.5", "1.20e-15", "0.55", "1.21e-15"],
			["1", "1.60e-15", "1.05", "1.61e-15"],
		]);

		assert.equal(evidence.dataBlockCandidates.some(candidate =>
			candidate.xColumn === 0 &&
			candidate.dependentColumns.join(",") === "1,3" &&
			candidate.reasons.includes("dataBlock.sharedIdenticalXValues")
		), false);
		assert.ok(evidence.bindingCandidates.some(candidate => candidate.relation === "manyXYpairs"));
	});

	test("classifies repeated IdVg XY headers as IV transfer", async () => {
		const evidence = await resolveEvidence([
			[
				"drain TotalCurrent(IdVg_n938_des) X",
				"drain TotalCurrent(IdVg_n938_des) Y",
				"drain TotalCurrent(IdVg_n944_des) X",
				"drain TotalCurrent(IdVg_n944_des) Y",
			],
			["-0.5", "2e-23", "-0.5", "2e-22"],
			["-0.49", "3e-23", "-0.49", "3e-22"],
			["-0.48", "4e-23", "-0.48", "4e-22"],
			["-0.47", "6e-23", "-0.47", "6e-22"],
		]);

		const sharedBlock = evidence.dataBlockCandidates.find(candidate =>
			candidate.xColumn === 0 &&
			candidate.dependentColumns.join(",") === "1,3" &&
			candidate.reasons.includes("dataBlock.sharedIdenticalXValues")
		);
		assert.ok(sharedBlock);
		const measurementBlock = evidence.blocks.find(block => block.id === sharedBlock.id);
		assert.equal(measurementBlock?.family, "iv");
		assert.equal(measurementBlock?.ivMode, "transfer");
		assert.deepEqual(
			measurementBlock?.columns.columns.map(column => column.headerText),
			[
				"drain TotalCurrent(IdVg_n938_des) X",
				"drain TotalCurrent(IdVg_n938_des)",
				"drain TotalCurrent(IdVg_n944_des)",
			],
		);
	});

	test("extracts common CV expression from repeated pairwise XY headers", async () => {
		const evidence = await resolveEvidence([
			[
				"c(g:g)(CV_n256_ac_des) X",
				"c(g:g)(CV_n256_ac_des) Y",
				"c(g:g)(CV_n350_ac_des) X",
				"c(g:g)(CV_n350_ac_des) Y",
			],
			["-0.5", "9.84e-16", "-0.5", "9.87e-16"],
			["0", "1.00e-15", "0", "1.01e-15"],
			["0.5", "1.20e-15", "0.5", "1.21e-15"],
			["1", "1.60e-15", "1", "1.61e-15"],
		]);

		const spansByColumn = new Map(evidence.columnTitleSpans.map(span => [span.targetColumn, span]));
		assert.equal(spansByColumn.get(0)?.normalizedTitle, "cgg");
		assert.equal(spansByColumn.get(0)?.axisTendency, "x");
		assert.equal(spansByColumn.get(0)?.reasons.includes("title.repeatedXYPair.commonSemantic"), true);
		assert.equal(spansByColumn.get(1)?.normalizedTitle, "cgg");
		assert.equal(spansByColumn.get(1)?.axisTendency, "dependent");
		assert.equal(spansByColumn.get(1)?.semanticRules.some(rule =>
			rule.type === "cv" &&
			rule.axisTendency === "dependent"
		), true);
		const sharedBlock = evidence.dataBlockCandidates.find(candidate =>
			candidate.xColumn === 0 &&
			candidate.dependentColumns.join(",") === "1,3" &&
			candidate.reasons.includes("dataBlock.sharedIdenticalXValues")
		);
		assert.ok(sharedBlock);
		assert.ok(evidence.bindingCandidates.some(candidate =>
			candidate.relation === "oneX-manyY" &&
			candidate.dataBlockCandidateIds.includes(sharedBlock.id)
		));
		assert.equal(evidence.bindingCandidates.some(candidate => candidate.relation === "manyXYpairs"), false);
		assert.equal(evidence.blocks.find(block => block.id === sharedBlock.id)?.family, "cv");
		assert.deepEqual(
			evidence.blocks.find(block => block.id === sharedBlock.id)?.columns.columns.map(column => column.headerText),
			[
				"c(g:g)(CV_n256_ac_des) X",
				"c(g:g)(CV_n256_ac_des)",
				"c(g:g)(CV_n350_ac_des)",
			],
		);
	});

	test("uses repeated XY parenthesized semantic tokens as measurement evidence", async () => {
		const evidence = await resolveEvidence([
			[
				"metric(CV_n256_ac_des) X",
				"metric(CV_n256_ac_des) Y",
				"metric(CV_n350_ac_des) X",
				"metric(CV_n350_ac_des) Y",
			],
			["-0.5", "9.84e-16", "-0.5", "9.87e-16"],
			["0", "1.00e-15", "0", "1.01e-15"],
			["0.5", "1.20e-15", "0.5", "1.21e-15"],
			["1", "1.60e-15", "1", "1.61e-15"],
		]);

		const sharedBlock = evidence.dataBlockCandidates.find(candidate =>
			candidate.xColumn === 0 &&
			candidate.dependentColumns.join(",") === "1,3" &&
			candidate.reasons.includes("dataBlock.sharedIdenticalXValues")
		);
		assert.ok(sharedBlock);
		const measurementBlock = evidence.blocks.find(block => block.id === sharedBlock.id);
		assert.equal(measurementBlock?.family, "cv");
		assert.deepEqual(
			measurementBlock?.columns.columns.map(column => column.headerText),
			[
				"metric(CV_n256_ac_des) X",
				"metric(CV_n256_ac_des)",
				"metric(CV_n350_ac_des)",
			],
		);
	});

	test("detects aligned repeated data blocks", async () => {
		const evidence = await resolveEvidence([
			["CH1 Voltage", "CH1 Current", "CH1 Resistance", "", "CH1 Voltage", "CH1 Current", "CH1 Resistance"],
			["0", "1e-12", "100", "", "0", "1e-11", "200"],
			["0.5", "2e-12", "110", "", "0.5", "2e-11", "210"],
			["1", "4e-12", "120", "", "1", "4e-11", "220"],
		]);

		const repeated = evidence.bindingCandidates.find(candidate => candidate.relation === "repeatedBlocks");
		assert.ok(repeated);
		assert.equal(repeated.dataBlockCandidateIds.length, 2);
		assert.ok(repeated.reasons.includes("binding.repeatedBlocks"));
	});

	test("splits monotonic X groups for reset and hysteresis sweeps", async () => {
		const evidence = await resolveEvidence([
			["Vg", "Id"],
			["0", "1"],
			["0.5", "2"],
			["1", "3"],
			["0", "4"],
			["0.5", "5"],
			["1", "6"],
		]);

		const xRange = evidence.xRangeCandidates.find(candidate => candidate.column === 0);
		assert.ok(xRange);
		const groups = evidence.xGroupCandidates.filter(group => group.xRangeCandidateId === xRange.id);
		assert.equal(groups.length, 2);
		assert.ok(groups.every(group => group.groupKind === "reset"));
	});

	test("treats blank columns as data block separators", async () => {
		const evidence = await resolveEvidence([
			["Vg", "Id", "", "Vd", "Id"],
			["0", "1", "", "0", "10"],
			["0.5", "2", "", "0.5", "20"],
			["1", "3", "", "1", "30"],
		]);

		assert.ok(evidence.dataBlockCandidates.some(candidate =>
			candidate.xColumn === 0 &&
			candidate.dependentColumns.includes(1) &&
			candidate.separatorColumns.includes(2)
		));
		assert.ok(evidence.dataBlockCandidates.some(candidate =>
			candidate.xColumn === 3 && candidate.dependentColumns.includes(4)
		));
	});

	test("runs block-internal binding inside FET physical block segments", async () => {
		const evidence = await resolveEvidence([
			["1-HS", "Index", "Vd (V)", "Id (A)", "Vg (V)", "Ig (A)", "", "", "", "Index", "Vd (V)", "Id (A)", "Vg (V)", "Ig (A)"],
			["", "1", "3", "1e-10", "60", "4e-10", "", "", "", "1", "5", "2e-10", "60", "3e-10"],
			["", "2", "2.97", "2e-10", "60", "3e-10", "", "", "", "2", "4.95", "3e-10", "60", "2e-10"],
			["", "3", "2.94", "3e-10", "60", "2e-10", "", "", "", "3", "4.9", "4e-10", "60", "1e-10"],
		]);

		assert.deepEqual(evidence.structure.blockRegions.map(region => region.range), [
			{ startRow: 0, endRow: 3, startCol: 0, endCol: 5 },
			{ startRow: 0, endRow: 3, startCol: 9, endCol: 13 },
		]);
		assert.equal(evidence.dataBlockCandidates.some(candidate =>
			candidate.xColumn === 1 || candidate.xColumn === 9
		), false);
		assert.ok(evidence.dataBlockCandidates.every(candidate =>
			(candidate.startCol >= 1 && candidate.endCol <= 5) ||
			(candidate.startCol >= 9 && candidate.endCol <= 13)
		));
	});

	test("keeps left-side dependent values lower confidence but available", async () => {
		const evidence = await resolveEvidence([
			["Id", "Vg"],
			["1", "0"],
			["2", "0.5"],
			["3", "1"],
		]);

		assert.ok(evidence.dataBlockCandidates.some(candidate =>
			candidate.xColumn === 1 &&
			candidate.dependentColumns.includes(0) &&
			candidate.columnDirection === "leftObserved"
		));
	});

	test("does not auto-bind dirty mixed data without titles or X evidence", async () => {
		const evidence = await resolveEvidence([
			["marker", "alpha", "beta"],
			["A", "0", "bad"],
			["B", "missing", "1"],
			["C", "2", "also-bad"],
		]);

		assert.equal(evidence.xRangeCandidates.length, 0);
		assert.equal(evidence.dataBlockCandidates.length, 0);
		assert.equal(evidence.bindingCandidates.length, 0);
		assert.ok(evidence.diagnostics.some(diagnostic => diagnostic.code === "dataResource.noNumericRuns"));
	});

	test("reuses the semantic matcher until semantic settings change", async () => {
		const resource = URI.file("/workspace/matcher-cache.csv");
		const settingsChangeEmitter = store.add(new Emitter<void>());
		let settingsReadCount = 0;
		const settingsService = {
			onDidChangeConductorSettings: settingsChangeEmitter.event,
			getConductorSettings: () => {
				settingsReadCount += 1;
				return null;
			},
		} as unknown as ISettingsService;
		const tableModelService = store.add(new TestTableModelService(
			resource,
			createTableContent([
				["Vg", "Id"],
				["0", "1"],
				["1", "2"],
			]),
		));
		const service = store.add(new DataResourceService(
			store.add(new TestDataResourceContentService(tableModelService)),
			settingsService,
			testStructuredContentEvidenceService,
		));

		const first = await service.resolveStructuredContent({ resource });
		first.dispose();
		const second = await service.resolveStructuredContent({ resource });
		second.dispose();
		assert.equal(settingsReadCount, 1);

		settingsChangeEmitter.fire();
		assert.equal(settingsReadCount, 2);
		const afterSettingsChange = await service.resolveStructuredContent({ resource });
		afterSettingsChange.dispose();
		assert.equal(settingsReadCount, 2);
	});

	test("restarts evidence production when semantic settings change in flight", async () => {
		const resource = URI.file("/workspace/stale-evidence.csv");
		const settingsChangeEmitter = store.add(new Emitter<void>());
		let conductorSettings: Record<string, unknown> | null = null;
		const settingsService = {
			onDidChangeConductorSettings: settingsChangeEmitter.event,
			getConductorSettings: () => conductorSettings,
		} as unknown as ISettingsService;
		const tableModelService = store.add(new TestTableModelService(
			resource,
			createTableContent([
				["Vg", "Id"],
				["0", "1"],
				["1", "2"],
			]),
		));
		const evidenceService = new ControlledStructuredContentEvidenceService();
		const service = store.add(new DataResourceService(
			store.add(new TestDataResourceContentService(tableModelService)),
			settingsService,
			evidenceService,
		));

		const resolvingReference = service.resolveStructuredContent({ resource });
		await waitFor(() => evidenceService.requestCount === 1);
		conductorSettings = createRulePatchSettings({
			id: "user:stale-evidence",
			label: "Stale Evidence",
			proofTerms: ["Stale Evidence"],
			xTerms: ["Vg"],
			yTerms: ["Id"],
		});
		settingsChangeEmitter.fire();
		await evidenceService.resolveNext();
		await waitFor(() => evidenceService.requestCount === 2);
		await evidenceService.resolveNext();

		const reference = await resolvingReference;
		assert.equal(reference.object.kind, "ready");
		if (reference.object.kind === "ready") {
			assert.equal(evidenceService.resolvedFingerprints.length, 2);
			assert.equal(
				reference.object.snapshot.structuredContent.semanticRulesFingerprint,
				evidenceService.resolvedFingerprints[1],
			);
			assert.notEqual(
				evidenceService.resolvedFingerprints[0],
				evidenceService.resolvedFingerprints[1],
			);
		}
		reference.dispose();
	});

	test("restarts evidence production when physical content changes in flight", async () => {
		const resource = URI.file("/workspace/stale-content.csv");
		const settingsService = {
			onDidChangeConductorSettings: Event.None,
			getConductorSettings: () => null,
		} as unknown as ISettingsService;
		const tableModelService = store.add(new ReResolvingTableModelService(
			resource,
			createTableContent([
				["Vg", "Id"],
				["0", "1"],
				["1", "2"],
			]),
		));
		const evidenceService = new ControlledStructuredContentEvidenceService();
		const service = store.add(new DataResourceService(
			store.add(new TestDataResourceContentService(tableModelService)),
			settingsService,
			evidenceService,
		));

		const resolvingReference = service.resolveStructuredContent({ resource });
		await waitFor(() => evidenceService.requestCount === 1);
		await tableModelService.resolveWith(createTableContent([
			["Vg", "Id"],
			["0", "7"],
			["1", "8"],
		]), 2);
		await evidenceService.resolveNext();
		await waitFor(() => evidenceService.requestCount === 2);
		await evidenceService.resolveNext();

		const reference = await resolvingReference;
		assert.equal(reference.object.kind, "ready");
		if (reference.object.kind === "ready") {
			assert.deepStrictEqual(reference.object.snapshot.content.rows, [
				["Vg", "Id"],
				["0", "7"],
				["1", "8"],
			]);
			assert.equal(reference.object.snapshot.sourceVersion, 2);
		}
		reference.dispose();
	});

	test("does not publish resource changes when stable table content is unchanged", async () => {
		const resource = URI.file("/workspace/reopened.csv");
		const settingsService = {
			onDidChangeConductorSettings: Event.None,
			getConductorSettings: () => null,
		} as unknown as ISettingsService;
		const tableModelService = store.add(new ReResolvingTableModelService(
			resource,
			createTableContent([
				["Vg", "Id"],
				["0", "1"],
				["1", "2"],
			]),
		));
		const service = store.add(new DataResourceService(
			store.add(new TestDataResourceContentService(tableModelService)),
			settingsService,
			testStructuredContentEvidenceService,
		));
		const changedResources: URI[] = [];
		store.add(service.onDidChangeResource(changedResource => {
			changedResources.push(changedResource);
		}));

		const reference = await service.resolveStructuredContent({ resource });
		reference.dispose();
		assert.equal(changedResources.length, 0);

		await tableModelService.resolveWith(createTableContent([
			["Vg", "Id"],
			["0", "1"],
			["1", "2"],
		]), 1);
		assert.equal(changedResources.length, 0);

		await tableModelService.resolveWith(createTableContent([
			["Vg", "Id"],
			["0", "1"],
			["2", "3"],
		]), 2);
		assert.deepEqual(changedResources.map(changedResource => changedResource.toString()), [resource.toString()]);
	});

	test("settles fallback structured-evidence callers promptly when cancelled", async () => {
		const resource = URI.file("/workspace/cancelled.csv");
		const tableModelService = store.add(new BlockingTableModelService(resource));
		const service = store.add(new DataResourceService(
			store.add(new TestDataResourceContentService(tableModelService)),
			{
				onDidChangeConductorSettings: Event.None,
				getConductorSettings: () => null,
			} as unknown as ISettingsService,
			testStructuredContentEvidenceService,
		));
		const cancellation = store.add(new CancellationTokenSource());

		const resolving = service.resolveStructuredEvidence({ resource }, cancellation.token);
		await Promise.resolve();
		cancellation.cancel();

		await assert.rejects(resolving, error => isCancellationError(error));
	});

	test("estimates physical content memory by table format", () => {
		const mebibyte = 1024 * 1024;

		assert.deepStrictEqual({
			csvFloor: estimateDataResourceContentMemoryBytes(1, "csv"),
			csvScaled: estimateDataResourceContentMemoryBytes(10 * mebibyte, "csv"),
			xlsFloor: estimateDataResourceContentMemoryBytes(1, "xls"),
			xlsxFloor: estimateDataResourceContentMemoryBytes(1, "xlsx"),
			xlsxScaled: estimateDataResourceContentMemoryBytes(10 * mebibyte, "xlsx"),
		}, {
			csvFloor: 16 * mebibyte,
			csvScaled: 60 * mebibyte,
			xlsFloor: 32 * mebibyte,
			xlsxFloor: 64 * mebibyte,
			xlsxScaled: 200 * mebibyte,
		});
	});

	test("calibrates format estimates from isolated observed memory growth", () => {
		const mebibyte = 1024 * 1024;
		const estimator = new DataResourceContentMemoryEstimator();
		const fileSize = 10 * mebibyte;

		estimator.observe(
			"csv",
			fileSize,
			{ processPrivateBytes: 100 * mebibyte },
			{ processPrivateBytes: 200 * mebibyte },
		);

		assert.equal(
			Math.round(estimator.estimate(fileSize, "csv") / mebibyte),
			68,
		);
	});

	test("admits every request immediately when memory metrics are unavailable", async () => {
		const gate = store.add(new DataResourceContentMemoryGate({
			retryDelayMs: 0,
			sample: () => ({}),
		}));
		const leases = await Promise.all(Array.from({ length: 64 }, () =>
			gate.acquire(64 * 1024 * 1024)
		));

		assert.deepStrictEqual(gate.getSnapshot(), {
			activeEstimatedBytes: 64 * 64 * 1024 * 1024,
			activeLeaseCount: 64,
			pressure: "green",
			queuedCount: 0,
		});
		for (const lease of leases) {
			lease.dispose();
		}
	});

	test("admits all projected work at once while measured capacity is healthy", async () => {
		const mebibyte = 1024 * 1024;
		const gate = store.add(new DataResourceContentMemoryGate({
			sample: () => ({
				heapLimitBytes: 4 * 1024 * mebibyte,
				heapUsedBytes: 512 * mebibyte,
				processPrivateBytes: 1024 * mebibyte,
				systemFreeBytes: 8 * 1024 * mebibyte,
				systemTotalBytes: 16 * 1024 * mebibyte,
			}),
		}));
		const leases = await Promise.all(Array.from({ length: 64 }, () =>
			gate.acquire(16 * mebibyte)
		));

		assert.deepStrictEqual(gate.getSnapshot(), {
			activeEstimatedBytes: 1024 * mebibyte,
			activeLeaseCount: 64,
			pressure: "green",
			queuedCount: 0,
		});
		for (const lease of leases) {
			lease.dispose();
		}
	});

	test("queues only when projected work exceeds current memory capacity", async () => {
		const mebibyte = 1024 * 1024;
		const gate = store.add(new DataResourceContentMemoryGate({
			retryDelayMs: 0,
			sample: () => ({
				heapLimitBytes: 100 * mebibyte,
				heapUsedBytes: 60 * mebibyte,
				systemFreeBytes: 2 * 1024 * mebibyte,
				systemTotalBytes: 4 * 1024 * mebibyte,
			}),
		}));

		const firstLease = await gate.acquire(20 * mebibyte);
		const secondLeasePromise = gate.acquire(20 * mebibyte);
		await waitFor(() => gate.getSnapshot().queuedCount === 1);

		assert.deepStrictEqual(gate.getSnapshot(), {
			activeEstimatedBytes: 20 * mebibyte,
			activeLeaseCount: 1,
			pressure: "green",
			queuedCount: 1,
		});

		firstLease.dispose();
		const secondLease = await secondLeasePromise;
		assert.equal(gate.getSnapshot().activeLeaseCount, 1);
		secondLease.dispose();
	});

	test("runs one task exclusively under red pressure and recovers with hysteresis", async () => {
		const mebibyte = 1024 * 1024;
		let heapUsedBytes = 85 * mebibyte;
		const gate = store.add(new DataResourceContentMemoryGate({
			retryDelayMs: 0,
			sample: () => ({
				heapLimitBytes: 100 * mebibyte,
				heapUsedBytes,
				systemFreeBytes: 2 * 1024 * mebibyte,
				systemTotalBytes: 4 * 1024 * mebibyte,
			}),
		}));

		const firstLease = await gate.acquire(10 * mebibyte);
		const secondLeasePromise = gate.acquire(10 * mebibyte);
		await waitFor(() => gate.getSnapshot().queuedCount === 1);
		assert.equal(gate.getSnapshot().pressure, "red");

		heapUsedBytes = 60 * mebibyte;
		firstLease.dispose();
		const secondLease = await secondLeasePromise;
		secondLease.dispose();
		const thirdLease = await gate.acquire(10 * mebibyte);
		assert.equal(gate.getSnapshot().pressure, "green");
		thirdLease.dispose();
	});

	test("pauses hard-critical work until memory pressure recovers", async () => {
		const mebibyte = 1024 * 1024;
		let heapUsedBytes = 95 * mebibyte;
		const gate = store.add(new DataResourceContentMemoryGate({
			retryDelayMs: 0,
			sample: () => ({
				heapLimitBytes: 100 * mebibyte,
				heapUsedBytes,
				systemFreeBytes: 2 * 1024 * mebibyte,
				systemTotalBytes: 4 * 1024 * mebibyte,
			}),
		}));

		const leasePromise = gate.acquire(10 * mebibyte);
		await waitFor(() => gate.getSnapshot().queuedCount === 1);
		assert.equal(gate.getSnapshot().activeLeaseCount, 0);

		heapUsedBytes = 60 * mebibyte;
		const lease = await leasePromise;
		assert.equal(gate.getSnapshot().pressure, "red");
		lease.dispose();
		const recoveredLease = await gate.acquire(10 * mebibyte);
		assert.equal(gate.getSnapshot().pressure, "green");
		recoveredLease.dispose();
	});

	test("rejects a task that cannot fit even when running alone", async () => {
		const mebibyte = 1024 * 1024;
		const gate = store.add(new DataResourceContentMemoryGate({
			sample: () => ({
				heapLimitBytes: 100 * mebibyte,
				heapUsedBytes: 10 * mebibyte,
			}),
		}));

		await assert.rejects(
			() => gate.acquire(90 * mebibyte),
			/exceeding the current safe capacity of 85 MiB/,
		);
	});
});

class TestTableModelService extends Disposable implements ITableModelService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeModelEmitter = this._register(new Emitter<ITableModel>());
	public readonly onDidChangeModel = this.onDidChangeModelEmitter.event;
	private readonly model: TableContentModel;

	public constructor(
		private readonly resource: URI,
		private readonly content: TableModelContentSnapshot,
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

		const sheetId = String(source?.sheetId ?? "table-a");
		await this.model.resolve({
			resolveContent: async () => ({
				content: this.content,
				diagnostics: [],
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

class BlockingTableModelService extends Disposable implements ITableModelService {
	public declare readonly _serviceBrand: undefined;

	public readonly onDidChangeModel = Event.None as ITableModelService["onDidChangeModel"];

	public constructor(
		private readonly resource: URI,
	) {
		super();
	}

	public canHandleResource(resource: URI): boolean {
		return resource.toString() === this.resource.toString();
	}

	public createModelReference(): Promise<ITableModelReference> {
		return new Promise(() => undefined);
	}

	public get(): ITableModel | undefined {
		return undefined;
	}

	public resolve(): void {}
}

class ReResolvingTableModelService extends Disposable implements ITableModelService {
	public declare readonly _serviceBrand: undefined;

	private readonly onDidChangeModelEmitter = this._register(new Emitter<ITableModel>());
	public readonly onDidChangeModel = this.onDidChangeModelEmitter.event;
	private readonly model: TableContentModel;
	private content: TableModelContentSnapshot;
	private sourceVersion = 1;

	public constructor(
		private readonly resource: URI,
		content: TableModelContentSnapshot,
	) {
		super();
		this.content = content;
		this.model = this._register(new TableContentModel(resource));
		this._register(this.model.onDidChange(model => {
			this.onDidChangeModelEmitter.fire(model);
		}));
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

		if (this.model.getSnapshot().loadState.state !== "ready") {
			await this.resolveModel(source);
		}
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

	public async resolveWith(content: TableModelContentSnapshot, sourceVersion: number): Promise<void> {
		this.content = content;
		this.sourceVersion = sourceVersion;
		await this.resolveModel();
	}

	private async resolveModel(source?: TableSource | null): Promise<void> {
		const sheetId = String(source?.sheetId ?? "table-a");
		await this.model.resolve({
			resolveContent: async () => ({
				content: this.content,
				diagnostics: [],
				format: "csv",
				resource: this.resource,
				sheets: [{
					content: this.content,
					sheetId,
					sheetName: null,
				}],
				sourceVersion: this.sourceVersion,
			}),
		});
	}
}

class ControlledStructuredContentEvidenceService implements IStructuredContentEvidenceService {
	public declare readonly _serviceBrand: undefined;
	public readonly resolvedFingerprints: string[] = [];
	private readonly requests: Array<{
		readonly content: TableModelContentSnapshot;
		readonly patches: TemplateSemanticPatches;
		readonly resolve: (evidence: StructuredContentEvidence) => void;
	}> = [];

	public get requestCount(): number {
		return this.requests.length + this.resolvedFingerprints.length;
	}

	public create(
		content: TableModelContentSnapshot,
		patches: TemplateSemanticPatches,
	): Promise<StructuredContentEvidence> {
		return new Promise(resolve => {
			this.requests.push({ content, patches, resolve });
		});
	}

	public async resolveNext(): Promise<void> {
		const request = this.requests.shift();
		assert.ok(request, "Expected a pending structured-content evidence request.");
		const evidence = await testStructuredContentEvidenceService.create(
			request.content,
			request.patches,
		);
		this.resolvedFingerprints.push(evidence.semanticRulesFingerprint);
		request.resolve(evidence);
	}

	public dispose(): void {}
}

const createTableContent = (
	rows: readonly (readonly string[])[],
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

const waitFor = async (condition: () => boolean): Promise<void> => {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (condition()) {
			return;
		}
		await new Promise<void>(resolve => globalThis.setTimeout(resolve, 0));
	}
	throw new Error("Timed out waiting for the DataResource test condition.");
};

const createRulePatchSettings = (
	rule: {
			readonly id: string;
			readonly label: string;
			readonly type?: string;
			readonly proofTerms: readonly string[];
			readonly xTerms: readonly string[];
			readonly yTerms: readonly string[];
	},
	options: {
		readonly xRemoveTerms?: readonly string[];
		readonly yRemoveTerms?: readonly string[];
	} = {},
	): { readonly templateSemanticPatches: TemplateSemanticPatches } => ({
	templateSemanticPatches: {
		terms: createTermPatches([...rule.proofTerms, ...rule.xTerms, ...rule.yTerms]),
		rules: [{
				id: rule.id,
				label: rule.label,
				priority: 0,
				...(rule.type ? { type: rule.type } : {}),
				enabled: true,
			proofKeys: {
				addKeys: rule.proofTerms.map(toSemanticTermKey).filter(Boolean),
				removeKeys: [],
			},
			xKeys: {
				addKeys: rule.xTerms.map(toSemanticTermKey).filter(Boolean),
				removeKeys: (options.xRemoveTerms ?? []).map(toSemanticTermKey).filter(Boolean),
			},
			yKeys: {
				addKeys: rule.yTerms.map(toSemanticTermKey).filter(Boolean),
				removeKeys: (options.yRemoveTerms ?? []).map(toSemanticTermKey).filter(Boolean),
			},
		}],
	},
});

const createTermPatches = (
	terms: readonly string[],
): readonly TemplateSemanticTermPatch[] => {
	const aliasesByKey = new Map<string, string[]>();
	for (const term of terms) {
		const key = toSemanticTermKey(term);
		if (!key) {
			continue;
		}
		const aliases = aliasesByKey.get(key) ?? [];
		if (!aliases.includes(term)) {
			aliases.push(term);
		}
		aliasesByKey.set(key, aliases);
	}
	return [...aliasesByKey].map(([key, addAliases]) => ({
		key,
		addAliases,
		removeAliases: [],
	}));
};
