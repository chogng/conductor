/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  convertImportFile,
  convertPreparedImportFileResultSync,
  loadConvertedCsvFile,
} from "src/cs/workbench/services/files/browser/fileConverter";
import type {
  FileConverterBackend,
} from "src/cs/workbench/services/files/common/fileConverterBackend";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/files/test/browser/fileConverter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("converts browser CSV files without assessment semantics", async () => {
    const file = new File(["a,b\n1,2"], "sample.csv", {
      lastModified: 123,
      type: "text/csv",
    });

    const result = await convertImportFile(
      createFileConverterBackendStub(),
      file,
      { kind: "data" },
      {
        fileName: "sample.csv",
        lastModified: 123,
        size: file.size,
      },
    );

    assert.equal(result.file, file);
    assert.equal(result.normalizedCsvPath, null);
    assert.equal(result.normalizedSizeBytes, file.size);
    assert.equal(result.sourceName, "sample.csv");
  });

  test("loads normalized CSV artifacts through the conversion boundary", async () => {
    const service = createFileConverterBackendStub({
      canReadConvertedCsv: () => true,
      readConvertedCsv: async () => ({
        csvText: "x,y\n1,2",
        ok: true,
      }),
    });

    const loaded = await loadConvertedCsvFile({
      convertedCsvReaderService: service,
      fileName: "converted.csv",
      lastModified: 456,
      normalizedCsvPath: "C:/tmp/converted.csv",
    });

    assert.ok(loaded);
    assert.equal(loaded.name, "converted.csv");
    assert.equal(await loaded.text(), "x,y\n1,2");
  });

  test("does not fall back to raw file text when normalized CSV cannot be read", async () => {
    const fallbackFile = new File(["PK\u0003\u0004"], "Output_Vd.csv", {
      lastModified: 123,
      type: "text/csv",
    });
    const service = createFileConverterBackendStub({
      canReadConvertedCsv: () => true,
      readConvertedCsv: async () => ({
        ok: false,
      }),
    });

    const loaded = await loadConvertedCsvFile({
      convertedCsvReaderService: service,
      fallbackFile,
      fileName: "Output_Vd.csv",
      lastModified: 123,
      normalizedCsvPath: "C:/tmp/Output_Vd.csv",
    });

    assert.equal(loaded, null);
  });

  test("marks unreadable prepared normalized CSV as decode failed", async () => {
    const service = createFileConverterBackendStub({
      canPrepareFile: () => true,
      prepareFile: async () => ({
        normalizedCsvPath: "C:/tmp/Output_Vd.csv",
        ok: true,
      }),
      canReadConvertedCsv: () => true,
      readConvertedCsv: async () => ({
        ok: false,
      }),
    });

    const result = await convertImportFile(
      service,
      null,
      { kind: "path", path: "C:/data/Output_Vd.csv" },
      {
        fileName: "Output_Vd.csv",
        lastModified: 123,
        size: 8,
      },
    );

    assert.equal(result.health?.state, "decodeFailed");
    assert.equal(result.templateEligibility, "notEligible");
  });

  test("falls back to loading CSV path contents when native prepare has no normalized CSV", async () => {
    const sourceFile = new File(["Vg,Id\n0,1e-9"], "2.csv", {
      lastModified: 123,
      type: "text/csv",
    });
    const service = createFileConverterBackendStub({
      canPrepareFile: () => true,
      prepareFile: async () => ({
        ok: true,
        sourcePath: "C:/data/293K/OUTPUT/2.csv",
      }),
    });

    const result = await convertImportFile(
      service,
      null,
      { kind: "path", path: "C:/data/293K/OUTPUT/2.csv" },
      {
        fileName: "2.csv",
        lastModified: 123,
        loadFile: async () => sourceFile,
        size: sourceFile.size,
      },
    );

    assert.equal(result.normalizedCsvPath, null);
    assert.equal(result.sourcePath, "C:/data/293K/OUTPUT/2.csv");
    assert.equal(await result.file.text(), "Vg,Id\n0,1e-9");
  });

  test("passes prepared sheet metadata through the conversion boundary", async () => {
    const service = createFileConverterBackendStub({
      canPrepareFile: () => true,
      prepareFile: async () => ({
        normalizedCsvPath: "C:/tmp/workbook.csv",
        ok: true,
        sheets: [
          {
            csvText: "a,b\n1,2",
            sheetIndex: 0,
            sheetName: "Forward",
          },
          {
            normalizedCsvPath: "C:/tmp/reverse.csv",
            rowCount: 2,
            columnCount: 2,
            sheetIndex: 1,
            sheetName: "Reverse",
          },
        ],
      }),
    });

    const result = await convertImportFile(
      service,
      null,
      { kind: "path", path: "C:/data/Workbook.xlsx" },
      {
        fileName: "Workbook.xlsx",
        lastModified: 123,
        size: 24,
      },
    );

    assert.equal(result.sheets?.length, 2);
    assert.equal(result.sheets?.[0]?.sheetName, "Forward");
    assert.equal(result.sheets?.[1]?.normalizedCsvPath, "C:/tmp/reverse.csv");
  });

  test("converts healthy prepared native CSV metadata without async validation", () => {
    const service = createFileConverterBackendStub();
    const result = convertPreparedImportFileResultSync({
      fileConverterBackend: service,
      metadata: {
        fileName: "native.csv",
        lastModified: 123,
        size: 1024,
      },
      result: {
        columnCount: 2,
        health: {
          state: "ok",
          message: "",
        },
        normalizedCsvPath: "C:/data/native.csv",
        ok: true,
        rowCount: 8,
        templateEligibility: "eligible",
      },
      sourcePath: "C:/data/native.csv",
    });

    assert.ok(result);
    assert.equal(result.file.size, 0);
    assert.equal(result.normalizedCsvPath, "C:/data/native.csv");
    assert.equal(result.health?.state, "ok");
    assert.equal(result.templateEligibility, "eligible");
    assert.equal(result.rowCount, 8);
    assert.equal(result.columnCount, 2);
  });
});

const createFileConverterBackendStub = (
  overrides: Partial<FileConverterBackend> = {},
): FileConverterBackend => ({
  canPrepareFile: () => false,
  prepareFile: async () => ({
    ok: false,
  }),
  canReadConvertedCsv: () => false,
  readConvertedCsv: async () => ({
    ok: false,
  }),
  ...overrides,
});
