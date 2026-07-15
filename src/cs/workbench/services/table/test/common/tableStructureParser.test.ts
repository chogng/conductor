/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
	createZipBuffer,
	type ZipEntry,
} from "src/cs/base/common/zip";
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

	test("parses xlsx self-closing cells and date styles without shifting columns", async () => {
		const result = await parseTableStructure({
			buffer: createTableByteBuffer(createXlsxBuffer([{
				name: "Sparse",
				rowsXml: [
					'<x:row r="1">',
					'<x:c r="A1" t="str"><x:v>Id</x:v></x:c>',
					'<x:c r="B1" t="str"><x:v>Empty Column</x:v></x:c>',
					'<x:c r="C1" t="str"><x:v>Value</x:v></x:c>',
					'<x:c r="D1" t="str"><x:v>Comment</x:v></x:c>',
					"</x:row>",
					'<x:row r="2">',
					'<x:c r="A2" t="str"><x:v>row-1</x:v></x:c>',
					'<x:c r="B2" />',
					'<x:c r="C2" t="n"><x:v>1</x:v></x:c>',
					'<x:c r="D2" t="str"><x:v>first</x:v></x:c>',
					"</x:row>",
					'<x:row r="3">',
					'<x:c r="A3" t="str"><x:v>date</x:v></x:c>',
					'<x:c r="B3" s="1" t="n"><x:v>45322</x:v></x:c>',
					'<x:c r="C3" />',
					'<x:c r="D3" t="str"><x:v>after empty</x:v></x:c>',
					"</x:row>",
				].join(""),
			}])),
			format: "xlsx",
		});

		assert.deepEqual(result.diagnostics, []);
		assert.deepEqual(result.content?.rows, [
			["Id", "Empty Column", "Value", "Comment"],
			["row-1", "", "1", "first"],
			["date", "2024-01-31", "", "after empty"],
		]);
		assert.equal(result.sheets[0]?.sheetName, "Sparse");
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

	test("emits stable content fingerprints while parsing", async () => {
		const parse = (text: string) => parseTableStructure({
			buffer: createTableTextBuffer(text, "utf8"),
			format: "csv",
		});
		const first = await parse("Vg,Id\n0,1\n1,2");
		const same = await parse("Vg,Id\n0,1\n1,2");
		const changed = await parse("Vg,Id\n0,1\n2,3");

		assert.ok(first.content?.contentFingerprint);
		assert.equal(first.content?.contentFingerprint, same.content?.contentFingerprint);
		assert.notEqual(first.content?.contentFingerprint, changed.content?.contentFingerprint);
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

const createXlsxBuffer = (
	sheets: readonly { readonly name: string; readonly rowsXml: string }[],
): Uint8Array => {
	const entries: ZipEntry[] = [{
		path: "xl/workbook.xml",
		contents: [
			'<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
			"<x:sheets>",
			...sheets.map((sheet, index) =>
				`<x:sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}" />`
			),
			"</x:sheets>",
			"</x:workbook>",
		].join(""),
	}, {
		path: "xl/_rels/workbook.xml.rels",
		contents: [
			'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
			...sheets.map((_, index) =>
				`<Relationship Id="rId${index + 1}" Target="worksheets/sheet${index + 1}.xml" />`
			),
			"</Relationships>",
		].join(""),
	}, {
		path: "xl/styles.xml",
		contents: [
			'<x:styleSheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
			'<x:numFmts count="1"><x:numFmt numFmtId="200" formatCode="yyyy-mm-dd" /></x:numFmts>',
			'<x:cellXfs count="2">',
			'<x:xf numFmtId="0" />',
			'<x:xf numFmtId="200" applyNumberFormat="1" />',
			"</x:cellXfs>",
			"</x:styleSheet>",
		].join(""),
	}];

	for (let index = 0; index < sheets.length; index += 1) {
		entries.push({
			path: `xl/worksheets/sheet${index + 1}.xml`,
			contents: [
				'<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
				"<x:sheetData>",
				sheets[index]!.rowsXml,
				"</x:sheetData>",
				"</x:worksheet>",
			].join(""),
		});
	}

	return createZipBuffer(entries);
};

const escapeXml = (value: string): string =>
	value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

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
