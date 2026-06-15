#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(scriptDir, "..");
const isWindows = process.platform === "win32";
const helperFileName = isWindows ? "conductor-rs.exe" : "conductor-rs";

const readOption = (name) => {
  const prefix = `--${name}=`;
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index >= 0) {
    return process.argv[index + 1] ?? "";
  }

  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : "";
};

const resolvePathOption = (value, fallback, projectRoot) => {
  const candidate = value && value.trim() ? value.trim() : fallback;
  return path.isAbsolute(candidate) ? candidate : path.join(projectRoot, candidate);
};

const commandExists = (command) => {
  const result = isWindows
    ? spawnSync("where.exe", [command], { stdio: "ignore" })
    : spawnSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" });
  return result.status === 0;
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });
  if (result.error) {
    console.error(`[build-conductor-rs] Failed to start ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const quoteForWindowsCmd = (value) => {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
};

const runCargoBuildWithVsDevCmd = (vsDevCmd, cargoArgs, workspaceDir) => {
  const command = [
    "call",
    quoteForWindowsCmd(vsDevCmd),
    "-arch=x64",
    "&&",
    "cargo",
    ...cargoArgs.map(quoteForWindowsCmd),
  ].join(" ");
  run("cmd.exe", [
    "/d",
    "/c",
    command,
  ], {
    cwd: workspaceDir,
    windowsVerbatimArguments: true,
  });
};

const findVsDevCmd = () => {
  if (!isWindows) {
    return "";
  }

  const candidates = [
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\18\\BuildTools\\Common7\\Tools\\VsDevCmd.bat",
    "C:\\Program Files\\Microsoft Visual Studio\\18\\BuildTools\\Common7\\Tools\\VsDevCmd.bat",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\Tools\\VsDevCmd.bat",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\Common7\\Tools\\VsDevCmd.bat",
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? "";
};

const projectRoot = path.resolve(readOption("project-root") || defaultProjectRoot);
const workspaceDir = projectRoot;
const cargoToml = path.join(workspaceDir, "Cargo.toml");
if (!fs.existsSync(cargoToml)) {
  console.error(`[build-conductor-rs] Conductor Rust workspace Cargo.toml not found: ${cargoToml}`);
  process.exit(2);
}

if (!commandExists("cargo")) {
  console.error("[build-conductor-rs] cargo is not available in PATH. Install Rust before building conductor-rs.");
  process.exit(127);
}

const distDir = resolvePathOption(
  readOption("dist-dir"),
  path.join("resources", "bin"),
  projectRoot,
);
const targetDir = resolvePathOption(
  readOption("target-dir"),
  path.join(".build", "cache", "conductor-rs-cli-target"),
  projectRoot,
);

const cargoArgs = [
  "build",
  "--release",
  "-p",
  "conductor-cli",
  "--bin",
  "conductor-rs",
  "--target-dir",
  targetDir,
];
const vsDevCmd = findVsDevCmd();
if (isWindows && vsDevCmd) {
  console.log("[build-conductor-rs] Running cargo build through VsDevCmd.");
  runCargoBuildWithVsDevCmd(vsDevCmd, cargoArgs, workspaceDir);
} else {
  console.log("[build-conductor-rs] Running cargo build --release.");
  run("cargo", cargoArgs, { cwd: workspaceDir });
}

const sourceExe = path.join(targetDir, "release", helperFileName);
if (!fs.existsSync(sourceExe)) {
  console.error(`[build-conductor-rs] Built conductor-rs executable not found: ${sourceExe}`);
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });
const targetExe = path.join(distDir, helperFileName);
fs.rmSync(targetExe, { force: true });
fs.copyFileSync(sourceExe, targetExe);
if (!isWindows) {
  fs.chmodSync(targetExe, 0o755);
}
console.log(`[build-conductor-rs] Copied conductor-rs to ${targetExe}`);
