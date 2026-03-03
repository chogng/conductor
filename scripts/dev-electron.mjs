#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readdirSync, watch } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const host = process.env.DEV_HOST || "127.0.0.1";
const port = Number(process.env.DEV_PORT || 5174);
const devUrl = `http://${host}:${port}/`;

const isWin = process.platform === "win32";
const npmCmd = "npm";
const viteCmd = isWin ? "cmd.exe" : npmCmd;
const viteArgs = isWin
  ? ["/d", "/s", "/c", npmCmd, "run", "dev", "--", "--host", host, "--port", String(port)]
  : ["run", "dev", "--", "--host", host, "--port", String(port)];
const electronBin = isWin
  ? path.join(process.cwd(), "node_modules", "electron", "dist", "electron.exe")
  : path.join(process.cwd(), "node_modules", ".bin", "electron");

const watchedExtensions = new Set([".cjs", ".js", ".mjs", ".json"]);

let viteExited = false;
let viteExitCode = 0;
let isShuttingDown = false;
let restartTimer = null;
let isRestarting = false;
let electronProc = null;
const watcherClosers = [];

const viteProc = spawn(
  viteCmd,
  viteArgs,
  {
    stdio: "inherit",
    env: process.env,
  },
);

viteProc.on("exit", (code) => {
  viteExited = true;
  viteExitCode = code ?? 0;

  if (!isShuttingDown) {
    console.error(`[desktop] Vite exited unexpectedly (code: ${viteExitCode}).`);
    void shutdown(viteExitCode || 1);
  }
});

const waitForServer = async (url, timeoutMs = 60_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (viteExited) {
      throw new Error(`Vite exited before ready (code: ${viteExitCode}).`);
    }
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) return;
    } catch {
      // Retry until timeout.
    }
    await sleep(250);
  }
  throw new Error(`Timeout waiting for dev server: ${url}`);
};

const stopProcess = (proc, signal = "SIGTERM", timeoutMs = 5_000) =>
  new Promise((resolve) => {
    if (!proc || proc.killed || proc.exitCode !== null) {
      resolve();
      return;
    }

    let forceKillTimer = null;
    const cleanup = () => {
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
        forceKillTimer = null;
      }
      proc.off("exit", onExit);
    };

    const onExit = () => {
      cleanup();
      resolve();
    };
    proc.once("exit", onExit);

    try {
      // Resume suspended processes before terminating, otherwise they can keep ports occupied.
      if (signal !== "SIGKILL") {
        try {
          proc.kill("SIGCONT");
        } catch {
          // Ignore unsupported or already-exited cases.
        }

        forceKillTimer = setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {
            cleanup();
            resolve();
          }
        }, timeoutMs);
      }

      proc.kill(signal);
    } catch {
      cleanup();
      resolve();
    }
  });

const startElectron = () => {
  const proc = spawn(electronBin, ["."], {
    stdio: "inherit",
    env: {
      ...process.env,
      ELECTRON_START_URL: devUrl,
    },
  });

  proc.on("exit", (code) => {
    if (isShuttingDown) return;

    if (!isRestarting) {
      void shutdown(code ?? 0);
    }
  });

  electronProc = proc;
};

const scheduleElectronRestart = (reason = "files changed") => {
  if (isShuttingDown) return;

  if (restartTimer) clearTimeout(restartTimer);

  restartTimer = setTimeout(async () => {
    if (!electronProc) {
      startElectron();
      return;
    }

    isRestarting = true;
    console.log(`[desktop] Restarting Electron (${reason})...`);
    await stopProcess(electronProc);
    startElectron();
    isRestarting = false;
  }, 120);
};

const shouldRestartForPath = (filePath) => {
  if (!filePath) return false;

  const normalized = filePath.replaceAll("\\", "/");

  if (normalized.includes("node_modules")) return false;

  const ext = path.extname(normalized);
  return watchedExtensions.has(ext);
};

const handleElectronFileEvent = (eventType, changedPath) => {
  if (!shouldRestartForPath(changedPath)) return;
  scheduleElectronRestart(`${eventType}: ${changedPath}`);
};

const trackWatcher = (watcher) => {
  watcher.on("error", (error) => {
    if (isShuttingDown) return;

    console.error(`[desktop] Watcher error: ${error.message}`);
    void shutdown(1);
  });

  watcherClosers.push(() => {
    try {
      watcher.close();
    } catch {
      // Ignore close errors during shutdown.
    }
  });
};

const startElectronWatchers = () => {
  const rootDir = path.join(process.cwd(), "electron");

  try {
    const recursiveWatcher = watch(
      rootDir,
      { recursive: true },
      (eventType, filename) => {
        if (!filename) return;
        handleElectronFileEvent(eventType, String(filename));
      },
    );
    trackWatcher(recursiveWatcher);
    return;
  } catch (error) {
    if (error?.code !== "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM") throw error;

    console.warn(
      "[desktop] Recursive watch unsupported on this platform, using directory-level watchers.",
    );

    const watchDirectory = (dirPath) => {
      const watcher = watch(dirPath, (eventType, filename) => {
        if (!filename) return;

        const changedAbsPath = path.join(dirPath, String(filename));
        const changedRelPath = path.relative(rootDir, changedAbsPath);
        handleElectronFileEvent(eventType, changedRelPath);
      });

      trackWatcher(watcher);

      const entries = readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        watchDirectory(path.join(dirPath, entry.name));
      }
    };

    watchDirectory(rootDir);
  }
};

const shutdown = async (exitCode = 0) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  for (const closeWatcher of watcherClosers) closeWatcher();

  await stopProcess(electronProc);
  await stopProcess(viteProc);

  process.exit(exitCode);
};

const shutdownSignals = ["SIGINT", "SIGTERM", "SIGHUP"];
if (!isWin) shutdownSignals.push("SIGTSTP");

for (const signal of shutdownSignals) {
  process.on(signal, () => {
    if (signal === "SIGTSTP") {
      console.warn(
        "[desktop] Caught SIGTSTP, shutting down to avoid stale dev ports.",
      );
    }
    void shutdown(0);
  });
}

try {
  await waitForServer(devUrl);
} catch (error) {
  console.error(`[desktop] ${error.message}`);
  await shutdown(1);
}

startElectron();

try {
  startElectronWatchers();
} catch (error) {
  console.error(`[desktop] Failed to start file watchers: ${error.message}`);
  await shutdown(1);
}
