import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  assessImportedDeviceAnalysisFile,
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

test("assessImportedDeviceAnalysisFile detects transfer metadata on import", async () => {
  const file = new File(
    [
      [
        "SetupTitle,Transfer_DB",
        "TestParameter,Channel.VName,Vg,Vd,Vs",
        "TestParameter,Channel.Func,VAR1,VAR2,CONST",
        "TestParameter,Output.Graph.XAxis.Data,Vg",
        "AnalysisSetup,Analysis.Setup.Vector.Graph.Notes,[VAR1] Unit=SMU3:MP, Name=Vg, Start=-1 V\t[VAR2] Unit=SMU2:MP, Name=Vd, Start=50 mV",
        "DataName,Vg,Id,Ig",
        "DataValue,-1,-2.63E-12,-2.05E-12",
      ].join("\n"),
    ],
    "transfer.csv",
    { type: "text/csv" },
  );

  const result = await assessImportedDeviceAnalysisFile(file);

  assert.equal(result.curveType, "transfer (vg)");
  assert.equal(result.curveTypeConfidence, "high");
  assert.equal(result.curveTypeNeedsTemplate, false);
  assert.equal(result.xAxisRole, "vg");
});

test("assessImportedDeviceAnalysisFile flags stripped CH1/CH2 data for review", async () => {
  const file = new File(
    [
      [
        "Repeat,VAR2,Point,CH1 Voltage,CH1 Current,CH1 Resistance,CH1 Time,CH2 Voltage,CH2 Current,CH2 Time,R",
        "1,1,1,-3.00000E+000,-3.70327E-009,810.09486E+006,125.47200E-003,-60.00000E+000,1.34000E-009,9.64800E-003,810.09486E+006",
        "1,1,2,-2.97001E+000,-3.49041E-009,850.90577E+006,246.44300E-003,-60.00000E+000,1.06200E-009,146.86600E-003,850.90577E+006",
      ].join("\n"),
    ],
    "tran.csv",
    { type: "text/csv" },
  );

  const result = await assessImportedDeviceAnalysisFile(file);

  assert.equal(result.curveType, "unknown");
  assert.equal(result.curveTypeConfidence, "low");
  assert.equal(result.curveTypeNeedsTemplate, true);
  assert.match(result.curveTypeReasons.join(" "), /CH1\/CH2 sweep columns/i);
});
