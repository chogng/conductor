/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
	createTableByteBuffer,
	createTableTextBuffer,
	type TableTextBuffer,
} from "src/cs/workbench/services/table/common/tableReadBuffer";
import {
	PARSED_TABLE_ROW_WINDOW_SIZE,
	parseTableStructure,
} from "src/cs/workbench/services/table/common/tableStructureParser";

suite("workbench/services/table/test/common/tableStructureParser", () => {
	test("reports future txt formats as parser-unavailable until implemented", async () => {
		const result = await parseTableStructure({
			buffer: createTableTextBuffer("a,b\n1,2", "utf8"),
			format: "txtDelimited",
		});

		assert.equal(result.content, null);
		assert.deepEqual(result.sheets, []);
		assert.equal(result.diagnostics[0]?.code, "table.parser.parserUnavailable");
		assert.equal(result.diagnostics[0]?.severity, "fatal");
	});

	test("parses legacy HTML xls tables from byte buffers", async () => {
		const result = await parseTableStructure({
			buffer: createTableByteBuffer(new TextEncoder().encode([
				'<html><head><meta charset="utf-8"></head><body><table>',
				"<tr><th>Label</th><th>Number</th></tr>",
				"<tr><td>plain text</td><td>42.5</td></tr>",
				"<tr><td>comma, quote &amp; &quot;raw&quot;</td><td>1.23E-7</td></tr>",
				"</table></body></html>",
			].join(""))),
			format: "xls",
		});

		assert.deepEqual(result.content?.rows, [
			["Label", "Number"],
			["plain text", "42.5"],
			["comma, quote & \"raw\"", "1.23E-7"],
		]);
		assert.deepEqual(result.diagnostics, []);
		assert.equal(result.sheets[0]?.sheetId, "0");
	});

	test("reports binary xls buffers as unsupported in common parser", async () => {
		const result = await parseTableStructure({
			buffer: createTableByteBuffer(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])),
			format: "xls",
		});

		assert.equal(result.content, null);
		assert.deepEqual(result.sheets, []);
		assert.equal(result.diagnostics[0]?.code, "table.parser.binaryXlsUnsupported");
		assert.equal(result.diagnostics[0]?.severity, "fatal");
	});

	test("uses native xls sheet rows only when a reader is provided", async () => {
		const result = await parseTableStructure({
			buffer: createTableByteBuffer(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])),
			format: "xls",
			xlsReader: async ({ bytes }) => {
				assert.deepEqual([...bytes], [0xd0, 0xcf, 0x11, 0xe0]);
				return {
					sheets: [{
						rows: [["A", "B"], ["1", "2"]],
						sheetId: "native",
						sheetName: "Native Sheet",
					}],
				};
			},
		});

		assert.deepEqual(result.content?.rows, [
			["A", "B"],
			["1", "2"],
		]);
		assert.deepEqual(result.diagnostics, []);
		assert.equal(result.sheets[0]?.sheetId, "native");
		assert.equal(result.sheets[0]?.sheetName, "Native Sheet");
	});

	test("parses delimited text chunks without first materializing a full string", async () => {
		const result = await parseTableStructure({
			buffer: createChunkOnlyTextBuffer([
				"Name,Value\r",
				"\n\"multi",
				"\r\nline\",2\r",
				"\n\"escaped \"\"quote\"\"\",3",
			]),
			format: "csv",
		});

		assert.deepEqual(result.content?.rows, [
			["Name", "Value"],
			["multi\r\nline", "2"],
			["escaped \"quote\"", "3"],
		]);
		assert.deepEqual(result.diagnostics, []);
	});

	test("keeps Papa-compatible trailing line semantics for delimited chunks", async () => {
		const result = await parseTableStructure({
			buffer: createChunkOnlyTextBuffer(["a,b\n", "\n"]),
			format: "csv",
		});

		assert.deepEqual(result.content?.rows, [
			["a", "b"],
			[""],
			[""],
		]);
	});

	test("reports repeated unescaped quote diagnostics once", async () => {
		const result = await parseTableStructure({
			buffer: createTableTextBuffer("\"a\"x,b\n\"c\"y,d", "utf8"),
			format: "csv",
		});

		assert.deepEqual(result.content?.rows, [
			["ax", "b"],
			["cy", "d"],
		]);
		assert.deepEqual(
			result.sheets[0]?.diagnostics.filter(diagnostic => diagnostic.code === "table.parser.unescapedQuote"),
			[{
				code: "table.parser.unescapedQuote",
				message: "The delimited table parser found characters after a closing quote.",
				rowIndex: 0,
				severity: "error",
			}],
		);
	});

	test("windows large delimited parser content instead of exposing full rows", async () => {
		const rowCount = PARSED_TABLE_ROW_WINDOW_SIZE + 5;
		const result = await parseTableStructure({
			buffer: createTableTextBuffer(
				Array.from({ length: rowCount }, (_, index) => `r${index},${index}`).join("\n"),
				"utf8",
			),
			format: "csv",
		});

		assert.equal(result.content?.rowCount, rowCount);
		assert.equal(result.content?.rows.length, PARSED_TABLE_ROW_WINDOW_SIZE);
		assert.equal(result.content?.rowWindows?.length, 2);
		assert.deepEqual(result.content?.rowWindows?.[1], {
			startRowIndex: PARSED_TABLE_ROW_WINDOW_SIZE,
			rows: Array.from({ length: 5 }, (_, index) => [
				`r${PARSED_TABLE_ROW_WINDOW_SIZE + index}`,
				String(PARSED_TABLE_ROW_WINDOW_SIZE + index),
			]),
		});
	});
});

const createChunkOnlyTextBuffer = (
	chunks: readonly string[],
): TableTextBuffer => ({
	kind: "text",
	encoding: "utf8",
	chunks: {
		async *[Symbol.asyncIterator]() {
			let lineStart = 1;
			for (const text of chunks) {
				yield {
					lineStart,
					text,
				};
				lineStart += (text.match(/\r\n|\r|\n/g) ?? []).length;
			}
		},
	},
});
