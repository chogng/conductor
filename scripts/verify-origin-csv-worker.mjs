#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
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

console.log(`[verify-origin-worker] OK: ${existing} (${size} bytes)`);

