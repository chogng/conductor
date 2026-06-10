/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
	readRawTableRows,
} from "src/cs/workbench/services/files/browser/rawTableRowsReader";
import type {
	ConvertedCsvReaderService,
} from "src/cs/workbench/services/files/common/fileConverterBackend";

suite("workbench/services/files/test/browser/rawTableRowsReader", () => {
	test("reads inline raw table rows", async () => {
		const rows = await readRawTableRows({
			convertedCsvReaderService: createConvertedCsvReaderStub(),
			rowStore: {
				kind: "memory",
				rows: [["Vg", "Id"], [0, 1e-9]],
			},
		});

		assert.deepEqual(rows, [["Vg", "Id"], ["0", "1e-9"]]);
	});

	test("reads normalized CSV raw table rows", async () => {
		const rows = await readRawTableRows({
			convertedCsvReaderService: createConvertedCsvReaderStub({
				canReadConvertedCsv: () => true,
				readConvertedCsv: async () => ({
					csvText: "\"Vg\",\"Id\"\n0,1e-9",
					ok: true,
				}),
			}),
			fileName: "converted.csv",
			rowStore: {
				kind: "external",
				normalizedCsvPath: "C:/tmp/converted.csv",
			},
		});

		assert.deepEqual(rows, [["Vg", "Id"], ["0", "1e-9"]]);
	});
});

const createConvertedCsvReaderStub = (
	overrides: Partial<ConvertedCsvReaderService> = {},
): ConvertedCsvReaderService => ({
	canReadConvertedCsv: () => false,
	readConvertedCsv: async () => ({
		ok: false,
	}),
	...overrides,
});
