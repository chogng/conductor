#!/usr/bin/env node
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { readdirSync, watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import net from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const host = process.env.DEV_HOST || "127.0.0.1";
const port = Number(process.env.DEV_PORT || 5174);
// Keep the development URL aligned with VS Code's desktop renderer entry:
// code/electron-browser owns Electron workbench bootstrapping.
const devWorkbenchPath = "/src/cs/code/electron-browser/workbench/workbench-dev.html";
const devUrl = `http://${host}:${port}${devWorkbenchPath}`;
const devStartupStartMs = Date.now();
const devServerWarmupPaths = [
  devWorkbenchPath,
  "/@vite/client",
  "/src/cs/workbench/workbench.browser.main.ts",
  "/src/cs/code/browser/workbench/workbench.ts",
  "/src/cs/code/electron-browser/workbench/workbench.ts",
  "/src/cs/platform/platform.browser.main.ts",
  "/src/cs/platform/platform.desktop.main.ts",
  "/src/cs/workbench/workbench.common.main.ts",
  "/src/cs/workbench/workbench.browser.main.ts",
  "/src/cs/workbench/workbench.desktop.main.ts",
  "/src/cs/workbench/workbench.contributions.main.ts",
  "/src/cs/nls.ts",
  "/build/nls/en.json",
  "/build/nls/zh.json",
];

const isWin = process.platform === "win32";
const npmCmd = "npm";
const viteCmd = isWin ? "cmd.exe" : npmCmd;
const viteArgs = isWin
  ? ["/d", "/s", "/c", npmCmd, "run", "dev:vite", "--", "--host", host, "--port", String(port)]
  : ["run", "dev:vite", "--", "--host", host, "--port", String(port)];
const electronBuildWatchCmd = isWin ? "cmd.exe" : npmCmd;
const electronBuildWatchArgs = isWin
  ? ["/d", "/s", "/c", npmCmd, "run", "build:desktop:core", "--", "--watch", "--preserveWatchOutput"]
  : ["run", "build:desktop:core", "--", "--watch", "--preserveWatchOutput"];
const electronBin = isWin
  ? path.join(process.cwd(), "node_modules", "electron", "dist", "electron.exe")
  : path.join(process.cwd(), "node_modules", ".bin", "electron");
const desktopDistDir = path.join(process.cwd(), "desktop-dist");

const watchedExtensions = new Set([".cjs", ".js", ".mjs", ".json"]);
const electronWatchReadyMarker = "Watching for file changes.";
const electronWatchReadyTimeoutMs = 20_000;

let viteExited = false;
let viteExitCode = 0;
let isShuttingDown = false;
let restartTimer: NodeJS.Timeout | null = null;
let isRestarting = false;
let electronProc: ChildProcess | null = null;
let electronBuildWatchProc: ChildProcess | null = null;
let electronBuildWatcherReady: Promise<void> | null = null;
const watcherClosers: Array<() => void> = [];

const logDesktopDevBoot = (stage: string, extra = "") => {
  const elapsedMs = Date.now() - devStartupStartMs;
  const suffix = extra ? ` ${extra}` : "";
  console.log(`[desktop] +${elapsedMs}ms ${stage}${suffix}`);
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const getErrorCode = (error: unknown) => {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
};

const checkPortAvailability = (targetHost: string, targetPort: number) =>
  new Promise<boolean>((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();

    probe.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
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
  console.error(`[desktop] Failed to check dev port ${host}:${port}: ${getErrorMessage(error)}`);
  process.exit(1);
}

console.log(`[desktop] Starting Vite dev server at ${devUrl}`);

const viteProc = spawn(
  viteCmd,
  viteArgs,
  {
    stdio: "inherit",
    env: {
      ...process.env,
      CONDUCTOR_DESKTOP_DEV: "1",
    },
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
  let readyTimeout: NodeJS.Timeout | null = null;
  let resolveReady: () => void = () => {};
  let isReady = false;
  const readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const markReady = (warning = "") => {
    if (isReady) return;
    isReady = true;
    if (readyTimeout) {
      clearTimeout(readyTimeout);
      readyTimeout = null;
    }
    if (warning) {
      console.warn(`[desktop] ${warning}`);
    }
    resolveReady();
  };

  const proc = spawn(electronBuildWatchCmd, electronBuildWatchArgs, {
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
  });

  const relayOutput = (stream: NodeJS.ReadableStream | null, outputTarget: NodeJS.WriteStream) => {
    if (!stream) return;
    stream.setEncoding("utf8");
    let pending = "";
    stream.on("data", (chunk: string | Buffer) => {
      const text = String(chunk);
      outputTarget.write(text);
      if (isReady) return;

      pending += text;
      if (pending.includes(electronWatchReadyMarker)) {
        markReady();
        return;
      }

      if (pending.length > electronWatchReadyMarker.length * 2) {
        pending = pending.slice(-electronWatchReadyMarker.length * 2);
      }
    });
  };

  relayOutput(proc.stdout, process.stdout);
  relayOutput(proc.stderr, process.stderr);

  readyTimeout = setTimeout(() => {
    markReady(
      `Electron TS watcher startup exceeded ${electronWatchReadyTimeoutMs}ms; enabling desktop restart watchers anyway.`,
    );
  }, electronWatchReadyTimeoutMs);

  proc.on("error", (error) => {
    if (isShuttingDown) return;
    markReady();
    console.error(`[desktop] Failed to start Electron TS watcher: ${error.message}`);
    void shutdown(1);
  });

  proc.on("exit", (code) => {
    if (isShuttingDown) return;
    markReady();
    console.error(`[desktop] Electron TS watcher exited unexpectedly (code: ${code ?? 0}).`);
    void shutdown((code ?? 1) || 1);
  });

  electronBuildWatchProc = proc;
  return readyPromise;
};

const waitForServer = async (url: string, timeoutMs = 60_000) => {
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

const warmupDevServer = async (baseUrl: string) => {
  for (const warmupPath of devServerWarmupPaths) {
    const warmupUrl = new URL(warmupPath, baseUrl).toString();
    const started = Date.now();
    const response = await fetch(warmupUrl, {
      method: "GET",
      headers: {
        "cache-control": "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Warmup request failed for ${warmupPath}: ${response.status} ${response.statusText}`,
      );
    }

    await response.arrayBuffer();
    logDesktopDevBoot(
      "dev-server:warmup",
      `(path=${warmupPath} duration=${Date.now() - started}ms)`,
    );
  }
};

const stopProcessTreeOnWindows = (proc: ChildProcess | null, timeoutMs = 5_000) =>
  new Promise<void>((resolve) => {
    if (!proc || !proc.pid || proc.killed || proc.exitCode !== null) {
      resolve();
      return;
    }

    let settled = false;
    let waitTimer: NodeJS.Timeout | null = null;
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

const stopProcess = (proc: ChildProcess | null, signal: NodeJS.Signals = "SIGTERM", timeoutMs = 5_000) =>
  new Promise<void>((resolve) => {
    if (!proc || proc.killed || proc.exitCode !== null) {
      resolve();
      return;
    }

    if (isWin) {
      void stopProcessTreeOnWindows(proc, timeoutMs).then(resolve);
      return;
    }

    let forceKillTimer: NodeJS.Timeout | null = null;
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
  const electronEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ELECTRON_START_URL: devUrl,
  };
  delete electronEnv.ELECTRON_RUN_AS_NODE;

  const proc = spawn(electronBin, ["."], {
    stdio: "inherit",
    env: electronEnv,
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

const shouldRestartForPath = (filePath: string) => {
  if (!filePath) return false;

  const normalized = filePath.replaceAll("\\", "/");

  if (normalized.includes("node_modules")) return false;

  const ext = path.extname(normalized);
  return watchedExtensions.has(ext);
};

const handleElectronFileEvent = (eventType: string, changedPath: string) => {
  if (!shouldRestartForPath(changedPath)) return;
  scheduleElectronRestart(`${eventType}: ${changedPath}`);
};

const trackWatcher = (watcher: FSWatcher) => {
  watcher.on("error", (error: Error) => {
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
    if (getErrorCode(error) !== "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM") throw error;

    console.warn(
      "[desktop] Recursive watch unsupported on this platform, using directory-level watchers.",
    );

    const watchDirectory = (dirPath: string) => {
      const watcher = watch(dirPath, (eventType: string, filename: string | null) => {
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

logDesktopDevBoot("dev-server:wait", `(url=${devUrl})`);

try {
  await waitForServer(devUrl);
} catch (error) {
  console.error(`[desktop] ${getErrorMessage(error)}`);
  await shutdown(1);
}

logDesktopDevBoot("dev-server:ready");

try {
  await warmupDevServer(devUrl);
} catch (error) {
  console.warn(`[desktop] Dev server warmup failed: ${getErrorMessage(error)}`);
}

try {
  electronBuildWatcherReady ??= startElectronBuildWatcher();
  await electronBuildWatcherReady;
  logDesktopDevBoot("electron:start");
  startElectron();
  startElectronWatchers();
} catch (error) {
  console.error(`[desktop] Failed to start file watchers: ${getErrorMessage(error)}`);
  await shutdown(1);
}
