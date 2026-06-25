/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter } from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { TableModelContribution } from "src/cs/workbench/services/tableModel/browser/tableModel.contribution";
import { TableModelQueueService } from "src/cs/workbench/services/tableModel/browser/tableModelQueueService";
import { TableModelProducerService } from "src/cs/workbench/services/tableModel/browser/tableModelService";
import { TABLE_MODEL_RULE_VERSION } from "src/cs/workbench/services/tableModel/common/tableModel";
import type {
	CreateTableModelInput,
	ITableModelProducerService,
	ImportTableModelSeed,
	TableModelRecord,
} from "src/cs/workbench/services/tableModel/common/tableModel";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/tableModel/common/rawTableStructure";
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
import {
	createSchemaProfileFromConfirmation,
	type ConfirmSchemaProfileInput,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfileConfirmation";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";
import type { ITableFileService } from "src/cs/workbench/services/tableFile/common/tableFile";
import { TableFileService } from "src/cs/workbench/services/tableFile/browser/tableFileService";

suite("workbench/services/tableModel/test/browser/tableModelContribution", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("assesses inline raw tables after table-file import commits", async () => {
		const sessionService = store.add(new SessionService());
		const tableFileService = new TableFileService(sessionService);
		const tableModelService = new TestTableModelProducerService();
		const rawTableRowsReaderService = new TestRawTableRowsReaderService();
		const tableModelQueueService = store.add(new TableModelQueueService(
			tableFileService,
			sessionService,
			tableModelService,
			rawTableRowsReaderService,
		));
		const contribution = store.add(new TableModelContribution(
			tableFileService,
			tableModelQueueService,
		));

		sessionService.commitFileImport(createInlineImportResult());
		await settlePromises();

		const file = sessionService.getSnapshot().filesById["file-a"];
		assert.deepEqual(
			{
				tableModelVersion: file.tableModelByRawTableId["table-a"]?.sourceRawTableVersion,
				tableModelInputs: tableModelService.inputs.map(input => ({
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
				tableModelVersion: 1,
				tableModelInputs: [{
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
		tableModelQueueService.dispose();
	});

	test("commits the first TableModel then batches background results", async () => {
		const sessionService = store.add(new SessionService());
		const tableFileService = new TableFileService(sessionService);
		const tableModelService = new TestTableModelProducerService();
		const rawTableRowsReaderService = new TestRawTableRowsReaderService();
		const tableModelQueueService = store.add(new TableModelQueueService(
			tableFileService,
			sessionService,
			tableModelService,
			rawTableRowsReaderService,
		));
		const tableModelEventSizes: number[] = [];
		const disposable = store.add(sessionService.onDidChangeSession(event => {
			if (event.reason === "tableModelChanged") {
				tableModelEventSizes.push(event.rawTableRefs?.length ?? 0);
			}
		}));
		const contribution = store.add(new TableModelContribution(
			tableFileService,
			tableModelQueueService,
		));

		sessionService.commitFileImport(createMultiInlineImportResult(18));
		await waitUntil(() => tableModelEventSizes.length === 3);

		assert.deepEqual(tableModelEventSizes, [1, 16, 1]);
		assert.equal(tableModelService.inputs.length, 18);

		disposable.dispose();
		contribution.dispose();
		tableModelQueueService.dispose();
	});

	test("reassesses restored raw tables when the TableModel rule version is stale", async () => {
		const sessionService = store.add(new SessionService());
		sessionService.commitFileImport(createInlineImportResult());
		sessionService.commitTableModel(createTableModelRecord({
			tableModelRuleVersion: TABLE_MODEL_RULE_VERSION - 1,
			fileId: "file-a",
			rawTableId: "table-a",
			sourceRawTableVersion: 1,
		}));
		const tableModelService = new TestTableModelProducerService();
		const rawTableRowsReaderService = new TestRawTableRowsReaderService();
		const tableFileService = new TableFileService(sessionService);
		const tableModelQueueService = store.add(new TableModelQueueService(
			tableFileService,
			sessionService,
			tableModelService,
			rawTableRowsReaderService,
		));
		const contribution = store.add(new TableModelContribution(
			tableFileService,
			tableModelQueueService,
		));

		await waitUntil(() => tableModelService.inputs.length === 1);

		const file = sessionService.getSnapshot().filesById["file-a"];
		assert.equal(
			file.tableModelByRawTableId["table-a"]?.tableModelRuleVersion,
			TABLE_MODEL_RULE_VERSION,
		);
		assert.deepEqual(
			tableModelService.inputs.map(input => input.sourceRawTableVersion),
			[1],
		);

		contribution.dispose();
		tableModelQueueService.dispose();
	});

	test("reassesses raw tables when schema profile version changes", async () => {
		const sessionService = store.add(new SessionService());
		const tableFileService = new TableFileService(sessionService);
		const tableModelService = new TestTableModelProducerService();
		const rawTableRowsReaderService = new TestRawTableRowsReaderService();
		const schemaProfileService = new TestSchemaProfileService();
		const tableModelQueueService = store.add(new TableModelQueueService(
			tableFileService,
			sessionService,
			tableModelService,
			rawTableRowsReaderService,
			schemaProfileService,
		));
		const contribution = store.add(new TableModelContribution(
			tableFileService,
			tableModelQueueService,
		));

		sessionService.commitFileImport(createInlineImportResult());
		await waitUntil(() => tableModelService.inputs.length === 1);
		assert.equal(sessionService.getSnapshot().filesById["file-a"].tableModelByRawTableId["table-a"]?.schemaProfileVersion, 0);

		schemaProfileService.setVersion(1);
		await waitUntil(() => tableModelService.inputs.length === 2);

		assert.deepEqual(
			tableModelService.inputs.map(input => input.schemaProfileVersion),
			[0, 1],
		);
		assert.equal(sessionService.getSnapshot().filesById["file-a"].tableModelByRawTableId["table-a"]?.schemaProfileVersion, 1);

		contribution.dispose();
		tableModelQueueService.dispose();
	});

	test("reassesses with confirmed schema profile evidence after profile changes", async () => {
		const sessionService = store.add(new SessionService());
		const tableFileService = new TableFileService(sessionService);
		const rawTableRowsReaderService = new TestRawTableRowsReaderService();
		const schemaProfileService = new TestSchemaProfileService();
		const tableModelService = store.add(new TableModelProducerService(schemaProfileService));
		const tableModelQueueService = store.add(new TableModelQueueService(
			tableFileService,
			sessionService,
			tableModelService,
			rawTableRowsReaderService,
			schemaProfileService,
		));
		const contribution = store.add(new TableModelContribution(
			tableFileService,
			tableModelQueueService,
		));

		sessionService.commitFileImport(createProfileConfirmationImportResult());
		await waitUntil(() => Boolean(
			sessionService.getSnapshot().filesById["file-profile"]?.tableModelByRawTableId["table-profile"],
		));

		const initial = sessionService.getSnapshot()
			.filesById["file-profile"]
			.tableModelByRawTableId["table-profile"];
		assert.ok(initial);
		assert.equal(initial.schemaProfileVersion, 0);
		assert.equal(initial.blocks[0]?.family, "unknown");

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
				.tableModelByRawTableId["table-profile"]
				?.schemaProfileVersion === 1
		);

		const reassessed = sessionService.getSnapshot()
			.filesById["file-profile"]
			.tableModelByRawTableId["table-profile"];
		assert.ok(reassessed);
		assert.equal(reassessed.blocks[0]?.family, "iv");
		assert.equal(reassessed.blocks[0]?.ivMode, "transfer");
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
		tableModelQueueService.dispose();
	});

	test("prioritizes visible raw tables before background TableModel work", async () => {
		const sessionService = store.add(new SessionService());
		const tableFileService = new TableFileService(sessionService);
		const tableModelService = new TestTableModelProducerService();
		const rawTableRowsReaderService = new TestRawTableRowsReaderService();
		const tableModelQueueService = store.add(new TableModelQueueService(
			tableFileService,
			sessionService,
			tableModelService,
			rawTableRowsReaderService,
		));
		const contribution = store.add(new TableModelContribution(
			tableFileService,
			tableModelQueueService,
		));

		tableModelQueueService.prioritizeRawTables([
			{ fileId: "file-5", rawTableId: "table-5" },
			{ fileId: "file-4", rawTableId: "table-4" },
		], "visible");
		sessionService.commitFileImport(createMultiInlineImportResult(6));
		await waitUntil(() => tableModelService.inputs.length >= 3);

		assert.deepEqual(
			tableModelService.inputs.slice(0, 3).map(input => input.rawTableId),
			["table-5", "table-4", "table-0"],
		);

		contribution.dispose();
		tableModelQueueService.dispose();
	});

	test("discards stale queued TableModel work when raw table version changes while rows are loading", async () => {
		const sessionService = store.add(new SessionService());
		const tableFileService = new TableFileService(sessionService);
		const tableModelService = new TestTableModelProducerService();
		const rawTableRowsReaderService = new BlockingRawTableRowsReaderService();
		const tableModelQueueService = store.add(new TableModelQueueService(
			tableFileService,
			sessionService,
			tableModelService,
			rawTableRowsReaderService,
		));
		const contribution = store.add(new TableModelContribution(
			tableFileService,
			tableModelQueueService,
		));

		sessionService.commitFileImport(createInlineImportResult());
		await waitUntil(() => rawTableRowsReaderService.inputs.length === 1);
		sessionService.commitFileImport(createInlineImportResult());
		rawTableRowsReaderService.resolveFirstRead();
		await waitUntil(() => tableModelService.inputs.length === 1);

		assert.deepEqual(
			tableModelService.inputs.map(input => input.sourceRawTableVersion),
			[2],
		);

		contribution.dispose();
		tableModelQueueService.dispose();
	});

	test("discards stale queued TableModel work when schema profile version changes while rows are loading", async () => {
		const sessionService = store.add(new SessionService());
		const tableFileService = new TableFileService(sessionService);
		const tableModelService = new TestTableModelProducerService();
		const rawTableRowsReaderService = new BlockingRawTableRowsReaderService();
		const schemaProfileService = new TestSchemaProfileService();
		const tableModelQueueService = store.add(new TableModelQueueService(
			tableFileService,
			sessionService,
			tableModelService,
			rawTableRowsReaderService,
			schemaProfileService,
		));
		const contribution = store.add(new TableModelContribution(
			tableFileService,
			tableModelQueueService,
		));

		sessionService.commitFileImport(createInlineImportResult());
		await waitUntil(() => rawTableRowsReaderService.inputs.length === 1);
		schemaProfileService.setVersion(1);
		rawTableRowsReaderService.resolveFirstRead();
		await waitUntil(() => tableModelService.inputs.length === 1);

		assert.deepEqual(
			tableModelService.inputs.map(input => input.schemaProfileVersion),
			[1],
		);
		assert.equal(
			sessionService.getSnapshot().filesById["file-a"].tableModelByRawTableId["table-a"]?.schemaProfileVersion,
			1,
		);

		contribution.dispose();
		tableModelQueueService.dispose();
	});

	test("publishes queued and running TableModel state per raw table", async () => {
		const sessionService = store.add(new SessionService());
		const tableFileService = new TableFileService(sessionService);
		const tableModelService = new TestTableModelProducerService();
		const rawTableRowsReaderService = new BlockingRawTableRowsReaderService();
		const tableModelQueueService = store.add(new TableModelQueueService(
			tableFileService,
			sessionService,
			tableModelService,
			rawTableRowsReaderService,
		));
		const observedStates: string[][] = [];
		const disposable = store.add(tableModelQueueService.onDidChangeTableModelQueueState(() => {
			observedStates.push(tableModelQueueService.getQueueSnapshot().rawTables.map(state =>
				`${state.state}:${state.priority}:${state.fileId}:${state.rawTableId}:${state.sourceRawTableVersion}`
			));
		}));

		sessionService.commitFileImport(createInlineImportResult());
		tableModelQueueService.enqueueRawTables([
			{ fileId: "file-a", rawTableId: "table-a" },
		]);
		await waitUntil(() => tableModelQueueService.getQueueSnapshot().rawTables.some(state => state.state === "running"));

		assert.deepEqual(tableModelQueueService.getQueueSnapshot(), {
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
		await waitUntil(() => tableModelQueueService.getQueueSnapshot().rawTables.length === 0);

		assert.equal(tableModelService.inputs.length, 1);
		disposable.dispose();
		tableModelQueueService.dispose();
	});

	test("cleans queued and preferred TableModel refs when files are removed or session clears", () => {
		const sessionService = store.add(new SessionService());
		const eventEmitter = new Emitter<SessionChangeEvent>();
		const tableFileService: ITableFileService = {
			_serviceBrand: undefined,
			clearTableFiles: () => undefined,
			commitImport: () => ({
				importedFileIds: [],
				skippedDuplicateFileIds: [],
			}),
			getSnapshot: () => ({
				fileOrder: [],
				filesById: {},
				schemaVersion: 1,
				sessionVersion: 1,
			}),
			onDidChangeTableFiles: eventEmitter.event,
			removeFiles: () => undefined,
			renameFile: () => false,
		};
		const tableModelQueueService = store.add(new TableModelQueueService(
			tableFileService,
			sessionService,
			new TestTableModelProducerService(),
			new TestRawTableRowsReaderService(),
		));
		const inspect = tableModelQueueService as unknown as {
			pendingVisibleRefsByKey: Map<string, unknown>;
			preferredOrderByKey: Map<string, unknown>;
			preferredPriorityByKey: Map<string, unknown>;
		};

		tableModelQueueService.prioritizeRawTables([
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

class TestTableModelProducerService implements ITableModelProducerService {
	public declare readonly _serviceBrand: undefined;

	public readonly inputs: CreateTableModelInput[] = [];

	public createImportTableModelSeedFromFile(_file: File): Promise<ImportTableModelSeed> {
		return Promise.reject(new Error("Not implemented."));
	}

	public createImportTableModelSeedFromRows(
		_fileName: string,
		_rows: readonly (readonly string[])[],
	): Promise<ImportTableModelSeed> {
		return Promise.reject(new Error("Not implemented."));
	}

	public getOrCreate(input: CreateTableModelInput): Promise<TableModelRecord> {
		this.inputs.push(input);
		const blockId = input.rawTableId === "table-a" ? "block-a" : `block-${input.rawTableId}`;
		return Promise.resolve(createTableModelRecord({
			fileId: input.fileId,
			rawTableId: input.rawTableId,
			blockId,
			schemaProfileVersion: input.schemaProfileVersion ?? 0,
			sourceRawTableVersion: input.sourceRawTableVersion,
		}));
	}
}

const createTableModelRecord = ({
	tableModelRuleVersion = TABLE_MODEL_RULE_VERSION,
	blockId = "block-a",
	fileId,
	rawTableId,
	schemaProfileVersion = 0,
	sourceRawTableVersion,
}: {
	readonly tableModelRuleVersion?: number;
	readonly blockId?: string;
	readonly fileId: string;
	readonly rawTableId: string;
	readonly schemaProfileVersion?: number;
	readonly sourceRawTableVersion: number;
}): TableModelRecord => ({
	tableModelRuleVersion,
	schemaProfileVersion,
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

	assert.ok(predicate(), "Timed out waiting for asynchronous TableModel work.");
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
