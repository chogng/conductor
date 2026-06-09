import * as fs from "node:fs";
import path from "node:path";
import {
  computeContents,
  computeState,
  isUpToDate,
  root,
  stateContentsFile,
  stateFile,
} from "./installStateHash.ts";

function log(message: string): void {
  console.log(`[postinstall] ${message}`);
}

if (!process.env.CONDUCTOR_FORCE_POSTINSTALL && isUpToDate()) {
  log("Dependencies are up to date; skipping postinstall bookkeeping.");
  process.exit(0);
}

const nodeModulesDir = path.join(root, "node_modules");
fs.mkdirSync(nodeModulesDir, { recursive: true });
fs.writeFileSync(stateFile, JSON.stringify(computeState(), null, 2));
fs.writeFileSync(stateContentsFile, JSON.stringify(computeContents(), null, 2));
log(`Wrote ${path.relative(root, stateFile)}.`);
