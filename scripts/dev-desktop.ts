#!/usr/bin/env node
// Internal helper for scripts/code.*. It owns the Conductor-specific dev loop:
// Vite, desktop TypeScript watch, Electron launch, and restart handling.
import { fork, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const host = process.env.DEV_HOST || "127.0.0.1";
const port = Number(process.env.DEV_PORT || 5174);
// Keep the development URL aligned with VS Code's desktop renderer entry:
// code/electron-browser owns Electron workbench bootstrapping.
const devWorkbenchPath = "/src/cs/code/electron-browser/workbench/workbench-dev.html";
const devUrl = `http://${host}:${port}${devWorkbenchPath}`;
const devServerWarmupPaths = [
  devWorkbenchPath,
  "/@vite/client",
  "/src/cs/workbench/workbench.browser.main.ts",
  "/src/cs/code/browser/workbench/workbench.ts",
  "/src/cs/code/electron-browser/workbench/workbench.ts",
  "/src/cs/workbench/workbench.common.main.ts",
  "/src/cs/workbench/workbench.desktop.main.ts",
  "/src/cs/nls.ts",
  "/build/nls/en.json",
  "/build/nls/zh.json",
];

const isWin = process.platform === "win32";
const viteScriptPath = path.join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
const electronBuildScriptPath = path.join(process.cwd(), "scripts", "build-desktop-core.ts");
const electronBin = isWin
  ? path.join(process.cwd(), "node_modules", "electron", "dist", "electron.exe")
  : path.join(process.cwd(), "node_modules", ".bin", "electron");

const electronWatchReadyTimeoutMs = 20_000;

interface DesktopBuildReadyMessage {
  readonly type: "desktopBuildReady";
  readonly fingerprint: string;
}

interface DesktopBuildFailedMessage {
  readonly type: "desktopBuildFailed";
  readonly errorCount: number;
}

type DesktopBuildMessage = DesktopBuildReadyMessage | DesktopBuildFailedMessage;

let viteExited = false;
let viteExitCode = 0;
let isShuttingDown = false;
let restartTimer: NodeJS.Timeout | null = null;
let restartRequested = false;
let restartOperation: Promise<void> | null = null;
let electronProc: ChildProcess | null = null;
let electronBuildWatchProc: ChildProcess | null = null;
const expectedElectronExits = new WeakSet<ChildProcess>();

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

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

const viteProc = spawn(
  process.execPath,
  [
    viteScriptPath,
    "--configLoader",
    "runner",
    "--host",
    host,
    "--port",
    String(port),
    "--logLevel",
    "warn",
  ],
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

const isDesktopBuildMessage = (message: unknown): message is DesktopBuildMessage => {
  if (!message || typeof message !== "object" || !("type" in message)) {
    return false;
  }

  const candidate = message as Partial<DesktopBuildMessage>;
  return (
    (candidate.type === "desktopBuildReady" && typeof candidate.fingerprint === "string") ||
    (candidate.type === "desktopBuildFailed" && typeof candidate.errorCount === "number")
  );
};

const startElectronBuildWatcher = () => {
  let readyTimeout: NodeJS.Timeout | null = null;
  let resolveReady: () => void = () => {};
  let rejectReady: (error: Error) => void = () => {};
  let isReady = false;
  let lastBuildFingerprint = "";
  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const clearReadyTimeout = () => {
    if (readyTimeout) {
      clearTimeout(readyTimeout);
      readyTimeout = null;
    }
  };

  const markReady = () => {
    if (isReady) return;
    isReady = true;
    clearReadyTimeout();
    resolveReady();
  };

  const failWatcher = (error: Error) => {
    if (!isReady) {
      clearReadyTimeout();
      rejectReady(error);
      return;
    }

    console.error(`[desktop] ${error.message}`);
    void shutdown(1);
  };

  const handleBuildReady = (fingerprint: string) => {
    if (!isReady) {
      lastBuildFingerprint = fingerprint;
      markReady();
      return;
    }

    if (fingerprint === lastBuildFingerprint) return;

    lastBuildFingerprint = fingerprint;
    scheduleElectronRestart();
  };

  const proc = fork(electronBuildScriptPath, ["--watch", "--preserveWatchOutput"], {
    execArgv: ["--experimental-strip-types"],
    stdio: ["inherit", "inherit", "inherit", "ipc"],
    env: process.env,
  });

  proc.on("message", message => {
    if (!isDesktopBuildMessage(message)) return;

    if (message.type === "desktopBuildReady") {
      handleBuildReady(message.fingerprint);
      return;
    }

    if (!isReady) {
      failWatcher(new Error(`Initial desktop TypeScript build failed with ${message.errorCount} error(s).`));
    }
  });

  readyTimeout = setTimeout(() => {
    failWatcher(
      new Error(`Electron TypeScript build did not complete within ${electronWatchReadyTimeoutMs}ms.`),
    );
  }, electronWatchReadyTimeoutMs);

  proc.on("error", (error) => {
    if (isShuttingDown) return;
    failWatcher(new Error(`Failed to start Electron TypeScript watcher: ${error.message}`));
  });

  proc.on("exit", (code) => {
    if (isShuttingDown) return;
    failWatcher(new Error(`Electron TypeScript watcher exited unexpectedly (code: ${code ?? 0}).`));
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
  }
};

const stopProcessTreeOnWindows = (proc: ChildProcess | null, timeoutMs = 5_000) =>
  new Promise<void>((resolve, reject) => {
    if (!proc || !proc.pid || proc.killed || proc.exitCode !== null) {
      resolve();
      return;
    }

    let settled = false;
    let waitTimer: NodeJS.Timeout | null = null;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (waitTimer) {
        clearTimeout(waitTimer);
        waitTimer = null;
      }
      proc.off("exit", onExit);
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const onExit = () => {
      finish();
    };
    proc.once("exit", onExit);

    waitTimer = setTimeout(() => {
      finish(new Error(`Timed out stopping process tree ${proc.pid}.`));
    }, timeoutMs);

    const killer = spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });

    killer.once("error", error => {
      finish(new Error(`Failed to run taskkill for process ${proc.pid}: ${error.message}`));
    });

    killer.once("exit", code => {
      if (code === 0 || proc.exitCode !== null) {
        finish();
        return;
      }

      finish(new Error(`taskkill failed for process ${proc.pid} with exit code ${code ?? 1}.`));
    });
  });

const stopProcess = (proc: ChildProcess | null, signal: NodeJS.Signals = "SIGTERM", timeoutMs = 5_000) =>
  new Promise<void>((resolve, reject) => {
    if (!proc || proc.killed || proc.exitCode !== null) {
      resolve();
      return;
    }

    if (isWin) {
      void stopProcessTreeOnWindows(proc, timeoutMs).then(resolve, reject);
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

    if (electronProc === proc) {
      electronProc = null;
    }
    if (expectedElectronExits.has(proc)) return;

    void shutdown(code ?? 0);
  });

  electronProc = proc;
};

const scheduleElectronRestart = () => {
  if (isShuttingDown) return;

  restartRequested = true;
  if (restartTimer) clearTimeout(restartTimer);

  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (restartOperation || !restartRequested) return;

    restartOperation = (async () => {
      const currentElectron = electronProc;
      if (currentElectron) {
        expectedElectronExits.add(currentElectron);
        console.log("[desktop] Restarting Electron.");
        await stopProcess(currentElectron);
      }

      // Builds completed while the old process was stopping are included in the new launch.
      restartRequested = false;
      if (!isShuttingDown) {
        startElectron();
      }
    })();

    void restartOperation
      .catch(error => {
        if (!isShuttingDown) {
          console.error(`[desktop] Failed to restart Electron: ${getErrorMessage(error)}`);
          void shutdown(1);
        }
      })
      .finally(() => {
        restartOperation = null;
        if (restartRequested && !isShuttingDown) {
          scheduleElectronRestart();
        }
      });
  }, 120);
};

const shutdown = async (exitCode = 0) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  restartRequested = false;

  const stopResults = await Promise.allSettled([
    stopProcess(electronProc),
    stopProcess(electronBuildWatchProc),
    stopProcess(viteProc),
  ]);
  const stopErrors = stopResults
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map(result => getErrorMessage(result.reason));
  for (const error of stopErrors) {
    console.error(`[desktop] ${error}`);
  }

  process.exit(exitCode || (stopErrors.length ? 1 : 0));
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
  console.error(`[desktop] ${getErrorMessage(error)}`);
  await shutdown(1);
}

try {
  await warmupDevServer(devUrl);
} catch (error) {
  console.warn(`[desktop] Dev server warmup failed: ${getErrorMessage(error)}`);
}

try {
  await startElectronBuildWatcher();
  startElectron();
} catch (error) {
  console.error(`[desktop] Failed to start desktop development: ${getErrorMessage(error)}`);
  await shutdown(1);
}
