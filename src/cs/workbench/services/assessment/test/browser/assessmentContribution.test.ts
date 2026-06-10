/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { AssessmentContribution } from "src/cs/workbench/services/assessment/browser/assessment.contribution";
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
		const contribution = new AssessmentContribution(
			sessionService,
			assessmentService,
			new TestRawTableRowsReaderService(),
		);

		sessionService.commitFileImport(createInlineImportResult());
		await settlePromises();

		const file = sessionService.getSnapshot().filesById["file-a"];
		assert.deepEqual(
			{
				assessmentVersion: file.assessmentsByRawTableId["table-a"]?.sourceRawTableVersion,
				assessedInputs: assessmentService.inputs.map(input => ({
					fileId: input.fileId,
					rawTableId: input.rawTableId,
					rows: input.rows,
					sourceRawTableVersion: input.sourceRawTableVersion,
				})),
				measurementBlockOrder: file.measurementBlockOrder,
			},
			{
				assessmentVersion: 1,
				assessedInputs: [{
					fileId: "file-a",
					rawTableId: "table-a",
					rows: [["Vg", "Id"], ["0", "1e-9"]],
					sourceRawTableVersion: 1,
				}],
				measurementBlockOrder: ["block-a"],
			},
		);

		contribution.dispose();
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
		return Promise.resolve({
			blocks: [{
				columnCount: 2,
				columns: {
					columns: [],
				},
				diagnosticCodes: [],
				family: "iv",
				fileId: input.fileId,
				id: "block-a",
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
			fileName: "Transfer.csv",
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

const settlePromises = async (): Promise<void> => {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
};

class TestRawTableRowsReaderService implements IRawTableRowsReaderService {
	public declare readonly _serviceBrand: undefined;

	public readRawTableRows(input: RawTableRowsReadInput): Promise<RawTableRows | null> {
		const rowStore = input.rowStore;
		if (!rowStore || rowStore.kind !== "memory") {
			return Promise.resolve(null);
		}

		return Promise.resolve(rowStore.rows.map(row =>
			row.map(cell => cell == null ? "" : String(cell))
		));
	}
}
