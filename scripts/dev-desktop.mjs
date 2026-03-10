#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readdirSync, watch } from "node:fs";
import net from "node:net";
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
const electronBuildWatchCmd = isWin ? "cmd.exe" : npmCmd;
const electronBuildWatchArgs = isWin
  ? ["/d", "/s", "/c", npmCmd, "run", "build:desktop:core", "--", "--watch", "--preserveWatchOutput"]
  : ["run", "build:desktop:core", "--", "--watch", "--preserveWatchOutput"];
const electronBin = isWin
  ? path.join(process.cwd(), "node_modules", "electron", "dist", "electron.exe")
  : path.join(process.cwd(), "node_modules", ".bin", "electron");
const desktopDistDir = path.join(process.cwd(), "desktop-dist");

const watchedExtensions = new Set([".cjs", ".js", ".mjs", ".json"]);

let viteExited = false;
let viteExitCode = 0;
let isShuttingDown = false;
let restartTimer = null;
let isRestarting = false;
let electronProc = null;
let electronBuildWatchProc = null;
const watcherClosers = [];

const checkPortAvailability = (targetHost, targetPort) =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();

    probe.once("error", (error) => {
      if (error?.code === "EADDRINUSE") {
        resolve(false);
        return;
      }
      reject(error);
    });

    probe.listen({ host: targetHost, port: targetPort, exclusive: true }, () => {
      probe.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(true);
      });
    });
  });

try {
  const isPortAvailable = await checkPortAvailability(host, port);
  if (!isPortAvailable) {
    console.error(`[desktop] Dev port already in use: ${host}:${port}`);
    console.error("[desktop] Stop the existing process or set DEV_PORT to use another port.");
    process.exit(1);
  }
} catch (error) {
  console.error(`[desktop] Failed to check dev port ${host}:${port}: ${error.message}`);
  process.exit(1);
}

console.log(`[desktop] Starting Vite dev server at ${devUrl}`);

const viteProc = spawn(
  viteCmd,
  viteArgs,
  {
    stdio: "inherit",
    env: process.env,
  },
);

viteProc.on("error", (error) => {
  if (isShuttingDown) return;
  console.error(`[desktop] Failed to start Vite: ${error.message}`);
  void shutdown(1);
});

viteProc.on("exit", (code) => {
  viteExited = true;
  viteExitCode = code ?? 0;

  if (!isShuttingDown) {
    console.error(`[desktop] Vite exited unexpectedly (code: ${viteExitCode}).`);
    void shutdown(viteExitCode || 1);
  }
});

const startElectronBuildWatcher = () => {
  console.log("[desktop] Starting Electron TypeScript watcher.");
  const proc = spawn(electronBuildWatchCmd, electronBuildWatchArgs, {
    stdio: "inherit",
    env: process.env,
  });

  proc.on("error", (error) => {
    if (isShuttingDown) return;
    console.error(`[desktop] Failed to start Electron TS watcher: ${error.message}`);
    void shutdown(1);
  });

  proc.on("exit", (code) => {
    if (isShuttingDown) return;
    console.error(`[desktop] Electron TS watcher exited unexpectedly (code: ${code ?? 0}).`);
    void shutdown((code ?? 1) || 1);
  });

  electronBuildWatchProc = proc;
};

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

const stopProcessTreeOnWindows = (proc, timeoutMs = 5_000) =>
  new Promise((resolve) => {
    if (!proc || !proc.pid || proc.killed || proc.exitCode !== null) {
      resolve();
      return;
    }

    let settled = false;
    let waitTimer = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (waitTimer) {
        clearTimeout(waitTimer);
        waitTimer = null;
      }
      proc.off("exit", onExit);
      resolve();
    };

    const onExit = () => {
      finish();
    };
    proc.once("exit", onExit);

    waitTimer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // Ignore if already gone.
      }
      finish();
    }, timeoutMs);

    const killer = spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });

    killer.once("error", () => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // Ignore if already gone.
      }
      finish();
    });

    killer.once("exit", () => {
      if (proc.exitCode !== null || proc.killed) {
        finish();
      }
    });
  });

const stopProcess = (proc, signal = "SIGTERM", timeoutMs = 5_000) =>
  new Promise((resolve) => {
    if (!proc || proc.killed || proc.exitCode !== null) {
      resolve();
      return;
    }

    if (isWin) {
      void stopProcessTreeOnWindows(proc, timeoutMs).then(resolve);
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
  console.log(`[desktop] Launching Electron with ${devUrl}`);
  const proc = spawn(electronBin, ["."], {
    stdio: "inherit",
    env: {
      ...process.env,
      ELECTRON_START_URL: devUrl,
    },
  });

  proc.on("error", (error) => {
    if (isShuttingDown) return;
    console.error(`[desktop] Failed to start Electron: ${error.message}`);
    void shutdown(1);
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
  const rootDir = desktopDistDir;

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
  await stopProcess(electronBuildWatchProc);
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

console.log(`[desktop] Waiting for dev server: ${devUrl}`);

try {
  await waitForServer(devUrl);
} catch (error) {
  console.error(`[desktop] ${error.message}`);
  await shutdown(1);
}

console.log("[desktop] Dev server is ready.");
startElectronBuildWatcher();
startElectron();

try {
  startElectronWatchers();
} catch (error) {
  console.error(`[desktop] Failed to start file watchers: ${error.message}`);
  await shutdown(1);
}
