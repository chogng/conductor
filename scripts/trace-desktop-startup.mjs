#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const readPositiveIntegerArg = (name, fallback) => {
  const inline = process.argv.find(arg => arg.startsWith(`${name}=`));
  let raw;
  if (inline) {
    raw = inline.slice(name.length + 1);
  } else {
    const index = process.argv.indexOf(name);
    if (index === -1) {
      return fallback;
    }
    raw = process.argv[index + 1];
    if (!raw || raw.startsWith("--")) {
      throw new Error(`${name} must be a positive integer.`);
    }
  }
  if (raw === undefined) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
};

const readStringArg = (name, fallback = "") => {
  const inline = process.argv.find(arg => arg.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);
  if (index === -1) {
    return fallback;
  }

  const raw = process.argv[index + 1];
  if (!raw || raw.startsWith("--")) {
    throw new Error(`${name} must have a value.`);
  }
  return raw;
};

const stripRunsArg = (args) => {
  const stripped = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--runs") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--runs=")) {
      continue;
    }
    stripped.push(arg);
  }
  return stripped;
};

const createBootProfileFileUrl = (filePath) => {
  const url = pathToFileURL(filePath);
  url.searchParams.set("bootProfile", "1");
  return url.href;
};

const workspace = process.cwd();
const host = process.env.DEV_HOST || "127.0.0.1";
const port = Number(process.env.DEV_PORT || 5194);
const timeoutMs = Number(process.env.CONDUCTOR_DESKTOP_STARTUP_TRACE_TIMEOUT_MS || 30_000);
const skipBuild = process.argv.includes("--skip-build");
const traceRunCount = readPositiveIntegerArg("--runs", 1);
const traceMode = readStringArg("--mode", "dev");
const validTraceModes = new Set(["dev", "prod-renderer", "packaged"]);
if (!validTraceModes.has(traceMode)) {
  throw new Error(`--mode must be one of: ${[...validTraceModes].join(", ")}.`);
}
const isWin = process.platform === "win32";
const traceStartMs = Date.now();
const outputRootName = traceMode === "dev" ? "desktop-startup" : `desktop-startup-${traceMode}`;
const outputRoot = path.join(workspace, ".build", "bench", outputRootName);
const userDataDir = path.join(outputRoot, "user-data");
const codeCacheDir = path.join(outputRoot, "code-cache");
const devWorkbenchPath = "/src/cs/code/electron-browser/workbench/workbench-dev.html";
const devUrl = `http://${host}:${port}${devWorkbenchPath}?bootProfile=1`;
const prodRendererWorkbenchPath = path.join(
  workspace,
  "out",
  "renderer",
  "src",
  "cs",
  "code",
  "electron-browser",
  "workbench",
  "workbench.html",
);
const prodRendererUrl = createBootProfileFileUrl(prodRendererWorkbenchPath);
const electronBin = isWin
  ? path.join(workspace, "node_modules", "electron", "dist", "electron.exe")
  : path.join(workspace, "node_modules", ".bin", "electron");
const defaultPackagedAppPath = isWin
  ? path.join(workspace, "release", "win-unpacked", "Conductor Studio.exe")
  : process.platform === "darwin"
    ? path.join(workspace, "release", "mac", "Conductor Studio.app", "Contents", "MacOS", "Conductor Studio")
    : path.join(workspace, "release", "linux-unpacked", "conductor");
const packagedAppPath = path.resolve(readStringArg(
  "--app-path",
  process.env.CONDUCTOR_PACKAGED_APP_PATH || defaultPackagedAppPath,
));
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

const prepareTraceBuild = async () => {
  if (skipBuild) {
    return;
  }

  if (traceMode === "dev") {
    await runCommand("build:desktop:core", npmCommand(), npmArgs("run", "build:desktop:core"));
    return;
  }

  if (traceMode === "prod-renderer") {
    await runCommand("build:desktop:core", npmCommand(), npmArgs("run", "build:desktop:core"));
    await runCommand("build:web:desktop", npmCommand(), npmArgs("run", "build:web:desktop"));
    return;
  }

  await runCommand("pack:desktop", npmCommand(), npmArgs("run", "pack:desktop"));
};

const ensureProdRendererOutput = () => {
  if (fs.existsSync(prodRendererWorkbenchPath)) {
    return;
  }

  throw new Error(
    `Production renderer output is missing: ${prodRendererWorkbenchPath}. Run without --skip-build or run npm run build:web:desktop first.`,
  );
};

const resolvePackagedAppPath = () => {
  if (fs.existsSync(packagedAppPath)) {
    return packagedAppPath;
  }

  throw new Error(
    `Packaged app is missing: ${packagedAppPath}. Run without --skip-build to package it, or pass --app-path <path>.`,
  );
};

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
  const event = parseBootLine(line);
  if (!event) {
    if (line.trim()) {
      (isError ? console.error : console.log)(line);
    }
    return;
  }

  const eventKey = `${event.source}\0${event.elapsedMs}\0${event.stage}\0${durationFromExtra(event.extra) ?? ""}`;
  if (eventKeys.has(eventKey)) {
    return;
  }
  eventKeys.add(eventKey);

  if (line.trim()) {
    (isError ? console.error : console.log)(line);
  }

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
    mode: traceMode,
    devUrl,
    startUrl: traceMode === "dev"
      ? devUrl
      : traceMode === "prod-renderer"
        ? prodRendererUrl
        : null,
    prodRendererWorkbenchPath: traceMode === "prod-renderer" ? prodRendererWorkbenchPath : null,
    packagedAppPath: traceMode === "packaged" ? packagedAppPath : null,
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

const createElectronEnv = ({ startUrl = null } = {}) => {
  const env = {
    ...process.env,
    CONDUCTOR_BOOT_PROFILE: "1",
    CONDUCTOR_CODE_CACHE_PATH: codeCacheDir,
    ELECTRON_NO_ATTACH_CONSOLE: "1",
    ELECTRON_ENABLE_LOGGING: "1",
    ELECTRON_ENABLE_STACK_DUMPING: "1",
    ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
  };
  if (startUrl) {
    env.ELECTRON_START_URL = startUrl;
  } else {
    delete env.ELECTRON_START_URL;
  }
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
};

const resetTraceState = () => {
  events.length = 0;
  eventKeys.clear();
  targetReached = false;
  targetFailure = null;
};

const attachElectronOutput = (electronProc) => {
  attachLines(electronProc.stdout, line => handleElectronLine(line, false));
  attachLines(electronProc.stderr, line => handleElectronLine(line, true));
};

const launchLocalElectron = (startUrl) => {
  log(`electron:start mode=${traceMode} startUrl=${startUrl}`);
  const electronProc = spawnChild(
    "electron",
    electronBin,
    [`--user-data-dir=${userDataDir}`, "."],
    {
      env: createElectronEnv({ startUrl }),
    },
  );
  attachElectronOutput(electronProc);
  return electronProc;
};

const launchPackagedApp = () => {
  const appPath = resolvePackagedAppPath();
  log(`packaged-app:start path=${appPath}`);
  const electronProc = spawnChild(
    "packaged-app",
    appPath,
    [`--user-data-dir=${userDataDir}`],
    {
      env: createElectronEnv(),
    },
  );
  attachElectronOutput(electronProc);
  return electronProc;
};

const launchTraceTarget = async () => {
  if (traceMode === "prod-renderer") {
    ensureProdRendererOutput();
    return launchLocalElectron(prodRendererUrl);
  }

  if (traceMode === "packaged") {
    return launchPackagedApp();
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

  return launchLocalElectron(devUrl);
};

process.once("SIGINT", () => {
  void cleanup().then(() => process.exit(130));
});
process.once("SIGTERM", () => {
  void cleanup().then(() => process.exit(143));
});

const runSingleTrace = async () => {
  resetTraceState();
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.rmSync(codeCacheDir, { recursive: true, force: true });
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(codeCacheDir, { recursive: true });

  await prepareTraceBuild();
  const electronProc = await launchTraceTarget();
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
};

const getBreakdownDuration = (summary, collectionName, stage) =>
  summary[collectionName]?.find(event => event.stage === stage)?.durationMs ?? null;

const sumBreakdownDuration = (summary, collectionName) =>
  summary[collectionName]
    ?.map(event => event.durationMs)
    .filter(value => typeof value === "number")
    .reduce((sum, value) => sum + value, 0) ?? 0;

const createStats = (values) => {
  const sorted = values
    .filter(value => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!sorted.length) {
    return {
      count: 0,
      max: null,
      min: null,
      p50: null,
      p95: null,
      values: [],
    };
  }

  const percentile = (fraction) =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];

  return {
    count: sorted.length,
    max: sorted[sorted.length - 1],
    min: sorted[0],
    p50: percentile(0.5),
    p95: percentile(0.95),
    values: sorted,
  };
};

const createRunSummary = (summary, run) => ({
  run,
  mode: summary.mode ?? "dev",
  generatedAt: summary.generatedAt,
  rendererBootUiReadyMs: summary.milestones.rendererBootUiReadyMs,
  rendererServiceLayerReadyMs: summary.milestones.rendererServiceLayerReadyMs,
  rendererServiceLayerDurationMs: summary.milestones.rendererServiceLayerDurationMs,
  rendererUiReadyToServiceLayerReadyMs: summary.milestones.rendererUiReadyToServiceLayerReadyMs,
  serviceResolutionTotalMs: sumBreakdownDuration(summary, "serviceResolutionBreakdown"),
  domainSyncMs: getBreakdownDuration(
    summary,
    "serviceLayerBreakdown",
    "workbench:service-layer:install:domain-sync:done",
  ),
  refreshInitialMs: getBreakdownDuration(
    summary,
    "serviceLayerBreakdown",
    "workbench:service-layer:install:refresh-initial:done",
  ),
  installMs: getBreakdownDuration(
    summary,
    "serviceLayerBreakdown",
    "workbench:service-layer:install:done",
  ),
  openMainMs: getBreakdownDuration(
    summary,
    "viewContainerBreakdown",
    "workbench:view-containers:open:main:done",
  ),
  deferredSidebarOpenMs: getBreakdownDuration(
    summary,
    "serviceLayerBreakdown",
    "workbench:service-layer:deferred-sidebar-open:done",
  ),
  deferredSidebarRenderMs: getBreakdownDuration(
    summary,
    "serviceLayerBreakdown",
    "workbench:service-layer:deferred-sidebar-render:done",
  ),
  deferredAuxiliaryMs: getBreakdownDuration(
    summary,
    "serviceLayerBreakdown",
    "workbench:service-layer:deferred-auxiliarybar:done",
  ),
});

const createAggregateSummary = (runs) => ({
  generatedAt: new Date().toISOString(),
  mode: traceMode,
  runCount: runs.length,
  runs,
  metrics: {
    rendererBootUiReadyMs: createStats(runs.map(run => run.rendererBootUiReadyMs)),
    rendererServiceLayerReadyMs: createStats(runs.map(run => run.rendererServiceLayerReadyMs)),
    rendererServiceLayerDurationMs: createStats(runs.map(run => run.rendererServiceLayerDurationMs)),
    rendererUiReadyToServiceLayerReadyMs: createStats(runs.map(run => run.rendererUiReadyToServiceLayerReadyMs)),
    serviceResolutionTotalMs: createStats(runs.map(run => run.serviceResolutionTotalMs)),
    domainSyncMs: createStats(runs.map(run => run.domainSyncMs)),
    refreshInitialMs: createStats(runs.map(run => run.refreshInitialMs)),
    installMs: createStats(runs.map(run => run.installMs)),
    openMainMs: createStats(runs.map(run => run.openMainMs)),
    deferredSidebarOpenMs: createStats(runs.map(run => run.deferredSidebarOpenMs)),
    deferredSidebarRenderMs: createStats(runs.map(run => run.deferredSidebarRenderMs)),
    deferredAuxiliaryMs: createStats(runs.map(run => run.deferredAuxiliaryMs)),
  },
});

const runRepeatedTraces = async () => {
  fs.mkdirSync(outputRoot, { recursive: true });

  await prepareTraceBuild();

  const childArgs = stripRunsArg(process.argv.slice(2));
  if (!childArgs.includes("--skip-build")) {
    childArgs.push("--skip-build");
  }

  const runs = [];
  for (let run = 1; run <= traceRunCount; run += 1) {
    await runCommand(
      `trace:${run}`,
      process.execPath,
      [process.argv[1], ...childArgs],
      { env: process.env },
    );
    const latestPath = path.join(outputRoot, "latest.json");
    const summary = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    runs.push(createRunSummary(summary, run));
  }

  const aggregate = createAggregateSummary(runs);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(outputRoot, `startup-trace-runs-${timestamp}.json`);
  const latestRunsPath = path.join(outputRoot, "latest-runs.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");
  fs.writeFileSync(latestRunsPath, `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");

  log(`aggregate=${reportPath}`);
  log(`aggregateMetrics=${JSON.stringify(aggregate.metrics)}`);
  await cleanup();
};

try {
  if (traceRunCount > 1) {
    await runRepeatedTraces();
  } else {
    await runSingleTrace();
  }
} catch (error) {
  console.error(`[desktop-startup-trace] failed: ${getErrorMessage(error)}`);
  await cleanup();
  process.exit(1);
}
