import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import * as xlsx from "xlsx";

const cases = [
  {
    name: "current raw:false",
    read: { cellDates: false, raw: false, type: "buffer" },
    csv: { blankrows: false, FS: ",", RS: "\n" },
  },
  {
    name: "raw:true",
    read: { cellDates: false, raw: true, type: "buffer" },
    csv: { blankrows: false, FS: ",", RS: "\n" },
  },
  {
    name: "dense raw:true",
    read: { cellDates: false, dense: true, raw: true, type: "buffer" },
    csv: { blankrows: false, FS: ",", RS: "\n" },
  },
  {
    name: "dense raw:true no text",
    read: { cellDates: false, cellText: false, dense: true, raw: true, type: "buffer" },
    csv: { blankrows: false, FS: ",", RS: "\n", rawNumbers: true },
  },
  {
    name: "dense raw:false no text",
    read: { cellDates: false, cellText: false, dense: true, raw: false, type: "buffer" },
    csv: { blankrows: false, FS: ",", RS: "\n" },
  },
];

const fmt = (ms) => `${Math.round(ms)}ms`;

const benchOne = (filePath, testCase) => {
  const buffer = fs.readFileSync(filePath);
  const readStart = performance.now();
  const workbook = xlsx.read(buffer, testCase.read);
  const readMs = performance.now() - readStart;
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const csvStart = performance.now();
  const csv = xlsx.utils.sheet_to_csv(sheet, testCase.csv);
  const csvMs = performance.now() - csvStart;
  return {
    csvBytes: Buffer.byteLength(csv),
    csvMs,
    readMs,
    totalMs: readMs + csvMs,
  };
};

const main = () => {
  const files = process.argv.slice(2);
  const selected = files.length
    ? files
    : String(process.env.CONDUCTOR_BENCH_FILES ?? "")
        .split(path.delimiter)
        .map((value) => value.trim())
        .filter(Boolean);
  if (!selected.length) {
    throw new Error(
      "Usage: node scripts/bench-xlsx-options.mjs <file...> or set CONDUCTOR_BENCH_FILES.",
    );
  }

  for (const filePath of selected) {
    console.log(`\n[file] ${filePath}`);
    if (!fs.existsSync(filePath)) {
      console.log("missing");
      continue;
    }
    console.log(`size=${Math.round(fs.statSync(filePath).size / 1024 / 1024)}MB`);
    for (const testCase of cases) {
      const result = benchOne(filePath, testCase);
      console.log(
        `${testCase.name.padEnd(24)} read=${fmt(result.readMs).padStart(7)} csv=${fmt(result.csvMs).padStart(6)} total=${fmt(result.totalMs).padStart(7)} csvBytes=${result.csvBytes}`,
      );
    }
  }
};

main();
