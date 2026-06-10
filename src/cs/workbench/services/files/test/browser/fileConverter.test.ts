/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  convertImportFile,
  loadConvertedCsvFile,
} from "src/cs/workbench/services/files/browser/fileConverter";
import type {
  FileConverterBackend,
} from "src/cs/workbench/services/files/common/fileConverterBackend";

suite("workbench/services/files/test/browser/fileConverter", () => {
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
