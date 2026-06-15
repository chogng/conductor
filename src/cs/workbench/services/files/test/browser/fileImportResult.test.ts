/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  createImportedFileRecord,
} from "src/cs/workbench/services/files/browser/fileConverter";
import {
  createFileImportResultFromRecords,
} from "src/cs/workbench/services/files/common/files";

suite("workbench/services/files/test/browser/fileConverter import records", () => {
  test("creates inline raw table records from mixed CSV fixtures", async () => {
    const file = await readFixtureFile("csv/mixed-types.csv", {
      lastModified: 123,
      name: "mixed-types.csv",
      type: "text/csv",
    });

    const record = await createImportedFileRecord({
      file,
      fileId: "file-a",
      fileName: "mixed-types.csv",
      rawKey: "folder/mixed-types.csv::fixture::123",
      relativePath: "folder/mixed-types.csv",
      sourcePath: "C:/data/mixed-types.csv",
      sourceSizeBytes: 24,
    });

    const table = record.raw.rawTablesById["file-a"];
    assert.equal(record.kind, "csv");
    assert.equal(record.raw.rawFile, file);
    assert.equal(record.raw.filePath, "C:/data/mixed-types.csv");
    assert.equal(record.raw.rawKey, "folder/mixed-types.csv::fixture::123");
    assert.equal(record.raw.relativePath, "folder/mixed-types.csv");
    assert.equal(record.raw.size, 24);
    assert.equal(table.rowCount, 6);
    assert.equal(table.columnCount, 7);
    assert.deepEqual(table.rows, {
      kind: "inline",
      values: [
        ["Label", "Number", "Date", "Boolean", "Scientific", "FormulaLike", "Notes"],
        ["plain text", "42.5", "2024-01-31", "TRUE", "1.23E-7", "=SUM(A2:A3)", "contains, comma"],
        ["quoted\nnewline", "-7", "2024/02/29", "FALSE", "6.022E23", "+notFormula", "contains \"quote\""],
        ["中文", "0", "", "true", "0.000001", "@literal", ""],
        ["", "", "2025-12-01", "false", "-3.5e-4", "-notFormula", "trailing empty"],
        [""],
      ],
    });
    assert.deepEqual(table.source, {
      kind: "csv",
      originalPath: "C:/data/mixed-types.csv",
    });
  });

  test("strips UTF-8 BOM headers from CSV fixtures", async () => {
    const file = await readFixtureFile("csv/utf8-bom.csv", {
      lastModified: 123,
      name: "utf8-bom.csv",
      type: "text/csv",
    });

    const record = await createImportedFileRecord({
      file,
      fileId: "file-bom",
      fileName: "utf8-bom.csv",
    });

    const table = record.raw.rawTablesById["file-bom"];
    assert.equal(table.rows.kind, "inline");
    assert.deepEqual(table.rows.values[0], ["Name", "Value", "Comment"]);
    assert.deepEqual(table.rows.values[3], [""]);
  });

  test("uses normalized CSV row stores when a normalized path is available", async () => {
    const file = new File(["Vg,Id\n0,1e-9"], "Transfer.xlsx", {
      lastModified: 123,
      type: "text/csv",
    });

    const record = await createImportedFileRecord({
      file,
      fileId: "file-a",
      fileName: "Transfer.xlsx",
      normalizedCsvPath: "C:/tmp/transfer.csv",
    });
    const result = createFileImportResultFromRecords([record], {
      createdAt: 456,
    });

    const table = record.raw.rawTablesById["file-a"];
    assert.equal(record.kind, "excel");
    assert.deepEqual(result, {
      createdAt: 456,
      diagnostics: [],
      files: [record],
    });
    assert.deepEqual(table.rows, {
      formatVersion: 1,
      kind: "normalizedCsv",
      normalizedCsvPath: "C:/tmp/transfer.csv",
    });
    assert.deepEqual(table.source, {
      kind: "excelSheet",
      originalPath: null,
      sheetIndex: 0,
      sheetName: null,
    });
  });

  test("creates one raw table per imported Excel sheet", async () => {
    const file = new File([""], "Workbook.xlsx", {
      lastModified: 123,
      type: "text/csv",
    });

    const record = await createImportedFileRecord({
      file,
      fileId: "file-a",
      fileName: "Workbook.xlsx",
      sourcePath: "C:/data/Workbook.xlsx",
      tables: [
        {
          rawTableId: "sheet-forward",
          rows: [["Vg", "Id"], ["0", "1"]],
          sheetIndex: 0,
          sheetName: "Forward",
        },
        {
          columnCount: 2,
          maxCellLengths: [2, 4],
          normalizedCsvPath: "C:/tmp/reverse.csv",
          rawTableId: "sheet-reverse",
          rowCount: 2,
          sheetIndex: 1,
          sheetName: "Reverse",
        },
      ],
    });

    assert.deepEqual(record.raw.rawTableOrder, ["sheet-forward", "sheet-reverse"]);
    assert.deepEqual(record.raw.rawTablesById["sheet-forward"].source, {
      kind: "excelSheet",
      originalPath: "C:/data/Workbook.xlsx",
      sheetIndex: 0,
      sheetName: "Forward",
    });
    assert.deepEqual(record.raw.rawTablesById["sheet-reverse"].rows, {
      formatVersion: 1,
      kind: "normalizedCsv",
      normalizedCsvPath: "C:/tmp/reverse.csv",
    });
    assert.equal(record.raw.rawTablesById["sheet-reverse"].rowCount, 2);
    assert.equal(record.raw.rawTablesById["sheet-reverse"].columnCount, 2);
  });

  test("keeps root workbook fixtures inside the Excel import boundary", async () => {
    const xlsx = await readFixtureFile("xlsx/mixed-types.xlsx", {
      lastModified: 123,
      name: "mixed-types.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const xls = await readFixtureFile("xls/legacy-mixed-types.xls", {
      lastModified: 123,
      name: "legacy-mixed-types.xls",
      type: "application/vnd.ms-excel",
    });

    const xlsxRecord = await createImportedFileRecord({
      file: xlsx,
      fileId: "xlsx-fixture",
      fileName: "mixed-types.xlsx",
      sourcePath: "C:/data/mixed-types.xlsx",
      tables: [
        {
          csvText: "Label,Number\nplain text,42.5\n中文,0",
          rawTableId: "xlsx-fixture:sheet-1",
          sheetIndex: 0,
          sheetName: "Mixed Types",
        },
        {
          columnCount: 4,
          maxCellLengths: [5, 12, 5, 15],
          normalizedCsvPath: "C:/tmp/mixed-types-sparse.csv",
          rawTableId: "xlsx-fixture:sheet-2",
          rowCount: 6,
          sheetIndex: 1,
          sheetName: "Sparse Sheet",
        },
      ],
    });
    const xlsRecord = await createImportedFileRecord({
      file: xls,
      fileId: "xls-fixture",
      fileName: "legacy-mixed-types.xls",
      sourcePath: "C:/data/legacy-mixed-types.xls",
      tables: [
        {
          csvText: "Label,Number\nplain text,42.5",
          sheetIndex: 0,
          sheetName: "Sheet1",
        },
      ],
    });

    assert.equal(xlsx.size > 0, true);
    assert.equal(xls.size > 0, true);
    assert.equal(xlsxRecord.kind, "excel");
    assert.equal(xlsRecord.kind, "excel");
    assert.deepEqual(xlsxRecord.raw.rawTableOrder, [
      "xlsx-fixture:sheet-1",
      "xlsx-fixture:sheet-2",
    ]);
    assert.deepEqual(xlsxRecord.raw.rawTablesById["xlsx-fixture:sheet-1"].source, {
      kind: "excelSheet",
      originalPath: "C:/data/mixed-types.xlsx",
      sheetIndex: 0,
      sheetName: "Mixed Types",
    });
    assert.deepEqual(xlsxRecord.raw.rawTablesById["xlsx-fixture:sheet-2"].rows, {
      formatVersion: 1,
      kind: "normalizedCsv",
      normalizedCsvPath: "C:/tmp/mixed-types-sparse.csv",
    });
    assert.deepEqual(xlsRecord.raw.rawTablesById["xls-fixture"].source, {
      kind: "excelSheet",
      originalPath: "C:/data/legacy-mixed-types.xls",
      sheetIndex: 0,
      sheetName: "Sheet1",
    });
  });
});

const fixtureRoot = path.resolve(process.cwd(), "test/fixtures/data-import");

const readFixtureFile = async (
  relativePath: string,
  options: {
    readonly lastModified: number;
    readonly name: string;
    readonly type: string;
  },
): Promise<File> => {
  const bytes = await readFile(path.join(fixtureRoot, relativePath));
  return new File([bytes], options.name, {
    lastModified: options.lastModified,
    type: options.type,
  });
};
