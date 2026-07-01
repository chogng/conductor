/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { DataResourceService } from "src/cs/workbench/services/dataResource/browser/dataResourceService";
import {
	createSemanticMatcher,
	builtinSemanticTerms,
	builtinSemanticDomainPacks,
	isCustomSemanticMatchTermAllowed,
	matchSemanticRowMarker,
	matchSemanticTitle,
	normalizeSemanticText,
} from "src/cs/workbench/services/dataResource/common/semanticLibrary";
import type { ISettingsService } from "src/cs/workbench/services/settings/common/settings";
import type { StructuredContentEvidence } from "src/cs/workbench/services/dataResource/common/structuredContent";
import {
	TableModel as TableContentModel,
	type ITableModel,
	type TableModelContentSnapshot,
} from "src/cs/workbench/services/table/common/model";
import type { TableSource } from "src/cs/workbench/services/table/common/table";
import type {
	ITableModelContentProvider,
	ITableModelReference,
	ITableModelService,
} from "src/cs/workbench/services/table/common/resolverService";

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
		const service = store.add(new DataResourceService(tableModelService, settingsService));
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
		assert.equal(drainVoltageMatch?.canonicalRole, "vd");
		assert.equal(gateVoltageXMatch?.axisTendency, "x");
		assert.equal(gateVoltageXMatch?.canonicalRole, "vg");
		assert.equal(gateVoltageYMatch?.axisTendency, "dependent");
		assert.equal(gateVoltageYMatch?.canonicalRole, "vg");
		assert.equal(matchSemanticTitle("vpn")?.canonicalRole, "voltage");
		assert.equal(matchSemanticTitle("vpn")?.axisTendency, "x");
		assert.equal(matchSemanticTitle("Cp")?.canonicalRole, "capacitance");
		assert.equal(matchSemanticTitle("Cp")?.axisTendency, "dependent");
		assert.equal(matchSemanticTitle("Cp(vp=0.00000)"), null);
		assert.equal(matchSemanticTitle("CH1 Voltage"), null);
		assert.equal(matchSemanticTitle("drain TotalCurrent(IdVg_n938_des) X"), null);
		for (const ambiguousTerm of ["V", "I", "C", "G", "t", "f"]) {
			assert.equal(matchSemanticTitle(ambiguousTerm), null);
		}
		assert.equal(matchSemanticTitle("ipt")?.canonicalRole, "current");
		assert.equal(matchSemanticTitle("ipt")?.axisTendency, "dependent");
		assert.equal(matchSemanticRowMarker("DataName"), "titleRow");
		assert.equal(matchSemanticRowMarker("DataValue"), "dataRow");
	});

	test("uses template semantic term entries in DataResource matcher", async () => {
		const evidence = await resolveEvidence([
			["DriveBias", "SenseCurrent"],
			["0", "1e-12"],
			["0.5", "2e-12"],
			["1", "4e-12"],
		], {
			templateSemanticAllowlist: [{
				id: "drive-bias",
				alias: "DriveBias",
				canonicalRole: "voltage",
				axisTendency: "x",
				enabled: true,
			}, {
				id: "sense-current",
				alias: "SenseCurrent",
				canonicalRole: "current",
				axisTendency: "dependent",
				enabled: true,
			}],
		});

		assert.ok(evidence.semanticLibraryFingerprint.includes("data-resource-semantic:"));
		assert.ok(evidence.columnTitleSpans.some(span =>
			span.targetColumn === 0 &&
			span.canonicalRole === "voltage" &&
			span.axisTendency === "x" &&
			span.reasons.includes("semanticAllowlist.term")
		));
		assert.ok(evidence.columnTitleSpans.some(span =>
			span.targetColumn === 1 &&
			span.canonicalRole === "current" &&
			span.axisTendency === "dependent"
		));
	});

	test("uses explicitly configured single-character template semantic term entries", async () => {
		const evidence = await resolveEvidence([
			["V", "I"],
			["0", "1e-12"],
			["0.5", "2e-12"],
			["1", "4e-12"],
		], {
			templateSemanticAllowlist: [{
				id: "single-v",
				alias: "V",
				canonicalRole: "voltage",
				axisTendency: "x",
				enabled: true,
			}, {
				id: "single-i",
				alias: "I",
				canonicalRole: "current",
				axisTendency: "dependent",
				enabled: true,
			}],
		});

		assert.ok(evidence.columnTitleSpans.some(span =>
			span.targetColumn === 0 &&
			span.canonicalRole === "voltage" &&
			span.axisTendency === "x" &&
			span.reasons.includes("semanticAllowlist.term")
		));
		assert.ok(evidence.columnTitleSpans.some(span =>
			span.targetColumn === 1 &&
			span.canonicalRole === "current" &&
			span.axisTendency === "dependent" &&
			span.reasons.includes("semanticAllowlist.term")
		));
	});

	test("uses Chinese template semantic term entries", async () => {
		assert.equal(normalizeSemanticText("栅 压"), "栅压");
		assert.equal(isCustomSemanticMatchTermAllowed("漏极电流"), true);
		assert.equal(isCustomSemanticMatchTermAllowed(";"), false);

		const evidence = await resolveEvidence([
			["栅压", "漏极电流"],
			["0", "1e-12"],
			["0.5", "2e-12"],
			["1", "4e-12"],
		], {
			templateSemanticAllowlist: [{
				id: "gate-voltage-zh",
				alias: "栅压",
				canonicalRole: "voltage",
				axisTendency: "x",
				enabled: true,
			}, {
				id: "drain-current-zh",
				alias: "漏极电流",
				canonicalRole: "current",
				axisTendency: "dependent",
				enabled: true,
			}],
		});

		assert.ok(evidence.columnTitleSpans.some(span =>
			span.targetColumn === 0 &&
			span.canonicalRole === "voltage" &&
			span.axisTendency === "x" &&
			span.reasons.includes("semanticAllowlist.term")
		));
		assert.ok(evidence.columnTitleSpans.some(span =>
			span.targetColumn === 1 &&
			span.canonicalRole === "current" &&
			span.axisTendency === "dependent" &&
			span.reasons.includes("semanticAllowlist.term")
		));
	});

	test("can disable built-in semantic terms without deleting user terms", async () => {
		const vgTerm = builtinSemanticTerms.find(term => term.alias === "Vg");
		assert.ok(vgTerm);
		const evidence = await resolveEvidence([
			["Vg", "SenseCurrent"],
			["0", "1e-12"],
			["0.5", "2e-12"],
			["1", "4e-12"],
		], {
			templateDisabledBuiltinSemanticIds: [vgTerm.id],
			templateSemanticAllowlist: [{
				id: "sense-current",
				alias: "SenseCurrent",
				canonicalRole: "current",
				axisTendency: "dependent",
				enabled: true,
			}],
		});

		assert.ok(!evidence.columnTitleSpans.some(span =>
			span.targetColumn === 0 &&
			span.canonicalRole === "vg"
		));
		assert.ok(evidence.columnTitleSpans.some(span =>
			span.targetColumn === 1 &&
			span.canonicalRole === "current" &&
			span.reasons.includes("semanticAllowlist.term")
		));
	});

	test("can disable built-in domain packs without deleting user terms", async () => {
		assert.ok(builtinSemanticDomainPacks.some(pack => pack.id === "origin-like-export"));
		const matcher = createSemanticMatcher({
			disabledDomainPackIds: ["origin-like-export"],
		});
		assert.equal(matcher.matchRowMarker("DataName"), null);

		const evidence = await resolveEvidence([
			["Vg", "SenseCurrent"],
			["0", "1e-12"],
			["0.5", "2e-12"],
			["1", "4e-12"],
		], {
			templateDisabledBuiltinDomainPackIds: ["semiconductor-ivcv"],
			templateSemanticAllowlist: [{
				id: "sense-current",
				alias: "SenseCurrent",
				canonicalRole: "current",
				axisTendency: "dependent",
				enabled: true,
			}],
		});

		assert.ok(!evidence.columnTitleSpans.some(span =>
			span.targetColumn === 0 &&
			span.canonicalRole === "vg"
		));
		assert.ok(evidence.columnTitleSpans.some(span =>
			span.targetColumn === 1 &&
			span.canonicalRole === "current" &&
			span.reasons.includes("semanticAllowlist.term")
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

	test("uses DataName/DataValue title rows as column evidence", async () => {
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
			span.canonicalRole === "vg" &&
			span.axisTendency === "x"
		));
		assert.ok(evidence.dataBlockCandidates.some(candidate =>
			candidate.xColumn === 1 && candidate.dependentColumns.includes(2)
		));
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
		assert.ok(evidence.columnTitleSpans.some(span =>
			span.targetColumn === 1 &&
			span.reasons.some(reason => reason === "infoNeighborhood.intent:rawTransient")
		));
	});

	test("uses configured X intent priority when several X ranges are legal", async () => {
		const rows = [
			["FastIV", "interval", ""],
			["DataName", "Time", "Vp", "Ipt"],
			["DataValue", "0", "0", "1e-12"],
			["DataValue", "1", "0.5", "2e-12"],
			["DataValue", "2", "1", "3e-12"],
		];
		const pvFirst = await resolveEvidence(rows);
		const rawFirst = await resolveEvidence(rows, {
			templateXAxisIntentPriority: ["rawTransient", "pvCurve", "ivCurve", "cvCurve", "frequencySweep", "genericXY"],
		});
		const ivFirst = await resolveEvidence(rows, {
			templateXAxisIntentPriority: ["ivCurve", "pvCurve", "cvCurve", "frequencySweep", "rawTransient", "genericXY"],
		});

		assert.equal(pvFirst.xRangeCandidates[0]?.column, 2);
		assert.equal(rawFirst.xRangeCandidates[0]?.column, 1);
		assert.equal(ivFirst.xRangeCandidates[0]?.column, 2);
		assert.ok(ivFirst.xRangeCandidates[0]?.reasons.includes("xRange.intent:ivCurve"));
	});

	test("detects pairwise XY blocks and many-pair bindings", async () => {
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
		assert.ok(evidence.bindingCandidates.some(candidate => candidate.relation === "manyXYpairs"));
	});

	test("detects aligned repeated data blocks", async () => {
		const evidence = await resolveEvidence([
			["CH1 Voltage", "CH1 Current", "CH1 Resistance", "", "CH2 Voltage", "CH2 Current", "CH2 Resistance"],
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

	public registerContentProvider(provider: ITableModelContentProvider): { dispose(): void } {
		return {
			dispose: () => {
				provider.dispose();
			},
		};
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
