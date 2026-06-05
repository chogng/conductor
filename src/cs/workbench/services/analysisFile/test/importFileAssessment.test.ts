import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  isExcelImportFileName,
  isSupportedImportFileName,
  isXlsxImportFileName,
} from "../../../contrib/files/common/files.ts";
import {
  assessImportFile,
} from "../browser/fileAssessment.ts";

const fixturePath = (fileName: string): string =>
  path.join(
    process.cwd(),
    "src",
    "cs",
    "workbench",
    "services",
    "analysisFile",
    "test",
    "fixtures",
    fileName,
  );

const readFixtureFile = async (
  fileName: string,
  type: string,
): Promise<File> => {
  const bytes = await readFile(fixturePath(fileName));
  return new File([new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)], fileName, {
    lastModified: 0,
    type,
  });
};

test("isSupportedImportFileName accepts csv/xls/xlsx with case-insensitive suffixes", () => {
  assert.equal(isSupportedImportFileName("sample.csv"), true);
  assert.equal(isSupportedImportFileName("sample.CSV"), true);
  assert.equal(isSupportedImportFileName("sample.xls"), true);
  assert.equal(isSupportedImportFileName("sample.XLSX"), true);
  assert.equal(isSupportedImportFileName("sample.txt"), false);
  assert.equal(isSupportedImportFileName("sample"), false);
});

test("isExcelImportFileName only accepts xls/xlsx", () => {
  assert.equal(isExcelImportFileName("sample.xls"), true);
  assert.equal(isExcelImportFileName("sample.xlsx"), true);
  assert.equal(isExcelImportFileName("sample.csv"), false);
});

test("import fixtures provide csv, xls, and xlsx source files", async () => {
  const csvFile = await readFixtureFile("transfer.csv", "text/csv;charset=utf-8");
  const xlsFile = await readFixtureFile("transfer.xls", "application/vnd.ms-excel");
  const xlsxFile = await readFixtureFile(
    "transfer.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );

  assert.equal(isSupportedImportFileName(csvFile.name), true);
  assert.equal(isSupportedImportFileName(xlsFile.name), true);
  assert.equal(isSupportedImportFileName(xlsxFile.name), true);
  assert.equal(isExcelImportFileName(csvFile.name), false);
  assert.equal(isExcelImportFileName(xlsFile.name), true);
  assert.equal(isExcelImportFileName(xlsxFile.name), true);
  assert.equal(isXlsxImportFileName(xlsFile.name), false);
  assert.equal(isXlsxImportFileName(xlsxFile.name), true);

  const xlsxBytes = new Uint8Array(await xlsxFile.arrayBuffer());
  assert.equal(String.fromCharCode(xlsxBytes[0], xlsxBytes[1]), "PK");
});

test("assessImportFile detects transfer metadata on import", async () => {
  const file = await readFixtureFile("transfer.csv", "text/csv;charset=utf-8");

  const result = await assessImportFile(file);

  assert.equal(result.curveType, "transfer (vg)");
  assert.equal(result.curveTypeConfidence, "high");
  assert.equal(result.curveTypeNeedsTemplate, false);
  assert.equal(result.xAxisRole, "vg");
});

test("assessImportFile infers output from stripped CH1/CH2 data when shape evidence is strong", async () => {
  const file = new File(
    [
      [
        "Repeat,VAR2,Point,CH1 Voltage,CH1 Current,CH1 Resistance,CH1 Time,CH2 Voltage,CH2 Current,CH2 Time,R",
        "1,1,1,-3.00000E+000,-1.00000E-012,810.09486E+006,125.47200E-003,-60.00000E+000,1.00000E-009,9.64800E-003,810.09486E+006",
        "1,1,2,-2.00000E+000,-1.00000E-010,850.90577E+006,246.44300E-003,-60.00000E+000,1.10000E-009,146.86600E-003,850.90577E+006",
        "1,1,3,-1.00000E+000,-1.00000E-008,963.61533E+006,367.26100E-003,-60.00000E+000,1.20000E-009,267.67400E-003,963.61533E+006",
        "1,1,4,0.00000E+000,-1.00000E-007,981.84432E+006,488.05500E-003,-60.00000E+000,1.10000E-009,388.45600E-003,981.84432E+006",
      ].join("\n"),
    ],
    "tran.csv",
    { type: "text/csv" },
  );

  const result = await assessImportFile(file);

  assert.equal(result.curveType, "output (vd)");
  assert.equal(result.curveTypeConfidence, "medium");
  assert.equal(result.curveTypeNeedsTemplate, false);
  assert.equal(result.xAxisRole, "vd");
  assert.match(result.curveTypeReasons.join(" "), /output-style Id-Vd behavior/i);
});

test("assessImportFile treats transient transfer CSV headers as transfer metadata", async () => {
  const rows = [
    ["2026-04-21-19-10-07_(MOS_IV_Transient_DC_Sweep)Id", "Ig_vg@ vs=0.0"],
    ["vg(V)", "id(-0.1)", "vg(V)", "ig(-0.1)", "vg(V)", "id(-1.0)", "vg(V)", "ig(-1.0)"],
    ["-3.0", "-1.5e-4", "-3.0", "-6.3e-11", "-3.0", "-1.5e-3", "-3.0", "-6.6e-11"],
    ["-2.94", "-1.5e-4", "-2.94", "-6.0e-11", "-2.94", "-1.5e-3", "-2.94", "-6.3e-11"],
  ];
  const file = new File([rows.map((row) => row.join(",")).join("\n")], "1-TRANS.csv", {
    type: "text/csv;charset=utf-8",
  });

  const result = await assessImportFile(file);

  assert.equal(result.curveType, "transfer (vg)");
  assert.equal(result.curveTypeConfidence, "high");
  assert.equal(result.curveTypeNeedsTemplate, false);
  assert.equal(result.xAxisRole, "vg");
});
