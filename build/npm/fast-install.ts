/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as child_process from "node:child_process";
import {
  forceInstallMessage,
  isUpToDate,
  root,
} from "./installStateHash.ts";

const isSilent = process.argv.includes("--silent");

if (!process.argv.includes("--force") && isUpToDate()) {
  if (!isSilent) {
    console.log(`\x1b[32mAll dependencies up to date.\x1b[0m ${forceInstallMessage}`);
  }
  process.exit(0);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = child_process.spawnSync(npm, ["install"], {
  cwd: root,
  env: {
    ...process.env,
    CONDUCTOR_FORCE_INSTALL: "1",
    CONDUCTOR_FORCE_POSTINSTALL: "1",
  },
  shell: true,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
