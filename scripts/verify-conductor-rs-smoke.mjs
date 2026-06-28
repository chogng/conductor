#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const helperFileName = process.platform === "win32" ? "conductor-rs.exe" : "conductor-rs";
const helperPath = process.env.CONDUCTOR_RS_CLI_PATH
  ? path.resolve(process.env.CONDUCTOR_RS_CLI_PATH)
  : null;
const helperCommand = helperPath ?? "cargo";
const helperBaseArgs = helperPath
  ? []
  : ["run", "--quiet", "--manifest-path", "cli/Cargo.toml", "--"];

const runJson = (args) => {
  const result = spawnSync(helperCommand, [...helperBaseArgs, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10000,
  });
  if (result.error) {
    throw new Error(`Failed to start conductor-rs: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(`conductor-rs ${args.join(" ")} timed out or was terminated by ${result.signal}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `conductor-rs ${args.join(" ")} failed with exit code ${result.status}: ${result.stderr.trim()}`,
    );
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`conductor-rs ${args.join(" ")} returned invalid JSON: ${error.message}`);
  }
};

const runWorkerJson = (payload) => {
  const result = spawnSync(helperCommand, [...helperBaseArgs, "--stdio-worker"], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: `${JSON.stringify(payload)}\n`,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 10000,
  });
  if (result.error) {
    throw new Error(`Failed to start conductor-rs stdio worker: ${result.error.message}`);
  }
  if (result.signal) {
    throw new Error(`conductor-rs stdio worker timed out or was terminated by ${result.signal}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `conductor-rs stdio worker failed with exit code ${result.status}: ${result.stderr.trim()}`,
    );
  }

  const line = result.stdout.split(/\r?\n/).find((entry) => entry.trim());
  if (!line) {
    throw new Error("conductor-rs stdio worker returned no JSON response.");
  }

  try {
    return JSON.parse(line);
  } catch (error) {
    throw new Error(`conductor-rs stdio worker returned invalid JSON: ${error.message}`);
  }
};

const verifyTableModelSeedImport = () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-rs-smoke-"));
  const csvPath = path.join(tempDir, "batch.csv");
  try {
    fs.writeFileSync(csvPath, "x,y\n1,2\n", "utf8");
    const response = runWorkerJson({
      id: 1,
      command: "prepareImport",
      fileName: "batch.csv",
      path: csvPath,
    });
    if (response?.ok !== true || response?.result?.fileName !== "batch.csv") {
      throw new Error(`Unexpected prepareImport response: ${JSON.stringify(response)}`);
    }
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
};

if (helperPath && !fs.existsSync(helperPath)) {
  console.error(`[verify-conductor-rs-smoke] conductor-rs was not found: ${helperPath}`);
  console.error("[verify-conductor-rs-smoke] Run `npm run build:conductor-rs` first.");
  process.exit(1);
}

try {
  const version = runJson(["--version-json"]);
  if (version?.binary !== "conductor-rs" || version?.protocol !== "stdio-worker") {
    throw new Error(`Unexpected version payload: ${JSON.stringify(version)}`);
  }

  const doctor = runJson(["--doctor"]);
  if (doctor?.ok !== true || doctor?.helper?.binary !== "conductor-rs") {
    throw new Error(`Unexpected doctor payload: ${JSON.stringify(doctor)}`);
  }

  verifyTableModelSeedImport();

  console.log(
    `[verify-conductor-rs-smoke] OK: ${helperPath ?? "cargo run cli/Cargo.toml"} version=${version.version} platform=${version.platform}/${version.arch}`,
  );
} catch (error) {
  console.error(`[verify-conductor-rs-smoke] ${error.message}`);
  process.exit(1);
}
