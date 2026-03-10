#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const [, , scriptPathArg, ...restArgs] = process.argv;

if (!scriptPathArg) {
  console.error("[pwsh] Usage: node scripts/run-powershell.mjs <script.ps1> [args...]");
  process.exit(2);
}

const scriptPath = path.resolve(process.cwd(), scriptPathArg);
if (!existsSync(scriptPath)) {
  console.error(`[pwsh] PowerShell script not found: ${scriptPath}`);
  process.exit(2);
}

const isWin = process.platform === "win32";
const exe = isWin ? "powershell.exe" : "pwsh";
const exeHint = isWin ? "PowerShell (powershell.exe)" : "PowerShell (pwsh)";

const args = [
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  scriptPath,
  ...restArgs,
];

const child = spawn(exe, args, { stdio: "inherit" });

child.on("error", (error) => {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    console.error(`[pwsh] ${exeHint} is not available in PATH (tried: '${exe}').`);
    console.error("[pwsh] Install PowerShell, or run this script on a Windows machine.");
    process.exit(127);
  }
  console.error(`[pwsh] Failed to start '${exe}': ${error?.message || String(error)}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[pwsh] PowerShell terminated by signal: ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});

