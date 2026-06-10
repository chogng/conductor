import path from "node:path";
import fs from "node:fs";

import { app } from "electron";

import { configurePortable, getUserDataPath } from "./bootstrap-node.js";
import { product } from "./bootstrap-meta.js";

interface MainProcessArgs {
  readonly "user-data-dir"?: string;
}

function parseMainProcessArgs(argv: readonly string[]): MainProcessArgs {
  const args: { "user-data-dir"?: string } = {};

  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === "--user-data-dir") {
      args["user-data-dir"] = argv[index + 1];
      index++;
    } else if (value.startsWith("--user-data-dir=")) {
      args["user-data-dir"] = value.slice("--user-data-dir=".length);
    }
  }

  return args;
}

const portable = configurePortable(product);
const args = parseMainProcessArgs(process.argv);
const userDataPath = getUserDataPath(args, product.nameShort);

app.setPath("userData", userDataPath);

const codeCachePath = getCodeCachePath();

if (portable.isPortable) {
  app.setAppLogsPath(path.join(userDataPath, "logs"));
}

app.once("ready", () => {
  void startup().catch(error => {
    console.error(error);
    app.exit(1);
  });
});

async function startup(): Promise<void> {
  const resolvedCodeCachePath = await mkdirpIgnoreError(codeCachePath);
  process.env["CONDUCTOR_CODE_CACHE_PATH"] = resolvedCodeCachePath || "";

  await import("./cs/code/electron-main/main.js");
}

function getCodeCachePath(): string | undefined {
  if (process.argv.indexOf("--no-cached-data") > 0) {
    return undefined;
  }

  if (process.env["CONDUCTOR_DEV"]) {
    return undefined;
  }

  // Code cache is keyed by build commit so upgraded builds cannot reuse stale
  // V8/Electron cache data generated from a different application bundle.
  const commit = product.commit;
  if (!commit) {
    return undefined;
  }

  return path.join(userDataPath, "CachedData", commit);
}

async function mkdirpIgnoreError(dir: string | undefined): Promise<string | undefined> {
  if (typeof dir === "string") {
    try {
      await fs.promises.mkdir(dir, { recursive: true });
      return dir;
    } catch {
      return undefined;
    }
  }

  return undefined;
}
