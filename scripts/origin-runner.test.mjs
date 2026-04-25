import test from "node:test";
import assert from "node:assert/strict";
import { runProcess } from "../desktop-dist/origin-runner/core.js";
import {
  appendOriginCapabilitiesWorkerArgs,
  appendOriginPlotWorkerArgs,
  buildOriginCsvWorkerArgs,
} from "../desktop-dist/origin-runner/runners.js";

test("runProcess resolves process output and exit code", async () => {
  const result = await runProcess(
    process.execPath,
    ["-e", "process.stdout.write('ok')"],
    { timeoutMs: 2000 },
  );

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "ok");
  assert.equal(result.stderr, "");
});

test("runProcess rejects when timeout is exceeded", async () => {
  await assert.rejects(
    runProcess(
      process.execPath,
      ["-e", "setTimeout(() => {}, 5000)"],
      { timeoutMs: 50 },
    ),
    (error) => {
      assert.equal(error.code, "ETIMEDOUT");
      assert.match(error.message, /Process timed out/);
      return true;
    },
  );
});

test("runProcess truncates stdout and stderr independently", async () => {
  const result = await runProcess(
    process.execPath,
    [
      "-e",
      "process.stdout.write('abcdef'); process.stderr.write('uvwxyz')",
    ],
    { timeoutMs: 2000, maxOutputBytes: 3 },
  );

  assert.equal(result.code, 0);
  assert.equal(result.stdout, "abc");
  assert.equal(result.stderr, "uvw");
});

test("appendOriginPlotWorkerArgs keeps valid plot options and skips empty values", () => {
  const args = appendOriginPlotWorkerArgs(["--base"], {
    plotType: 202.9,
    xyPairs: " ((1,2)) ",
    plotCommand: " plotxy iy:=(1,2) ",
    postPlotCommands: ["", " layer -a "],
    lineWidth: 2.5,
  });

  assert.deepEqual(args, [
    "--base",
    "--plot-type",
    "202",
    "--xy-pairs",
    "((1,2))",
    "--plot-command",
    "plotxy iy:=(1,2)",
    "--post-plot-command",
    "layer -a",
    "--line-width",
    "2.5",
  ]);
});

test("appendOriginCapabilitiesWorkerArgs ignores unserializable payloads", () => {
  const circular = {};
  circular.self = circular;

  assert.deepEqual(
    appendOriginCapabilitiesWorkerArgs(["--base"], circular),
    ["--base"],
  );
});

test("buildOriginCsvWorkerArgs includes core paths before optional settings", () => {
  const args = buildOriginCsvWorkerArgs({
    workDir: "C:\\work",
    csvPath: "C:\\work\\a.csv",
    originExePath: "C:\\Origin\\Origin64.exe",
    logPath: "C:\\work\\originbridge.log",
    errorPath: "C:\\work\\error.txt",
    importMode: "append-sheet",
    workbookName: "Book1",
    sheetName: "Data",
  });

  assert.deepEqual(args.slice(0, 10), [
    "--work-dir",
    "C:\\work",
    "--csv-path",
    "C:\\work\\a.csv",
    "--origin-exe",
    "C:\\Origin\\Origin64.exe",
    "--log-path",
    "C:\\work\\originbridge.log",
    "--error-path",
    "C:\\work\\error.txt",
  ]);
  assert.equal(args.includes("--import-mode"), true);
  assert.equal(args.includes("--workbook-name"), true);
  assert.equal(args.includes("--sheet-name"), true);
});
