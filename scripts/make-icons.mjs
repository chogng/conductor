#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceSvgPath = path.join(rootDir, "public", "logo.svg");
const outDir = path.join(rootDir, "build", "icons");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-icons-"));
const pngSizes = [16, 20, 24, 32, 40, 48, 64, 70, 128, 150, 256, 512, 1024];
const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
}

function cleanupTempDirectory() {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function buildIco(outputPath, inputPaths) {
  const images = inputPaths.map((filePath) => ({
    filePath,
    buffer: fs.readFileSync(filePath),
  }));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = header.length + images.length * 16;
  const entries = images.map(({ buffer, filePath }) => {
    const match = /icon-(\d+)\.png$/.exec(filePath);
    const size = Number(match?.[1] || 256);
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += buffer.length;
    return entry;
  });

  fs.writeFileSync(
    outputPath,
    Buffer.concat([header, ...entries, ...images.map(({ buffer }) => buffer)]),
  );
}

function tryBuildIcns(png1024Path) {
  if (process.platform !== "darwin") return false;

  const iconutil = spawnSync("iconutil", ["--version"], { stdio: "ignore" });
  if (iconutil.status !== 0) return false;

  const iconsetDir = path.join(tempDir, "conductor.iconset");
  fs.mkdirSync(iconsetDir, { recursive: true });

  const iconsetSizes = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"],
  ];

  for (const [size, name] of iconsetSizes) {
    const sourcePath = path.join(outDir, `icon-${size}.png`);
    const targetPath = path.join(iconsetDir, name);
    fs.copyFileSync(size === 1024 ? png1024Path : sourcePath, targetPath);
  }

  const result = spawnSync("iconutil", ["-c", "icns", iconsetDir, "-o", path.join(outDir, "icon.icns")], {
    stdio: "inherit",
  });
  return result.status === 0;
}

async function main() {
  ensureFile(sourceSvgPath);
  fs.mkdirSync(outDir, { recursive: true });

  const workerScriptPath = path.join(rootDir, "scripts", "make-icons-electron.mjs");
  const svgPathArg = sourceSvgPath.replace(/\\/g, "/");
  const outDirArg = outDir.replace(/\\/g, "/");
  const sizeArg = pngSizes.join(",");

  const electronBinary = require("electron");
  ensureFile(electronBinary);
  const childEnv = { ...process.env };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const result = spawnSync(
    electronBinary,
    [workerScriptPath, svgPathArg, outDirArg, sizeArg],
    {
      stdio: "inherit",
      env: childEnv,
    },
  );

  if (result.status !== 0) {
    throw new Error(`Electron icon generation failed with exit code ${result.status ?? 1}.`);
  }

  fs.copyFileSync(path.join(outDir, "icon-1024.png"), path.join(outDir, "icon.png"));
  const icoInputPaths = icoSizes.map((size) => path.join(outDir, `icon-${size}.png`));
  buildIco(path.join(outDir, "icon.ico"), icoInputPaths);
  tryBuildIcns(path.join(outDir, "icon-1024.png"));

  console.log("Generated icons:");
  for (const name of ["icon.png", "icon.ico", "icon-70.png", "icon-150.png", "icon.icns"]) {
    const filePath = path.join(outDir, name);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      console.log(`- ${name} (${stat.size} bytes)`);
    }
  }
}

main()
  .catch((error) => {
    console.error("[make-icons]", error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => {
    cleanupTempDirectory();
  });
