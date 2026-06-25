/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "src/cs/base/common/uri";
import {
  TableFileFormatService,
} from "src/cs/workbench/services/table/common/tableFileFormat";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/table/test/common/tableFileFormat", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("recognizes supported table resources by URI or name", () => {
    const service = new TableFileFormatService();

    assert.equal(service.canHandle(URI.file("/data/transfer.csv")), true);
    assert.equal(service.canHandle(URI.file("/data/transfer.tsv")), true);
    assert.equal(service.canHandle(URI.file("/data/workbook.xls")), true);
    assert.equal(service.canHandle(URI.file("/data/workbook.xlsx")), true);
    assert.equal(service.canHandle("TRANSFER.CSV"), true);
  });

  test("rejects unsupported and extension-only resources", () => {
    const service = new TableFileFormatService();

    assert.equal(service.canHandle(URI.file("/data/notes.txt")), false);
    assert.equal(service.canHandle(URI.file("/data/image.png")), false);
    assert.equal(service.canHandle(URI.file("/data/.csv")), false);
    assert.equal(service.canHandle("sample"), false);
  });

  test("classifies delimited text and Excel formats", () => {
    const service = new TableFileFormatService();

    assert.equal(service.isDelimitedText("transfer.csv"), true);
    assert.equal(service.isDelimitedText("transfer.tsv"), true);
    assert.equal(service.isExcel("transfer.tsv"), false);
    assert.equal(service.isExcel("workbook.xlsx"), true);
    assert.equal(service.isXlsx("workbook.xlsx"), true);
  });
});
