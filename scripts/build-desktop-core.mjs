#!/usr/bin/env node
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const packageJsonMarkerId = "BUILD_INSERT_PACKAGE_CONFIGURATION";
const tscExtraArgs = process.argv.slice(2);
const isWatch = tscExtraArgs.includes("--watch") || tscExtraArgs.includes("-w");
const projectRoot = process.cwd();
const desktopDistDir = path.join(projectRoot, "desktop-dist");
const packageJsonPath = path.join(projectRoot, "package.json");
const bootstrapMetaPath = path.join(desktopDistDir, "src", "bootstrap-meta.js");
const packageMarker = new RegExp(
  `${packageJsonMarkerId}:\\s*"${packageJsonMarkerId}"`,
);

const isWin = process.platform === "win32";
const tscCmd = isWin ? "cmd.exe" : "npx";
const tscArgs = isWin
  ? ["/d", "/s", "/c", "npx", "tsc", "-p", "tsconfig.desktop.json", ...tscExtraArgs]
  : ["tsc", "-p", "tsconfig.desktop.json", ...tscExtraArgs];

const inlinePackageConfiguration = (throwOnMissingMarker) => {
  mkdirSync(desktopDistDir, { recursive: true });
  copyFileSync(packageJsonPath, path.join(desktopDistDir, "package.json"));

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const packageJsonFields = JSON.stringify(packageJson).slice(1, -1);
  const bootstrapMeta = readFileSync(bootstrapMetaPath, "utf8");

  if (!packageMarker.test(bootstrapMeta)) {
    if (throwOnMissingMarker) {
      throw new Error(`Package configuration marker not found in ${bootstrapMetaPath}`);
    }
    return;
  }

  writeFileSync(
    bootstrapMetaPath,
    bootstrapMeta.replace(packageMarker, packageJsonFields),
  );
};

if (isWatch) {
  const proc = spawn(tscCmd, tscArgs, { stdio: ["inherit", "pipe", "pipe"] });

  const relayOutput = (stream, outputTarget) => {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      const text = String(chunk);
      outputTarget.write(text);
      if (text.includes("Watching for file changes.")) {
        inlinePackageConfiguration(false);
      }
    });
  };

  relayOutput(proc.stdout, process.stdout);
  relayOutput(proc.stderr, process.stderr);

  proc.on("exit", (code) => {
    process.exit(code ?? 1);
  });
  proc.on("error", (error) => {
    console.error(error.message);
    process.exit(1);
  });
} else {
  const res = spawnSync(tscCmd, tscArgs, { stdio: "inherit" });
  if ((res.status ?? 1) !== 0) {
    process.exit(res.status ?? 1);
  }

  inlinePackageConfiguration(true);
}
