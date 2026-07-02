/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { DataResourceService } from "src/cs/workbench/services/dataResource/browser/dataResourceService";
import { deriveReviewResult } from "src/cs/workbench/services/review/common/reviewDecision";
import type { ReviewResult } from "src/cs/workbench/services/review/common/reviewModel";
import type { SchemaProfileSnapshot } from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
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
import type { ISettingsService } from "src/cs/workbench/services/settings/common/settings";
import type { UserTemplateSnapshot } from "src/cs/workbench/services/userTemplate/common/userTemplate";

type EvaluationExpectation = {
	readonly decision: ReviewResult["decision"]["kind"];
	readonly relation?: string;
	readonly family?: string;
	readonly ivMode?: string;
	readonly groupCount?: number;
	readonly direction?: string;
};

type EvaluationSummary = {
	readonly name: string;
	readonly decision: ReviewResult["decision"]["kind"];
	readonly confidence?: number;
	readonly relation?: string;
	readonly family?: string;
	readonly ivMode?: string;
	readonly xRangeCount: number;
	readonly groupCount: number;
	readonly blockCount: number;
	readonly bindingCount: number;
	readonly xColumn?: number;
	readonly yColumns: readonly number[];
	readonly direction?: string;
	readonly diagnostics: readonly string[];
	readonly findings: readonly string[];
};

const evaluateSample = async (
	store: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>,
	resourceCounter: number,
	sample: EvaluationSample,
): Promise<EvaluationSummary> => {
	const settingsService = {
		onDidChangeConductorSettings: Event.None,
		getConductorSettings: () => null,
	} as unknown as ISettingsService;
	const resource = URI.file(`/workspace/eval-${resourceCounter}.csv`);
	const tableModelService = store.add(new TestTableModelService(resource, createTableContent(sample.rows)));
	const service = store.add(new DataResourceService(tableModelService, settingsService));
	const reference = await service.resolveStructuredContent({ resource, sheetId: "table-a" });
	const resolution = reference.object;
	if (resolution.kind !== "ready") {
		assert.fail(`Expected ready DataResource resolution for ${sample.name}, got ${resolution.kind}.`);
	}

	const snapshot = resolution.snapshot;
	const structuredContent = snapshot.structuredContent;
	const review = deriveReviewResult({
		evidence: {
			sourceMetadata: {
				columnCount: snapshot.columnCount,
				fileName: snapshot.fileName,
				rowCount: snapshot.rowCount,
				sourceModelVersion: snapshot.sourceModelVersion,
				sourceUri: snapshot.sourceUri,
				sourceVersion: snapshot.sourceVersion,
			},
			structuredContent,
		},
		columnCount: snapshot.columnCount,
		fileName: snapshot.fileName,
		modelVersion: snapshot.sourceModelVersion,
		resource,
		rowCount: snapshot.rowCount,
		schemaProfileSnapshot: emptySchemaProfileSnapshot,
		sheetId: "table-a",
		sourceVersion: snapshot.sourceVersion,
		userTemplateSnapshot: emptyUserTemplateSnapshot,
	});
	const binding = structuredContent.bindingCandidates[0];
	const dataBlock = binding
		? structuredContent.dataBlockCandidates.find(candidate => candidate.id === binding.dataBlockCandidateIds[0])
		: undefined;
	const measurement = review.reviewedTemplate?.template.measurement;
	const groupCount = dataBlock
		? structuredContent.xGroupCandidates.filter(group => group.xRangeCandidateId === dataBlock.xRangeCandidateId).length
		: 0;

	reference.dispose();

	return {
		name: sample.name,
		decision: review.decision.kind,
		confidence: review.reviews[0]?.confidence,
		relation: binding?.relation,
		family: measurement?.curveFamily,
		ivMode: measurement?.ivMode ?? undefined,
		xRangeCount: structuredContent.xRangeCandidates.length,
		groupCount,
		blockCount: structuredContent.dataBlockCandidates.length,
		bindingCount: structuredContent.bindingCandidates.length,
		...(dataBlock?.xColumn !== undefined ? { xColumn: dataBlock.xColumn } : {}),
		yColumns: dataBlock?.dependentColumns ?? [],
		direction: dataBlock?.columnDirection,
		diagnostics: structuredContent.diagnostics.map(diagnostic => diagnostic.code),
		findings: review.reviews[0]?.findings.map(finding => finding.code) ?? [],
	};
};

const printEvaluationSummary = (
	summary: EvaluationSummary,
): void => {
	console.log([
		`EVAL ${summary.name}`,
		`decision=${summary.decision}`,
		`confidence=${summary.confidence?.toFixed(3) ?? "n/a"}`,
		`relation=${summary.relation ?? "n/a"}`,
		`family=${summary.family ?? "n/a"}`,
		`ivMode=${summary.ivMode ?? "n/a"}`,
		`xRanges=${summary.xRangeCount}`,
		`groups=${summary.groupCount}`,
		`blocks=${summary.blockCount}`,
		`bindings=${summary.bindingCount}`,
		`xCol=${summary.xColumn ?? "n/a"}`,
		`yCols=${summary.yColumns.join(",") || "n/a"}`,
		`direction=${summary.direction ?? "n/a"}`,
		`diagnostics=${summary.diagnostics.join(",") || "-"}`,
		`findings=${summary.findings.join(",") || "-"}`,
	].join(" | "));
};

const assertEvaluation = (
	summary: EvaluationSummary,
	expectation: EvaluationExpectation,
): void => {
	assert.equal(summary.decision, expectation.decision);
	if (expectation.relation !== undefined) {
		assert.equal(summary.relation, expectation.relation);
	}
	if (expectation.family !== undefined) {
		assert.equal(summary.family, expectation.family);
	}
	if (expectation.ivMode !== undefined) {
		assert.equal(summary.ivMode, expectation.ivMode);
	}
	if (expectation.groupCount !== undefined) {
		assert.equal(summary.groupCount, expectation.groupCount);
	}
	if (expectation.direction !== undefined) {
		assert.equal(summary.direction, expectation.direction);
	}
};

type EvaluationSample = {
	readonly name: string;
	readonly rows: readonly (readonly string[])[];
	readonly expect: EvaluationExpectation;
};

const evaluationSamples: readonly EvaluationSample[] = [{
	name: "first-row X,Y",
	rows: [
		["Vg", "Id"],
		["0", "1e-12"],
		["0.5", "2e-12"],
		["1", "4e-12"],
		["1.5", "8e-12"],
	],
	expect: {
		decision: "ready",
		family: "iv",
		ivMode: "transfer",
		relation: "oneX-oneY",
	},
}, {
	name: "first-row X,Y,Y,Y",
	rows: [
		["Vg", "Id", "Ig", "Is"],
		["0", "1e-12", "1e-14", "2e-14"],
		["0.5", "2e-12", "2e-14", "3e-14"],
		["1", "4e-12", "3e-14", "4e-14"],
		["1.5", "8e-12", "4e-14", "5e-14"],
	],
	expect: {
		decision: "ready",
		family: "iv",
		ivMode: "transfer",
		relation: "oneX-manyY",
	},
}, {
	name: "pairwise XY XY",
	rows: [
		[
			"drain TotalCurrent(IdVg_n938_des) X",
			"drain TotalCurrent(IdVg_n938_des) Y",
			"drain TotalCurrent(IdVd_n938_des) X",
			"drain TotalCurrent(IdVd_n938_des) Y",
		],
		["0", "1e-12", "0", "1e-11"],
		["0.5", "2e-12", "0.5", "2e-11"],
		["1", "4e-12", "1", "4e-11"],
		["1.5", "8e-12", "1.5", "8e-11"],
	],
	expect: {
		decision: "needsManualAdjustment",
		relation: "manyXYpairs",
	},
}, {
	name: "headerless numeric",
	rows: [
		["0", "1e-12"],
		["0.5", "2e-12"],
		["1", "4e-12"],
		["1.5", "8e-12"],
	],
	expect: {
		decision: "ready",
		relation: "oneX-oneY",
	},
}, {
	name: "B1500 metadata + DataName/DataValue",
	rows: [
		["SetupTitle", "Transfer_DB"],
		["TestParameter", "Channel.VName", "Vg", "Vd", "Vs"],
		["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
		["AnalysisSetup", "Analysis.Setup.Vector.Graph.Notes", "[VAR1] Unit=SMU3:MP, Name=Vg, Start=-1 V"],
		["DataName", "Vg", "Id", "Ig"],
		["DataValue", "-1", "-2.63E-12", "-2.05E-12"],
		["DataValue", "0", "-1.24E-11", "-4.12E-12"],
		["DataValue", "1", "-3.04E-10", "-5.12E-12"],
	],
	expect: {
		decision: "ready",
		family: "iv",
		ivMode: "transfer",
		relation: "oneX-manyY",
	},
}, {
	name: "segmented reset sweep",
	rows: [
		["Vg", "Id"],
		["0", "1"],
		["0.5", "2"],
		["1", "3"],
		["0", "4"],
		["0.5", "5"],
		["1", "6"],
	],
	expect: {
		decision: "ready",
		family: "iv",
		groupCount: 2,
		ivMode: "transfer",
	},
}, {
	name: "log ratio sweep",
	rows: [
		["Frequency", "Cgg"],
		["1", "1e-12"],
		["10", "2e-12"],
		["100", "4e-12"],
		["1000", "8e-12"],
	],
	expect: {
		decision: "ready",
		family: "cf",
		relation: "oneX-oneY",
	},
}, {
	name: "left-side Y",
	rows: [
		["Id", "Vg"],
		["1e-12", "0"],
		["2e-12", "0.5"],
		["4e-12", "1"],
		["8e-12", "1.5"],
	],
	expect: {
		decision: "ready",
		direction: "leftObserved",
		family: "iv",
		ivMode: "transfer",
	},
}, {
	name: "blank separated blocks",
	rows: [
		["Vg", "Id", "", "Vd", "Id"],
		["0", "1", "", "0", "10"],
		["0.5", "2", "", "0.5", "20"],
		["1", "3", "", "1", "30"],
	],
	expect: {
		decision: "needsManualAdjustment",
	},
}, {
	name: "dirty mixed no X/title",
	rows: [
		["marker", "alpha", "beta"],
		["A", "0", "bad"],
		["B", "missing", "1"],
		["C", "2", "also-bad"],
	],
	expect: {
		decision: "invalid",
	},
}];

const emptyUserTemplateSnapshot: UserTemplateSnapshot = {
	version: 0,
	workspaceVersion: 0,
	profileVersion: 0,
	workspaceFingerprint: "",
	profileFingerprint: "",
	effectiveFingerprint: "",
	templates: [],
};

const emptySchemaProfileSnapshot: SchemaProfileSnapshot = {
	version: 0,
	profiles: [],
};

suite("workbench/services/dataResource/test/browser/dataResourceEvaluation", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let resourceCounter = 0;

	for (const sample of evaluationSamples) {
		test(sample.name, async () => {
			const summary = await evaluateSample(store, ++resourceCounter, sample);
			printEvaluationSummary(summary);
			assertEvaluation(summary, sample.expect);
		});
	}
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
