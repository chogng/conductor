import * as fs from "node:fs";
import path from "node:path";
import { root } from "./installStateHash.ts";

function fail(message: string): never {
  console.error(`\x1b[1;31m*** ${message} ***\x1b[0m`);
  process.exit(1);
}

const npmExecPath = process.env.npm_execpath ?? "";
const npmUserAgent = process.env.npm_config_user_agent ?? "";

if (/yarn/i.test(npmExecPath) || /^yarn\//i.test(npmUserAgent)) {
  fail("Yarn is not supported in this repo. Use npm install instead.");
}

if (/pnpm/i.test(npmExecPath) || /^pnpm\//i.test(npmUserAgent)) {
  fail("pnpm is not supported in this repo. Use npm install instead.");
}

const npmVersionMatch = npmUserAgent.match(/npm\/(\d+)\.(\d+)\.(\d+)/);
if (npmVersionMatch) {
  const npmMajor = Number.parseInt(npmVersionMatch[1], 10);
  if (npmMajor >= 12) {
    fail(`Please use npm version < 12.0.0. Currently using ${npmUserAgent}.`);
  }
}

const cacheRoot = path.join(root, ".build", "cache", "npm");
fs.mkdirSync(cacheRoot, { recursive: true });

const configuredCache = process.env.npm_config_cache;
if (configuredCache && path.resolve(configuredCache) !== cacheRoot) {
  console.warn(`[preinstall] npm cache is ${configuredCache}; repo default is ${cacheRoot}.`);
}
