#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const helperFileName = process.platform === "win32" ? "conductor-rs.exe" : "conductor-rs";
const helperPath = process.env.CONDUCTOR_RS_CLI_PATH
  ? path.resolve(process.env.CONDUCTOR_RS_CLI_PATH)
  : path.join(process.cwd(), "resources", "bin", helperFileName);

const runJson = (args) => {
  const result = spawnSync(helperPath, args, {
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

if (!fs.existsSync(helperPath)) {
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

  console.log(
    `[verify-conductor-rs-smoke] OK: ${helperPath} version=${version.version} platform=${version.platform}/${version.arch}`,
  );
} catch (error) {
  console.error(`[verify-conductor-rs-smoke] ${error.message}`);
  process.exit(1);
}
