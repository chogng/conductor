/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  createFileImportResultFromRecords,
  createImportedFileRecord,
} from "src/cs/workbench/services/files/browser/fileImportResult";

suite("workbench/services/files/test/browser/fileImportResult", () => {
  test("creates inline raw table records from imported CSV files", async () => {
    const file = new File(["Vg,Id\n0,1e-9"], "Transfer.csv", {
      lastModified: 123,
      type: "text/csv",
    });

    const record = await createImportedFileRecord({
      file,
      fileId: "file-a",
      fileName: "Transfer.csv",
      relativePath: "folder/Transfer.csv",
      sourcePath: "C:/data/Transfer.csv",
      sourceSizeBytes: 24,
    });

    const table = record.raw.rawTablesById["file-a"];
    assert.equal(record.kind, "csv");
    assert.equal(record.raw.rawFile, file);
    assert.equal(record.raw.filePath, "C:/data/Transfer.csv");
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
});
