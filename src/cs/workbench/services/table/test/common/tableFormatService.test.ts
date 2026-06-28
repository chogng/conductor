/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { TableFormatService } from "src/cs/workbench/services/table/common/tableFormatService";
import {
	canMaterializeTableFormat,
	getTableFormatRegistrations,
} from "src/cs/workbench/services/table/common/tableFormatRegistry";

suite("workbench/services/table/test/common/tableFormatService", () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test("recognizes supported table resources by URI or name", () => {
		const service = new TableFormatService();

		assert.equal(service.canHandle(URI.file("/data/transfer.csv")), true);
		assert.equal(service.canHandle(URI.file("/data/transfer.tsv")), true);
		assert.equal(service.canHandle(URI.file("/data/workbook.xls")), true);
		assert.equal(service.canHandle(URI.file("/data/workbook.xlsx")), true);
		assert.equal(service.canHandle("TRANSFER.CSV"), true);
	});

	test("rejects unsupported and extension-only resources", () => {
		const service = new TableFormatService();

		assert.equal(service.resolveFormat(URI.file("/data/workbook.xls")), "xls");
		assert.equal(service.canHandle(URI.file("/data/notes.txt")), false);
		assert.equal(service.canHandle(URI.file("/data/image.png")), false);
		assert.equal(service.canHandle(URI.file("/data/.csv")), false);
		assert.equal(service.canHandle("sample"), false);
	});

	test("exposes only currently materializable import extensions", () => {
		const service = new TableFormatService();

		assert.deepEqual(service.getSupportedExtensions(), [".csv", ".tsv", ".xls", ".xlsx"]);
		assert.equal(service.getSupportedExtensions().includes(".xls"), true);
		assert.equal(service.getSupportedExtensions().includes(".txt" as never), false);
	});

	test("keeps future txt formats registered but unsupported until detectors and parsers exist", () => {
		const registrations = getTableFormatRegistrations();

		assert.equal(registrations.some(registration => registration.id === "txtDelimited"), true);
		assert.equal(registrations.some(registration => registration.id === "txtFixedWidth"), true);
		assert.equal(canMaterializeTableFormat("txtDelimited"), false);
		assert.equal(canMaterializeTableFormat("txtFixedWidth"), false);
	});

	test("classifies delimited text and workbook materialization formats", () => {
		const service = new TableFormatService();

		assert.equal(service.isDelimitedText("transfer.csv"), true);
		assert.equal(service.isDelimitedText("transfer.tsv"), true);
		assert.equal(service.isWorkbook("workbook.xls"), true);
		assert.equal(service.isWorkbook("transfer.tsv"), false);
		assert.equal(service.isWorkbook("workbook.xlsx"), true);
		assert.equal(service.isWorkbook("sample.csv"), false);
		assert.equal(service.isMaterializableWorkbook("workbook.xls"), true);
		assert.equal(service.isMaterializableWorkbook("workbook.xlsx"), true);
		assert.equal(service.isXlsx("workbook.xlsx"), true);
	});
});
