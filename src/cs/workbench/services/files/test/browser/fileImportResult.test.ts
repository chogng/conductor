/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  createImportedFileRecord,
} from "src/cs/workbench/services/files/browser/fileConverter";
import {
  createFileImportResultFromRecords,
} from "src/cs/workbench/services/files/common/files";

suite("workbench/services/files/test/browser/fileConverter import records", () => {
  test("creates inline raw table records from imported CSV files", async () => {
    const file = new File(["Vg,Id\n0,1e-9"], "Transfer.csv", {
      lastModified: 123,
      type: "text/csv",
    });

    const record = await createImportedFileRecord({
      file,
      fileId: "file-a",
      fileName: "Transfer.csv",
      rawKey: "folder/Transfer.csv::24::123",
      relativePath: "folder/Transfer.csv",
      sourcePath: "C:/data/Transfer.csv",
      sourceSizeBytes: 24,
    });

    const table = record.raw.rawTablesById["file-a"];
    assert.equal(record.kind, "csv");
    assert.equal(record.raw.rawFile, file);
    assert.equal(record.raw.filePath, "C:/data/Transfer.csv");
    assert.equal(record.raw.rawKey, "folder/Transfer.csv::24::123");
    assert.equal(record.raw.relativePath, "folder/Transfer.csv");
    assert.equal(record.raw.size, 24);
    assert.equal(table.rowCount, 2);
    assert.equal(table.columnCount, 2);
    assert.deepEqual(table.maxCellLengths, [2, 4]);
    assert.deepEqual(table.rows, {
      kind: "inline",
      values: [["Vg", "Id"], ["0", "1e-9"]],
    });
    assert.deepEqual(table.source, {
      kind: "csv",
      originalPath: "C:/data/Transfer.csv",
    });
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
});
