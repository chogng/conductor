#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import {
  createImportTableFactsSeedHeuristic,
  extractImportTableFactsSeedMetadata,
} from "../src/cs/workbench/services/tableFacts/common/importTableFactsSeedHeuristics.ts";

const ROOT = process.cwd();
const WORKER_FILE_NAME = process.platform === "win32" ? "conductor-rs.exe" : "conductor-rs";
const OUTPUT_DIR = path.join(ROOT, ".build", "verify", "rust-table-facts-parity");
const FIXTURE_DIR = path.join(OUTPUT_DIR, "fixtures");
const REPORT_PATH = path.join(OUTPUT_DIR, "report.json");

const STRICT_TABLE_FACTS_FIELDS = [
  "curveFamily",
  "curveType",
  "curveTypeConfidence",
  "curveTypeNeedsReview",
  "ivMode",
  "xAxisRole",
  "xAxisRoleSource",
];

const STRICT_METADATA_FIELDS = [
  "rowCount",
  "columnCount",
  "maxCellLengths",
];

const fixtures = [
  {
    name: "transfer-metadata.csv",
    rows: [
      ["SetupTitle", "Transfer_DB"],
      ["TestParameter", "Channel.VName", "Vg", "Vd", "Vs"],
      ["TestParameter", "Channel.Func", "VAR1", "VAR2", "CONST"],
      ["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
      ["AnalysisSetup", "Analysis.Setup.Vector.Graph.Notes", "[VAR1] Unit=SMU3:MP, Name=Vg, Start=-1 V\t[VAR2] Unit=SMU2:MP, Name=Vd, Start=50 mV"],
      ["DataName", "Vg", "Id", "Ig"],
      ["DataValue", "-1", "-2.63E-12", "-2.05E-12"],
    ],
  },
  {
    name: "stripped-output-shape.csv",
    rows: [
      ["Repeat", "VAR2", "Point", "CH1 Voltage", "CH1 Current", "CH1 Resistance", "CH1 Time", "CH2 Voltage", "CH2 Current", "CH2 Time", "R"],
      ["1", "1", "1", "-3.00000E+000", "-1.00000E-012", "810.09486E+006", "125.47200E-003", "-60.00000E+000", "1.00000E-009", "9.64800E-003", "810.09486E+006"],
      ["1", "1", "2", "-2.00000E+000", "-1.00000E-010", "850.90577E+006", "246.44300E-003", "-60.00000E+000", "1.10000E-009", "146.86600E-003", "850.90577E+006"],
      ["1", "1", "3", "-1.00000E+000", "-1.00000E-008", "963.61533E+006", "367.26100E-003", "-60.00000E+000", "1.20000E-009", "267.67400E-003", "963.61533E+006"],
      ["1", "1", "4", "0.00000E+000", "-1.00000E-007", "981.84432E+006", "488.05500E-003", "-60.00000E+000", "1.10000E-009", "388.45600E-003", "981.84432E+006"],
    ],
  },
  {
    name: "transient-transfer-header.csv",
    rows: [
      ["2026-04-21-19-10-07_(MOS_IV_Transient_DC_Sweep)Id", "Ig_vg@ vs=0.0"],
      ["vg(V)", "id(-0.1)", "vg(V)", "ig(-0.1)", "vg(V)", "id(-1.0)", "vg(V)", "ig(-1.0)"],
      ["-3.0", "-1.5e-4", "-3.0", "-6.3e-11", "-3.0", "-1.5e-3", "-3.0", "-6.6e-11"],
      ["-2.94", "-1.5e-4", "-2.94", "-6.0e-11", "-2.94", "-1.5e-3", "-2.94", "-6.3e-11"],
    ],
  },
  {
    name: "unknown-generic.csv",
    rows: [
      ["time", "temperature", "note"],
      ["0", "298.15", "start"],
      ["1", "298.20", "hold"],
      ["2", "298.18", "end"],
    ],
  },
];

const createCsvText = (rows) => rows
  .map(row => row.map(escapeCsvCell).join(","))
  .join("\n");

const escapeCsvCell = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
};

const parseCsvRows = (csvText) => {
  const parsed = Papa.parse(csvText, {
    preview: 256,
    skipEmptyLines: false,
  });
  return Array.isArray(parsed.data)
    ? parsed.data.map(row => Array.isArray(row) ? row.map(value => String(value ?? "")) : [])
    : [];
};

const buildTypeScriptTableFactsSeed = (fileName, rows) => {
  const tableFactsSeed = createImportTableFactsSeedHeuristic({
    fileName,
    metadata: extractImportTableFactsSeedMetadata(rows.map(row => [...row])),
  });
  return {
    curveFamily: getMeasurementFamily(tableFactsSeed.curveType),
    curveType: tableFactsSeed.curveTypeLabel,
    curveTypeConfidence: tableFactsSeed.confidence,
    curveTypeNeedsReview: tableFactsSeed.needsReview,
    curveTypeReasons: tableFactsSeed.reasons,
    ivMode: getIvMode(tableFactsSeed.curveType),
    xAxisRole: tableFactsSeed.xAxisRole,
    xAxisRoleSource: tableFactsSeed.xAxisRoleSource,
  };
};

const getMeasurementFamily = (curveType) => {
  if (curveType === "transfer" || curveType === "output") {
    return "iv";
  }
  if (curveType === "cv" || curveType === "cf" || curveType === "pv") {
    return curveType;
  }
  return "unknown";
};

const getIvMode = (curveType) =>
  curveType === "transfer" || curveType === "output" ? curveType : null;

const computeTableMetadata = (rows) => {
  const maxCellLengths = [];
  let columnCount = 0;
  for (const row of rows) {
    columnCount = Math.max(columnCount, row.length);
    for (let index = 0; index < row.length; index += 1) {
      const length = [...String(row[index] ?? "")].length;
      maxCellLengths[index] = Math.max(maxCellLengths[index] ?? 0, length);
    }
  }
  return {
    columnCount,
    maxCellLengths,
    rowCount: rows.length,
  };
};

const normalizeRustTableFacts = (value) => ({
  curveFamily: normalizeNullable(value?.curveFamily),
  curveType: normalizeNullable(value?.curveType),
  curveTypeConfidence: normalizeNullable(value?.curveTypeConfidence),
  curveTypeNeedsReview: Boolean(value?.curveTypeNeedsReview),
  curveTypeReasons: Array.isArray(value?.curveTypeReasons)
    ? value.curveTypeReasons.map(item => String(item))
    : [],
  ivMode: normalizeNullable(value?.ivMode),
  xAxisRole: normalizeNullable(value?.xAxisRole),
  xAxisRoleSource: normalizeNullable(value?.xAxisRoleSource),
});

const normalizeNullable = (value) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const resolveWorkerCommand = async () => {
  if (process.env.CONDUCTOR_RS_CLI_PATH) {
    const candidate = path.resolve(process.env.CONDUCTOR_RS_CLI_PATH);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        return {
          args: ["--stdio-worker"],
          command: candidate,
          label: candidate,
        };
      }
    } catch {
      throw new Error(`CONDUCTOR_RS_CLI_PATH does not point to a file: ${candidate}`);
    }
  }

  return {
    args: ["run", "--quiet", "--manifest-path", "cli/Cargo.toml", "--", "--stdio-worker"],
    command: "cargo",
    label: "cargo run --manifest-path cli/Cargo.toml -- --stdio-worker",
  };
};

const createWorker = ({ command, args, label }) => {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  let stdoutBuffer = "";
  let nextId = 0;
  const pending = new Map();

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += String(chunk ?? "");
    while (true) {
      const newlineIndex = stdoutBuffer.indexOf("\n");
      if (newlineIndex < 0) {
        break;
      }

      const line = stdoutBuffer.slice(0, newlineIndex);
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      const text = line.trim();
      if (!text) {
        continue;
      }

      let message;
      try {
        message = JSON.parse(text);
      } catch (error) {
        console.warn(`[rust-table-facts-parity] invalid worker JSON: ${error.message}`);
        continue;
      }

      const entry = pending.get(message.id);
      if (!entry) {
        continue;
      }

      pending.delete(message.id);
      clearTimeout(entry.timeoutId);
      if (message.ok) {
        entry.resolve(message.result ?? {});
      } else {
        entry.reject(new Error(message.error?.message || "conductor-rs failed"));
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    const text = String(chunk ?? "").trim();
    if (text) {
      console.warn(`[conductor-rs] ${text}`);
    }
  });

  child.on("exit", (code, signal) => {
    const error = new Error(`${label} exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    for (const entry of pending.values()) {
      clearTimeout(entry.timeoutId);
      entry.reject(error);
    }
    pending.clear();
  });

  const send = (commandName, payload) => {
    const id = (nextId += 1);
    const message = JSON.stringify({ id, command: commandName, ...payload });
    const promise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`conductor-rs command timed out: ${commandName}`));
      }, 120000);
      pending.set(id, { reject, resolve, timeoutId });
    });
    child.stdin.write(`${message}\n`, "utf8");
    return promise;
  };

  return {
    close() {
      child.kill();
    },
    send,
  };
};

const compareRecords = (expected, actual, fields) => {
  const mismatches = [];
  for (const field of fields) {
    const left = expected[field];
    const right = actual[field];
    const matches = Array.isArray(left) || Array.isArray(right)
      ? JSON.stringify(left ?? []) === JSON.stringify(right ?? [])
      : Object.is(left, right);
    if (!matches) {
      mismatches.push({
        actual: right,
        expected: left,
        field,
      });
    }
  }
  return mismatches;
};

const main = async () => {
  await fs.rm(OUTPUT_DIR, { force: true, recursive: true });
  await fs.mkdir(FIXTURE_DIR, { recursive: true });

  const workerCommand = await resolveWorkerCommand();
  const worker = createWorker(workerCommand);
  const summaries = [];
  const failures = [];

  try {
    for (const fixture of fixtures) {
      const csvText = createCsvText(fixture.rows);
      const filePath = path.join(FIXTURE_DIR, fixture.name);
      await fs.writeFile(filePath, csvText, "utf8");

      const tsRows = parseCsvRows(csvText);
      const tsTableFacts = buildTypeScriptTableFactsSeed(fixture.name, tsRows);
      const tsMetadata = computeTableMetadata(fixture.rows);
      const rustResult = await worker.send("prepareImport", {
        fileName: fixture.name,
        path: filePath,
      });
      const rustTableFacts = normalizeRustTableFacts(rustResult.tableFactsSeed);
      const rustMetadata = {
        columnCount: Number(rustResult.columnCount) || 0,
        maxCellLengths: Array.isArray(rustResult.maxCellLengths)
          ? rustResult.maxCellLengths.map(value => Number(value) || 0)
          : [],
        rowCount: Number(rustResult.rowCount) || 0,
      };
      const tableFactsMismatches = compareRecords(
        tsTableFacts,
        rustTableFacts,
        STRICT_TABLE_FACTS_FIELDS,
      );
      const metadataMismatches = compareRecords(
        tsMetadata,
        rustMetadata,
        STRICT_METADATA_FIELDS,
      );
      const summary = {
        tableFactsMismatches,
        file: fixture.name,
        metadataMismatches,
        passed: tableFactsMismatches.length === 0 && metadataMismatches.length === 0,
        rustTableFacts,
        rustMetadata,
        tsTableFacts,
        tsMetadata,
      };
      summaries.push(summary);
      if (!summary.passed) {
        failures.push(summary);
      }
    }
  } finally {
    worker.close();
  }

  const report = {
    checked: summaries.length,
    failures,
    generatedAt: new Date().toISOString(),
    worker: workerCommand.label,
    summaries,
  };
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`[rust-table-facts-parity] FAIL ${failure.file}`);
      for (const mismatch of [...failure.tableFactsMismatches, ...failure.metadataMismatches]) {
        console.error(`  ${mismatch.field}: expected=${JSON.stringify(mismatch.expected)} actual=${JSON.stringify(mismatch.actual)}`);
      }
    }
    console.error(`[rust-table-facts-parity] report=${REPORT_PATH}`);
    process.exit(1);
  }

  console.log(`[rust-table-facts-parity] all ${summaries.length} fixtures matched`);
  console.log(`[rust-table-facts-parity] report=${REPORT_PATH}`);
};

main().catch((error) => {
  console.error(`[rust-table-facts-parity] ${error?.message || error}`);
  process.exit(1);
});
