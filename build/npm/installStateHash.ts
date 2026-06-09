import * as crypto from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";

export const root = fs.realpathSync.native(path.dirname(path.dirname(import.meta.dirname)));
export const stateFile = path.join(root, "node_modules", ".postinstall-state");
export const stateContentsFile = path.join(root, "node_modules", ".postinstall-state-contents");

const inputFiles = [
  "package.json",
  "package-lock.json",
  ".npmrc",
  ".nvmrc",
];

const packageJsonRelevantKeys = new Set([
  "name",
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "peerDependenciesMeta",
  "overrides",
  "engines",
  "workspaces",
  "bundledDependencies",
  "bundleDependencies",
]);

const packageLockJsonIgnoredKeys = new Set(["version"]);

export interface PostinstallState {
  readonly nodeVersion: string;
  readonly fileHashes: Record<string, string>;
}

export function collectInputFiles(): string[] {
  return inputFiles
    .map((file) => path.join(root, file))
    .filter((filePath) => fs.existsSync(filePath));
}

function normalizeFileContent(filePath: string): string {
  const raw = fs.readFileSync(filePath, "utf8");
  const basename = path.basename(filePath);

  if (basename === "package.json") {
    const json = JSON.parse(raw);
    const filtered: Record<string, unknown> = {};
    for (const key of packageJsonRelevantKeys) {
      if (key in json) {
        filtered[key] = json[key];
      }
    }
    return `${JSON.stringify(filtered, null, "\t")}\n`;
  }

  if (basename === "package-lock.json") {
    const json = JSON.parse(raw);
    for (const key of packageLockJsonIgnoredKeys) {
      delete json[key];
    }
    if (json.packages?.[""]) {
      for (const key of packageLockJsonIgnoredKeys) {
        delete json.packages[""][key];
      }
    }
    return `${JSON.stringify(json, null, "\t")}\n`;
  }

  return raw;
}

function hashContent(content: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(content);
  return hash.digest("hex");
}

export function computeState(): PostinstallState {
  const fileHashes: Record<string, string> = {};
  for (const filePath of collectInputFiles()) {
    fileHashes[path.relative(root, filePath)] = hashContent(normalizeFileContent(filePath));
  }
  return { nodeVersion: process.versions.node, fileHashes };
}

export function computeContents(): Record<string, string> {
  const fileContents: Record<string, string> = {};
  for (const filePath of collectInputFiles()) {
    fileContents[path.relative(root, filePath)] = normalizeFileContent(filePath);
  }
  return fileContents;
}

export function readSavedState(): PostinstallState | undefined {
  try {
    const { nodeVersion, fileHashes } = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    return { nodeVersion, fileHashes };
  } catch {
    return undefined;
  }
}

export function isUpToDate(): boolean {
  const saved = readSavedState();
  if (!saved) {
    return false;
  }

  const current = computeState();
  return saved.nodeVersion === current.nodeVersion
    && JSON.stringify(saved.fileHashes) === JSON.stringify(current.fileHashes);
}

if (import.meta.filename === process.argv[1]) {
  const current = computeState();
  const saved = readSavedState();
  console.log(JSON.stringify({ root, stateFile, current, saved, files: collectInputFiles() }));
}
