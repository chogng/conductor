#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const isWin = process.platform === "win32";

const runNpm = (scriptName, extraArgs = []) => {
  if (isWin) {
    const res = spawnSync(
      "cmd.exe",
      ["/d", "/s", "/c", "npm", "run", scriptName, ...extraArgs],
      { stdio: "inherit" },
    );
    return res.status ?? 1;
  }

  const res = spawnSync("npm", ["run", scriptName, ...extraArgs], { stdio: "inherit" });
  return res.status ?? 1;
};

if (isWin) {
  // Default desktop release needs the Origin CSV worker and the Rust worker.
  // ZIP/BATCH Origin workers are optional and can be built manually when needed.
  const code = runNpm("build:origin-csv-worker");
  if (code !== 0) process.exit(code);

  {
    const code = runNpm("build:rs-worker");
    if (code !== 0) process.exit(code);
  }
} else {
  // Origin workers are Windows .exe builds (pywin32/originpro). Skip on non-Windows.
  console.log("[build:desktop] Skipping Origin worker build (Windows-only).");
}

{
  const code = runNpm("verify:icons");
  if (code !== 0) process.exit(code);
}

{
  const code = runNpm("build:desktop:core");
  if (code !== 0) process.exit(code);
}

{
  const code = runNpm("build:web:desktop");
  if (code !== 0) process.exit(code);
}
