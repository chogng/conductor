import * as crypto from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";

export const root = fs.realpathSync.native(path.dirname(path.dirname(import.meta.dirname)));
export const stateFile = path.join(root, "node_modules", ".postinstall-state");
export const stateContentsFile = path.join(root, "node_modules", ".postinstall-state-contents");
export const forceInstallMessage = "Run \x1b[36mnode --experimental-strip-types build/npm/fast-install.ts --force\x1b[0m to force a full install.";

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

export function computeState(options?: { readonly ignoreNodeVersion?: boolean }): PostinstallState {
  const fileHashes: Record<string, string> = {};
  for (const filePath of collectInputFiles()) {
    try {
      fileHashes[path.relative(root, filePath)] = hashContent(normalizeFileContent(filePath));
    } catch {
      // Ignore files that disappear or become unreadable while checking install state.
    }
  }
  return { nodeVersion: options?.ignoreNodeVersion ? "" : process.versions.node, fileHashes };
}

export function computeContents(): Record<string, string> {
  const fileContents: Record<string, string> = {};
  for (const filePath of collectInputFiles()) {
    try {
      fileContents[path.relative(root, filePath)] = normalizeFileContent(filePath);
    } catch {
      // Ignore files that disappear or become unreadable while checking install state.
    }
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

export function readSavedContents(): Record<string, string> | undefined {
  try {
    return JSON.parse(fs.readFileSync(stateContentsFile, "utf8"));
  } catch {
    return undefined;
  }
}

if (import.meta.filename === process.argv[1]) {
  const args = new Set(process.argv.slice(2));

  if (args.has("--normalize-file")) {
    const filePath = process.argv[process.argv.indexOf("--normalize-file") + 1];
    if (!filePath) {
      process.exit(1);
    }
    process.stdout.write(normalizeFileContent(filePath));
  } else {
    const ignoreNodeVersion = args.has("--ignore-node-version");
    const current = computeState({ ignoreNodeVersion });
    const saved = readSavedState();
    console.log(JSON.stringify({
      root,
      stateContentsFile,
      stateFile,
      current,
      saved: saved && ignoreNodeVersion ? { nodeVersion: "", fileHashes: saved.fileHashes } : saved,
      files: [...collectInputFiles(), stateFile],
    }));
  }
}
