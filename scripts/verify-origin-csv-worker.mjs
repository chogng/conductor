#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";

const isWin = process.platform === "win32";
if (!isWin) {
  console.log("[verify-origin-worker] Skipped (Windows-only).");
  process.exit(0);
}

const candidates = [
  path.join(process.cwd(), "origin", "bin", "origin-csv-worker.exe"),
  path.join(process.cwd(), "origin", "dist", "origin-csv-worker.exe"),
];

const existing = candidates.find((p) => existsSync(p)) || "";
if (!existing) {
  console.error("[verify-origin-worker] origin-csv-worker.exe is missing.");
  console.error("[verify-origin-worker] Expected one of:");
  for (const c of candidates) console.error(`  - ${c}`);
  console.error("[verify-origin-worker] Fix:");
  console.error("  - Run: npm run build:origin-csv-worker");
  process.exit(1);
}

let size = 0;
try {
  size = statSync(existing).size;
} catch {
  // ignore
}
if (!Number.isFinite(size) || size <= 0) {
  console.error(`[verify-origin-worker] origin-csv-worker.exe exists but looks invalid (size=${size}).`);
  console.error(`[verify-origin-worker] Path: ${existing}`);
  process.exit(1);
}

const packageJsonPath = path.join(process.cwd(), "package.json");
let expectedVersion = "";
try {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  expectedVersion =
    typeof packageJson?.version === "string" ? packageJson.version.trim() : "";
} catch {
  // ignore and keep empty
}

const versionResult = spawnSync(existing, ["--worker-version-json"], {
  encoding: "utf8",
  windowsHide: true,
});
if ((versionResult.status ?? 1) !== 0) {
  console.error("[verify-origin-worker] Failed to query worker version metadata.");
  console.error(`[verify-origin-worker] Path: ${existing}`);
  if (versionResult.stderr?.trim()) {
    console.error(versionResult.stderr.trim());
  }
  process.exit(versionResult.status ?? 1);
}

let metadata = null;
try {
  metadata = JSON.parse(String(versionResult.stdout || "").trim());
} catch {
  console.error("[verify-origin-worker] Worker version metadata is not valid JSON.");
  console.error(`[verify-origin-worker] Path: ${existing}`);
  process.exit(1);
}

const workerVersion =
  typeof metadata?.workerVersion === "string" ? metadata.workerVersion.trim() : "";
if (!workerVersion) {
  console.error("[verify-origin-worker] Worker metadata does not include workerVersion.");
  console.error(`[verify-origin-worker] Path: ${existing}`);
  process.exit(1);
}

if (expectedVersion && workerVersion !== expectedVersion) {
  console.error(
    `[verify-origin-worker] Version mismatch. package.json=${expectedVersion}, exe=${workerVersion}.`,
  );
  console.error(`[verify-origin-worker] Path: ${existing}`);
  process.exit(1);
}

const details = [
  `version=${workerVersion}`,
  metadata?.mode ? `mode=${metadata.mode}` : "",
  metadata?.expectedTag ? `expectedTag=${metadata.expectedTag}` : "",
  metadata?.gitTag ? `gitTag=${metadata.gitTag}` : "",
  metadata?.gitCommit ? `gitCommit=${metadata.gitCommit}` : "",
]
  .filter(Boolean)
  .join(" ");

console.log(`[verify-origin-worker] OK: ${existing} (${size} bytes) ${details}`);

