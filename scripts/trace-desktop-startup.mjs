#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const workspace = process.cwd();
const host = process.env.DEV_HOST || "127.0.0.1";
const port = Number(process.env.DEV_PORT || 5194);
const timeoutMs = Number(process.env.CONDUCTOR_DESKTOP_STARTUP_TRACE_TIMEOUT_MS || 30_000);
const skipBuild = process.argv.includes("--skip-build");
const isWin = process.platform === "win32";
const traceStartMs = Date.now();
const outputRoot = path.join(workspace, ".build", "bench", "desktop-startup");
const userDataDir = path.join(outputRoot, "user-data");
const codeCacheDir = path.join(outputRoot, "code-cache");
const devWorkbenchPath = "/src/cs/code/electron-browser/workbench/workbench-dev.html";
const devUrl = `http://${host}:${port}${devWorkbenchPath}?bootProfile=1`;
const electronBin = isWin
  ? path.join(workspace, "node_modules", "electron", "dist", "electron.exe")
  : path.join(workspace, "node_modules", ".bin", "electron");
const warmupPaths = [
  devWorkbenchPath,
  "/@vite/client",
  "/src/cs/workbench/workbench.desktop.main.ts",
  "/src/cs/workbench/workbench.browser.main.ts",
  "/src/cs/code/electron-browser/workbench/workbench.ts",
  "/src/cs/workbench/browser/workbench.ts",
  "/src/cs/workbench/workbench.common.main.ts",
  "/src/cs/nls.ts",
  "/build/nls/en.json",
  "/build/nls/zh.json",
];

const children = new Set();
const events = [];
const eventKeys = new Set();
let targetReached = false;
let targetFailure = null;

const log = (message) => {
  const elapsed = Date.now() - traceStartMs;
  console.log(`[desktop-startup-trace] +${elapsed}ms ${message}`);
};

const getErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const npmCommand = () => isWin ? "cmd.exe" : "npm";

const npmArgs = (...args) =>
  isWin ? ["/d", "/s", "/c", "npm", ...args] : args;

const spawnChild = (name, command, args, options = {}) => {
  const child = spawn(command, args, {
    cwd: workspace,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    ...options,
  });
  children.add(child);
  child.once("exit", () => {
    children.delete(child);
  });
  child.once("error", error => {
    if (!targetFailure) {
      targetFailure = new Error(`${name} failed to start: ${getErrorMessage(error)}`);
    }
  });
  return child;
};

const attachLines = (stream, onLine) => {
  if (!stream) {
    return;
  }

  stream.setEncoding("utf8");
  let pending = "";
  stream.on("data", chunk => {
    pending += String(chunk);
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      onLine(line);
    }
  });
  stream.on("end", () => {
    if (pending) {
      onLine(pending);
      pending = "";
    }
  });
};

const runCommand = (name, command, args, options = {}) =>
  new Promise((resolve, reject) => {
    log(`${name}:start`);
    const child = spawnChild(name, command, args, options);
    attachLines(child.stdout, line => {
      if (line.trim()) {
        console.log(line);
      }
    });
    attachLines(child.stderr, line => {
      if (line.trim()) {
        console.error(line);
      }
    });
    child.once("exit", code => {
      if (code === 0) {
        log(`${name}:done`);
        resolve();
      } else {
        reject(new Error(`${name} exited with code ${code ?? 0}`));
      }
    });
  });

const checkPortAvailable = (targetHost, targetPort) =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", error => {
      if (error.code === "EADDRINUSE") {
        resolve(false);
        return;
      }
      reject(error);
    });
    server.listen({ host: targetHost, port: targetPort, exclusive: true }, () => {
      server.close(closeError => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(true);
      });
    });
  });

const waitForServer = async (url, deadlineMs) => {
  const started = Date.now();
  while (Date.now() - started < deadlineMs) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for dev server: ${url}`);
};

const warmupServer = async (baseUrl) => {
  const started = Date.now();
  for (const warmupPath of warmupPaths) {
    const response = await fetch(new URL(warmupPath, baseUrl), {
      headers: { "cache-control": "no-cache" },
    });
    if (!response.ok) {
      throw new Error(`Warmup failed for ${warmupPath}: ${response.status} ${response.statusText}`);
    }
    await response.arrayBuffer();
  }
  log(`dev-server:warmup:done requests=${warmupPaths.length} duration=${Date.now() - started}ms`);
};

const parseBootLine = (line) => {
  const match = /\[boot\]\[(main|renderer|browser)\]\s+\+(\d+)ms\s+([^\s]+)(.*)$/.exec(line);
  if (!match) {
    return null;
  }

  return {
    source: match[1],
    elapsedMs: Number(match[2]),
    stage: match[3],
    extra: match[4].trim(),
    raw: line,
  };
};

const durationFromExtra = (extra) => {
  const match = /duration=(\d+)ms/.exec(extra ?? "");
  return match ? Number(match[1]) : null;
};

const handleElectronLine = (line, isError = false) => {
  if (line.trim()) {
    (isError ? console.error : console.log)(line);
  }

  const event = parseBootLine(line);
  if (!event) {
    return;
  }

  const eventKey = `${event.source}\0${event.elapsedMs}\0${event.stage}\0${durationFromExtra(event.extra) ?? ""}`;
  if (eventKeys.has(eventKey)) {
    return;
  }
  eventKeys.add(eventKey);

  events.push(event);
  if (event.stage === "workbench:service-layer:ready") {
    targetReached = true;
  }
  if (event.stage === "workbench:service-layer:failed") {
    targetFailure = new Error(`Renderer service layer failed: ${event.extra}`);
  }
};

const waitForTraceTarget = async (electronProc) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (targetFailure) {
      throw targetFailure;
    }
    if (targetReached) {
      return;
    }
    if (electronProc.exitCode !== null) {
      throw new Error(`Electron exited before service-layer ready (code=${electronProc.exitCode})`);
    }
    await sleep(100);
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for workbench:service-layer:ready`);
};

const stopProcessTreeOnWindows = (child, deadlineMs = 5000) =>
  new Promise(resolve => {
    if (!child || !child.pid || child.killed || child.exitCode !== null) {
      resolve();
      return;
    }

    const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    const timer = setTimeout(resolve, deadlineMs);
    killer.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    killer.once("error", () => {
      try {
        child.kill("SIGKILL");
      } catch {
        // Already exited.
      }
      clearTimeout(timer);
      resolve();
    });
  });

const stopChild = async (child) => {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }
  if (isWin) {
    await stopProcessTreeOnWindows(child);
    return;
  }

  child.kill("SIGTERM");
  await Promise.race([
    new Promise(resolve => child.once("exit", resolve)),
    sleep(5000).then(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // Already exited.
      }
    }),
  ]);
};

const cleanup = async () => {
  for (const child of Array.from(children).reverse()) {
    await stopChild(child);
  }
};

const findEvent = (source, stage) =>
  events.find(event => event.source === source && event.stage === stage);

const createDurationBreakdown = (source, stagePrefix) =>
  events
    .filter(event => event.source === source && event.stage.startsWith(stagePrefix))
    .map(event => ({
      stage: event.stage,
      elapsedMs: event.elapsedMs,
      durationMs: durationFromExtra(event.extra),
    }))
    .filter(event => event.durationMs !== null);

const createSummary = () => {
  const rendererUiReady = findEvent("renderer", "boot-ui:ready");
  const serviceScheduled = findEvent("renderer", "workbench:service-layer:scheduled");
  const serviceStart = findEvent("renderer", "workbench:service-layer:start");
  const serviceReady = findEvent("renderer", "workbench:service-layer:ready");
  const mainUiReady = findEvent("main", "renderer:boot-ui-ready");
  const mainWindowShown = findEvent("main", "main-window:show:done");
  return {
    generatedAt: new Date().toISOString(),
    devUrl,
    milestones: {
      rendererBootUiReadyMs: rendererUiReady?.elapsedMs ?? null,
      rendererServiceLayerScheduledMs: serviceScheduled?.elapsedMs ?? null,
      rendererServiceLayerStartMs: serviceStart?.elapsedMs ?? null,
      rendererServiceLayerReadyMs: serviceReady?.elapsedMs ?? null,
      rendererServiceLayerDurationMs: durationFromExtra(serviceReady?.extra),
      rendererUiReadyToServiceLayerStartMs:
        rendererUiReady && serviceStart ? serviceStart.elapsedMs - rendererUiReady.elapsedMs : null,
      rendererUiReadyToServiceLayerReadyMs:
        rendererUiReady && serviceReady ? serviceReady.elapsedMs - rendererUiReady.elapsedMs : null,
      mainRendererBootUiReadyMs: mainUiReady?.elapsedMs ?? null,
      mainWindowShownMs: mainWindowShown?.elapsedMs ?? null,
    },
    serviceLayerBreakdown: createDurationBreakdown("renderer", "workbench:service-layer"),
    serviceResolutionBreakdown: createDurationBreakdown("renderer", "workbench:service:get:"),
    workbenchRefreshBreakdown: createDurationBreakdown("renderer", "workbench:refresh:"),
    workbenchRenderBreakdown: createDurationBreakdown("renderer", "workbench:render:"),
    viewContainerBreakdown: createDurationBreakdown("renderer", "workbench:view-containers:"),
    layoutBreakdown: createDurationBreakdown("renderer", "workbench:layout:"),
    events,
  };
};

const createElectronEnv = () => {
  const env = {
    ...process.env,
    CONDUCTOR_BOOT_PROFILE: "1",
    CONDUCTOR_CODE_CACHE_PATH: codeCacheDir,
    ELECTRON_START_URL: devUrl,
    ELECTRON_NO_ATTACH_CONSOLE: "1",
    ELECTRON_ENABLE_LOGGING: "1",
    ELECTRON_ENABLE_STACK_DUMPING: "1",
    ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
};

process.once("SIGINT", () => {
  void cleanup().then(() => process.exit(130));
});
process.once("SIGTERM", () => {
  void cleanup().then(() => process.exit(143));
});

try {
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.rmSync(codeCacheDir, { recursive: true, force: true });
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(codeCacheDir, { recursive: true });

  if (!skipBuild) {
    await runCommand("build:desktop:core", npmCommand(), npmArgs("run", "build:desktop:core"));
  }

  const portAvailable = await checkPortAvailable(host, port);
  if (!portAvailable) {
    throw new Error(`Dev port already in use: ${host}:${port}`);
  }

  log(`dev-server:start url=http://${host}:${port}`);
  const viteProc = spawnChild(
    "vite",
    npmCommand(),
    npmArgs("run", "dev:vite", "--", "--host", host, "--port", String(port)),
    {
      env: {
        ...process.env,
        CONDUCTOR_DESKTOP_DEV: "1",
      },
    },
  );
  attachLines(viteProc.stdout, line => {
    if (line.trim()) {
      console.log(line);
    }
  });
  attachLines(viteProc.stderr, line => {
    if (line.trim()) {
      console.error(line);
    }
  });

  await waitForServer(devUrl, 60_000);
  log("dev-server:ready");
  await warmupServer(`http://${host}:${port}`);

  log("electron:start");
  const electronProc = spawnChild(
    "electron",
    electronBin,
    [`--user-data-dir=${userDataDir}`, "."],
    {
      env: createElectronEnv(),
    },
  );
  attachLines(electronProc.stdout, line => handleElectronLine(line, false));
  attachLines(electronProc.stderr, line => handleElectronLine(line, true));

  await waitForTraceTarget(electronProc);
  await sleep(900);

  const summary = createSummary();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(outputRoot, `startup-trace-${timestamp}.json`);
  const latestPath = path.join(outputRoot, "latest.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(latestPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  log(`summary=${reportPath}`);
  log(`milestones=${JSON.stringify(summary.milestones)}`);
  log(`serviceLayerBreakdown=${JSON.stringify(summary.serviceLayerBreakdown)}`);
  log(`serviceResolutionBreakdown=${JSON.stringify(summary.serviceResolutionBreakdown)}`);
  log(`workbenchRefreshBreakdown=${JSON.stringify(summary.workbenchRefreshBreakdown)}`);
  log(`workbenchRenderBreakdown=${JSON.stringify(summary.workbenchRenderBreakdown)}`);
  log(`viewContainerBreakdown=${JSON.stringify(summary.viewContainerBreakdown)}`);
  log(`layoutBreakdown=${JSON.stringify(summary.layoutBreakdown)}`);
  await cleanup();
} catch (error) {
  console.error(`[desktop-startup-trace] failed: ${getErrorMessage(error)}`);
  await cleanup();
  process.exit(1);
}
