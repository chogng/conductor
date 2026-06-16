/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { AssessmentContribution } from "src/cs/workbench/services/assessment/browser/assessment.contribution";
import { AssessmentQueueService } from "src/cs/workbench/services/assessment/browser/assessmentQueueService";
import type {
	AssessRawTableInput,
	IAssessmentService,
	ImportFileAssessment,
	RawTableAssessmentRecord,
} from "src/cs/workbench/services/assessment/common/assessment";
import type { FileImportResult } from "src/cs/workbench/services/files/common/files";
import type {
	IRawTableRowsReaderService,
	RawTableRows,
	RawTableRowsReadInput,
} from "src/cs/workbench/services/files/common/rawTableRowsReader";
import { SessionService } from "src/cs/workbench/services/session/browser/sessionService";

suite("workbench/services/assessment/test/browser/assessmentContribution", () => {
	test("assesses inline raw tables after session import commits", async () => {
		const sessionService = new SessionService();
		const assessmentService = new TestAssessmentService();
		const rawTableRowsReaderService = new TestRawTableRowsReaderService();
		const assessmentQueueService = new AssessmentQueueService(
			sessionService,
			assessmentService,
			rawTableRowsReaderService,
		);
		const contribution = new AssessmentContribution(
			sessionService,
			assessmentQueueService,
		);

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
		const sessionService = new SessionService();
		const assessmentService = new TestAssessmentService();
		const rawTableRowsReaderService = new TestRawTableRowsReaderService();
		const assessmentQueueService = new AssessmentQueueService(
			sessionService,
			assessmentService,
			rawTableRowsReaderService,
		);
		const assessmentEventSizes: number[] = [];
		const disposable = sessionService.onDidChangeSession(event => {
			if (event.reason === "assessmentChanged") {
				assessmentEventSizes.push(event.rawTableRefs?.length ?? 0);
			}
		});
		const contribution = new AssessmentContribution(
			sessionService,
			assessmentQueueService,
		);

		sessionService.commitFileImport(createMultiInlineImportResult(18));
		await waitUntil(() => assessmentEventSizes.length === 3);

		assert.deepEqual(assessmentEventSizes, [1, 16, 1]);
		assert.equal(assessmentService.inputs.length, 18);

		disposable.dispose();
		contribution.dispose();
		assessmentQueueService.dispose();
	});

	test("prioritizes visible raw tables before background assessment", async () => {
		const sessionService = new SessionService();
		const assessmentService = new TestAssessmentService();
		const rawTableRowsReaderService = new TestRawTableRowsReaderService();
		const assessmentQueueService = new AssessmentQueueService(
			sessionService,
			assessmentService,
			rawTableRowsReaderService,
		);
		const contribution = new AssessmentContribution(
			sessionService,
			assessmentQueueService,
		);

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
		return Promise.resolve({
			blocks: [{
				columnCount: 2,
				columns: {
					columns: [],
				},
				diagnosticCodes: [],
				family: "iv",
				fileId: input.fileId,
				id: blockId,
				label: "Block A",
				rawTableId: input.rawTableId,
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
			createdAt: 123,
			diagnostics: [],
			fileId: input.fileId,
			groups: [],
			rawTableId: input.rawTableId,
			sourceRawTableVersion: input.sourceRawTableVersion,
		});
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
