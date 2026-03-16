import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  isExcelDataImportFileName,
  isSupportedDataImportFileName,
  toCsvCompatibleDataFile,
} from "./deviceAnalysisImportFileUtils.ts";

test("isSupportedDataImportFileName accepts csv/xls/xlsx with case-insensitive suffixes", () => {
  assert.equal(isSupportedDataImportFileName("sample.csv"), true);
  assert.equal(isSupportedDataImportFileName("sample.CSV"), true);
  assert.equal(isSupportedDataImportFileName("sample.xls"), true);
  assert.equal(isSupportedDataImportFileName("sample.XLSX"), true);
  assert.equal(isSupportedDataImportFileName("sample.txt"), false);
  assert.equal(isSupportedDataImportFileName("sample"), false);
});

test("isExcelDataImportFileName only accepts xls/xlsx", () => {
  assert.equal(isExcelDataImportFileName("sample.xls"), true);
  assert.equal(isExcelDataImportFileName("sample.xlsx"), true);
  assert.equal(isExcelDataImportFileName("sample.csv"), false);
});

test("toCsvCompatibleDataFile returns csv file as-is", async () => {
  const csvFile = new File(["A,B\n1,2\n"], "data.csv", {
    type: "text/csv",
    lastModified: 1700000000000,
  });

  const result = await toCsvCompatibleDataFile(csvFile);
  assert.strictEqual(result, csvFile);
});

test("toCsvCompatibleDataFile converts xlsx first sheet to csv text", async () => {
  const workbook = XLSX.utils.book_new();
  const firstSheet = XLSX.utils.aoa_to_sheet([
    ["X", "Y"],
    [1, 2],
  ]);
  const secondSheet = XLSX.utils.aoa_to_sheet([
    ["Unused"],
    [999],
  ]);
  XLSX.utils.book_append_sheet(workbook, firstSheet, "SheetOne");
  XLSX.utils.book_append_sheet(workbook, secondSheet, "SheetTwo");

  const xlsxBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const xlsxFile = new File([xlsxBuffer], "book.xlsx", {
    lastModified: 1700000001234,
  });

  const result = await toCsvCompatibleDataFile(xlsxFile);
  const csvText = await result.text();

  assert.equal(result.name, "book.xlsx");
  assert.equal(result.lastModified, 1700000001234);
  assert.match(csvText, /^X,Y/m);
  assert.match(csvText, /1,2/);
  assert.equal(csvText.includes("Unused"), false);
});

test("toCsvCompatibleDataFile rejects unsupported file extensions", async () => {
  const txtFile = new File(["hello"], "notes.txt", {
    type: "text/plain",
  });

  await assert.rejects(
    () => toCsvCompatibleDataFile(txtFile),
    /Unsupported import file format/,
  );
});
