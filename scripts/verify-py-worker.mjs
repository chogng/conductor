#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";

const isWin = process.platform === "win32";
if (!isWin) {
  console.log("[verify-py-worker] Skipped (Windows-only).");
  process.exit(0);
}

const candidates = [
  path.join(process.cwd(), "workers", "py", "origin-csv-worker", "origin-csv-worker.exe"),
  path.join(process.cwd(), "workers", "py", "origin-csv-worker.exe"),
];

const existing = candidates.find((p) => existsSync(p)) || "";
if (!existing) {
  console.error("[verify-py-worker] origin-csv-worker.exe is missing.");
  console.error("[verify-py-worker] Expected one of:");
  for (const c of candidates) console.error(`  - ${c}`);
  console.error("[verify-py-worker] Fix:");
  console.error("  - Run: npm run build:py-worker");
  process.exit(1);
}

let size = 0;
try {
  size = statSync(existing).size;
} catch {
  // ignore
}
if (!Number.isFinite(size) || size <= 0) {
  console.error(`[verify-py-worker] origin-csv-worker.exe exists but looks invalid (size=${size}).`);
  console.error(`[verify-py-worker] Path: ${existing}`);
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
  console.error("[verify-py-worker] Failed to query worker version metadata.");
  console.error(`[verify-py-worker] Path: ${existing}`);
  if (versionResult.stderr?.trim()) {
    console.error(versionResult.stderr.trim());
  }
  process.exit(versionResult.status ?? 1);
}

let metadata = null;
try {
  metadata = JSON.parse(String(versionResult.stdout || "").trim());
} catch {
  console.error("[verify-py-worker] Worker version metadata is not valid JSON.");
  console.error(`[verify-py-worker] Path: ${existing}`);
  process.exit(1);
}

const workerVersion =
  typeof metadata?.workerVersion === "string" ? metadata.workerVersion.trim() : "";
if (!workerVersion) {
  console.error("[verify-py-worker] Worker metadata does not include workerVersion.");
  console.error(`[verify-py-worker] Path: ${existing}`);
  process.exit(1);
}

if (expectedVersion && workerVersion !== expectedVersion) {
  console.error(
    `[verify-py-worker] Version mismatch. package.json=${expectedVersion}, exe=${workerVersion}.`,
  );
  console.error(`[verify-py-worker] Path: ${existing}`);
  process.exit(1);
}

const normalizeFileVersion = (value) =>
  String(value || "")
    .trim()
    .split(".")
    .map((part) => {
      const parsed = Number.parseInt(part, 10);
      return Number.isFinite(parsed) ? String(parsed) : "0";
    })
    .join(".")
    .replace(/(?:\.0)+$/, "");

const queryWindowsVersionInfo = (exePath) => {
  const psExePath = String(exePath).replaceAll("'", "''");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$item = Get-Item -LiteralPath '${psExePath}'`,
    "$v = $item.VersionInfo",
    "[ordered]@{",
    "  CompanyName = [string]$v.CompanyName",
    "  FileDescription = [string]$v.FileDescription",
    "  FileVersion = [string]$v.FileVersion",
    "  InternalName = [string]$v.InternalName",
    "  LegalCopyright = [string]$v.LegalCopyright",
    "  OriginalFilename = [string]$v.OriginalFilename",
    "  ProductName = [string]$v.ProductName",
    "  ProductVersion = [string]$v.ProductVersion",
    "  Comments = [string]$v.Comments",
    "  SpecialBuild = [string]$v.SpecialBuild",
    "} | ConvertTo-Json -Compress",
  ].join("\n");

  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { encoding: "utf8", windowsHide: true },
  );
  if ((result.status ?? 1) !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || "unknown error";
    throw new Error(detail);
  }
  return JSON.parse(String(result.stdout || "").trim());
};

let fileVersionInfo = null;
try {
  fileVersionInfo = queryWindowsVersionInfo(existing);
} catch (error) {
  console.error("[verify-py-worker] Failed to query Windows file version metadata.");
  console.error(`[verify-py-worker] Path: ${existing}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const requiredVersionInfo = {
  CompanyName: "chogng",
  FileDescription: "Conductor Studio OriginPro CSV Import Worker",
  InternalName: "origin-csv-worker",
  OriginalFilename: "origin-csv-worker.exe",
  ProductName: "Conductor Studio",
};
for (const [key, expected] of Object.entries(requiredVersionInfo)) {
  const actual = String(fileVersionInfo?.[key] || "").trim();
  if (actual !== expected) {
    console.error(
      `[verify-py-worker] Windows VersionInfo mismatch for ${key}. expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}.`,
    );
    console.error(`[verify-py-worker] Path: ${existing}`);
    process.exit(1);
  }
}

if (expectedVersion) {
  const expectedNormalized = normalizeFileVersion(expectedVersion);
  for (const key of ["FileVersion", "ProductVersion"]) {
    const actualNormalized = normalizeFileVersion(fileVersionInfo?.[key]);
    if (actualNormalized !== expectedNormalized) {
      console.error(
        `[verify-py-worker] Windows VersionInfo mismatch for ${key}. expected=${expectedNormalized} actual=${actualNormalized}.`,
      );
      console.error(`[verify-py-worker] Path: ${existing}`);
      process.exit(1);
    }
  }
}

const comments = String(fileVersionInfo?.Comments || "");
if (!comments.includes("local OriginPro CSV import") || !comments.includes("does not provide network services")) {
  console.error("[verify-py-worker] Windows VersionInfo Comments does not describe the local/no-network worker behavior.");
  console.error(`[verify-py-worker] Path: ${existing}`);
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

console.log(`[verify-py-worker] OK: ${existing} (${size} bytes) ${details}`);

