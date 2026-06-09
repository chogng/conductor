import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import * as xlsx from "xlsx";
import { assessImportedFile } from "../src/cs/workbench/contrib/import/common/importFileUtils.ts";

const ROOT = process.cwd();
const WORKER_FILE_NAME = process.platform === "win32" ? "rs-worker.exe" : "rs-worker";
const DEFAULT_RUST_EXE = path.join(
  ROOT,
  "workers",
  "rs",
  WORKER_FILE_NAME,
);
const CARGO_TARGET_RUST_EXE = path.join(
  ROOT,
  ".build",
  "cache",
  "rs-worker-target",
  "release",
  WORKER_FILE_NAME,
);
const OUTPUT_DIR = path.join(ROOT, ".build", "verify", "rust-xls");
const RUST_CSV_DIR = path.join(OUTPUT_DIR, "rust-csv");
const REPORT_PATH = path.join(OUTPUT_DIR, "report.json");

const NUMERIC_TOLERANCE_ABS = 1e-12;
const NUMERIC_TOLERANCE_REL = 1e-9;

const parseTsvLine = (line) => line.split("\t");

const normalizePathText = (value) => String(value ?? "").replace(/\//g, "\\");

const parseCsvRows = (csvText) => {
  const parsed = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: false,
  });
  return Array.isArray(parsed?.data) ? parsed.data : [];
};

const toJsCsv = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const workbook = xlsx.read(buffer, {
    type: "buffer",
    cellDates: false,
    cellNF: false,
    cellStyles: false,
    cellText: false,
    dense: true,
    raw: false,
  });
  const firstSheetName = String(workbook?.SheetNames?.[0] ?? "").trim();
  if (!firstSheetName) throw new Error("workbook has no sheet");
  return xlsx.utils.sheet_to_csv(workbook.Sheets[firstSheetName], {
    blankrows: false,
    FS: ",",
    RS: "\n",
  });
};

const isNumericEquivalent = (leftRaw, rightRaw) => {
  const leftText = String(leftRaw ?? "").trim();
  const rightText = String(rightRaw ?? "").trim();
  if (!leftText && !rightText) return true;
  if (!leftText || !rightText) return false;
  const left = Number(leftText);
  const right = Number(rightText);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  const delta = Math.abs(left - right);
  const tolerance = Math.max(
    NUMERIC_TOLERANCE_ABS,
    Math.max(Math.abs(left), Math.abs(right)) * NUMERIC_TOLERANCE_REL,
  );
  return delta <= tolerance;
};

const compareRows = (jsRows, rustRows) => {
  const rowCountMatches = jsRows.length === rustRows.length;
  let jsCells = 0;
  let rustCells = 0;
  let exactMatches = 0;
  let maxNumericAbsError = 0;
  let maxNumericRelError = 0;
  let numericMatches = 0;
  let numericMismatches = 0;
  let textMismatches = 0;
  let mismatches = 0;
  const examples = [];
  const maxRows = Math.max(jsRows.length, rustRows.length);

  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const jsRow = Array.isArray(jsRows[rowIndex]) ? jsRows[rowIndex] : [];
    const rustRow = Array.isArray(rustRows[rowIndex]) ? rustRows[rowIndex] : [];
    jsCells += jsRow.length;
    rustCells += rustRow.length;
    const maxCols = Math.max(jsRow.length, rustRow.length);

    for (let colIndex = 0; colIndex < maxCols; colIndex += 1) {
      const left = jsRow[colIndex] ?? "";
      const right = rustRow[colIndex] ?? "";
      const leftText = String(left ?? "");
      const rightText = String(right ?? "");
      if (leftText === rightText) {
        exactMatches += 1;
        continue;
      }
      if (isNumericEquivalent(leftText, rightText)) {
        numericMatches += 1;
        continue;
      }
      const leftNumber = Number(leftText.trim());
      const rightNumber = Number(rightText.trim());
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        const absError = Math.abs(leftNumber - rightNumber);
        const relError =
          absError / Math.max(Math.abs(leftNumber), Math.abs(rightNumber), 1);
        maxNumericAbsError = Math.max(maxNumericAbsError, absError);
        maxNumericRelError = Math.max(maxNumericRelError, relError);
        numericMismatches += 1;
      } else {
        textMismatches += 1;
      }
      mismatches += 1;
      if (examples.length < 8) {
        examples.push({
          col: colIndex + 1,
          js: leftText.slice(0, 120),
          row: rowIndex + 1,
          rust: rightText.slice(0, 120),
        });
      }
    }
  }

  return {
    exactMatches,
    examples,
    jsCells,
    maxNumericAbsError,
    maxNumericRelError,
    mismatches,
    numericMatches,
    numericMismatches,
    rowCountMatches,
    rustCells,
    textMismatches,
  };
};

const assessCsvText = async (csvText, fileName) => {
  const file = new File([csvText], fileName, {
    type: "text/csv;charset=utf-8",
  });
  return await assessImportedFile(file);
};

const main = async () => {
  const rustExe = process.env.RUST_XLS_BENCH_EXE || DEFAULT_RUST_EXE;
  const rsWorkerExe = fs.existsSync(CARGO_TARGET_RUST_EXE) ? CARGO_TARGET_RUST_EXE : rustExe;
  if (!fs.existsSync(rsWorkerExe)) {
    throw new Error(`Built rs-worker was not found: ${rustExe} or ${CARGO_TARGET_RUST_EXE}`);
  }

  fs.rmSync(OUTPUT_DIR, { force: true, recursive: true });
  fs.mkdirSync(RUST_CSV_DIR, { recursive: true });

  const rustRun = spawnSync(rsWorkerExe, ["--threads", "2", "--write-dir", RUST_CSV_DIR], {
    cwd: path.dirname(rsWorkerExe),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  process.stdout.write(rustRun.stdout ?? "");
  process.stderr.write(rustRun.stderr ?? "");
  if (rustRun.status !== 0) {
    throw new Error(`rs-worker failed with exit code ${rustRun.status}`);
  }

  const manifestPath = path.join(RUST_CSV_DIR, "manifest.tsv");
  const manifestText = fs.readFileSync(manifestPath, "utf8");
  const lines = manifestText.trimEnd().split(/\r?\n/).slice(1);
  const entries = lines.map((line) => {
    const [
      index,
      sourcePath,
      csvPath,
      rows,
      cells,
      numericCells,
      csvBytes,
      convertMs,
    ] = parseTsvLine(line);
    return {
      cells: Number(cells),
      convertMs: Number(convertMs),
      csvBytes: Number(csvBytes),
      csvPath,
      index: Number(index),
      numericCells: Number(numericCells),
      rows: Number(rows),
      sourcePath: normalizePathText(sourcePath),
    };
  });

  const failures = [];
  const summaries = [];

  for (const [entryIndex, entry] of entries.entries()) {
    const jsCsv = toJsCsv(entry.sourcePath);
    const rustCsv = fs.readFileSync(entry.csvPath, "utf8");
    const jsRows = parseCsvRows(jsCsv);
    const rustRows = parseCsvRows(rustCsv);
    const comparison = compareRows(jsRows, rustRows);
    const jsAssessment = await assessCsvText(jsCsv, path.basename(entry.sourcePath));
    const rustAssessment = await assessCsvText(rustCsv, path.basename(entry.sourcePath));
    const classificationMatches =
      jsAssessment.curveType === rustAssessment.curveType &&
      jsAssessment.curveTypeConfidence === rustAssessment.curveTypeConfidence &&
      jsAssessment.xAxisRole === rustAssessment.xAxisRole &&
      jsAssessment.xAxisRoleSource === rustAssessment.xAxisRoleSource;
    const passed =
      comparison.rowCountMatches &&
      comparison.jsCells === comparison.rustCells &&
      comparison.textMismatches === 0 &&
      classificationMatches;

    const summary = {
      classificationMatches,
      comparison,
      file: entry.sourcePath,
      jsAssessment,
      jsBytes: Buffer.byteLength(jsCsv),
      passed,
      rustAssessment,
      rustBytes: Buffer.byteLength(rustCsv),
    };
    summaries.push(summary);
    if (!passed) failures.push(summary);

    if ((entryIndex + 1) % 25 === 0 || entryIndex === entries.length - 1) {
      console.log(`[compat] checked ${entryIndex + 1}/${entries.length}`);
    }
  }

  const totals = summaries.reduce(
    (acc, summary) => {
      acc.exactMatches += summary.comparison.exactMatches;
      acc.files += 1;
      acc.jsBytes += summary.jsBytes;
      acc.maxNumericAbsError = Math.max(
        acc.maxNumericAbsError,
        summary.comparison.maxNumericAbsError,
      );
      acc.maxNumericRelError = Math.max(
        acc.maxNumericRelError,
        summary.comparison.maxNumericRelError,
      );
      acc.mismatches += summary.comparison.mismatches;
      acc.numericMatches += summary.comparison.numericMatches;
      acc.numericMismatches += summary.comparison.numericMismatches;
      acc.passed += summary.passed ? 1 : 0;
      acc.rustBytes += summary.rustBytes;
      acc.textMismatches += summary.comparison.textMismatches;
      return acc;
    },
    {
      exactMatches: 0,
      files: 0,
      jsBytes: 0,
      maxNumericAbsError: 0,
      maxNumericRelError: 0,
      mismatches: 0,
      numericMatches: 0,
      numericMismatches: 0,
      passed: 0,
      rustBytes: 0,
      textMismatches: 0,
    },
  );

  const report = {
    failures: failures.slice(0, 20),
    totals,
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log("\n[compat summary]");
  console.log(`files=${totals.files} passed=${totals.passed} failed=${failures.length}`);
  console.log(`jsBytes=${totals.jsBytes} rustBytes=${totals.rustBytes}`);
  console.log(`exactMatches=${totals.exactMatches} numericEquivalent=${totals.numericMatches} numericFormatDiffs=${totals.numericMismatches} textMismatches=${totals.textMismatches}`);
  console.log(`maxNumericAbsError=${totals.maxNumericAbsError} maxNumericRelError=${totals.maxNumericRelError}`);
  console.log(`report=${REPORT_PATH}`);

  if (failures.length) {
    for (const failure of failures.slice(0, 5)) {
      console.log(`\n[compat failure] ${failure.file}`);
      console.log(JSON.stringify({
        comparison: failure.comparison,
        jsAssessment: failure.jsAssessment,
        rustAssessment: failure.rustAssessment,
      }, null, 2));
    }
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
