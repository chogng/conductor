import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getOriginBridgeFilePaths,
  normalizeOriginExePath,
  normalizeOriginPathKey,
  runProcess,
} from "./core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function appendOriginPlotWorkerArgs(baseArgs, plotOptions = {}) {
  const args = Array.isArray(baseArgs) ? [...baseArgs] : [];
  const source = plotOptions && typeof plotOptions === "object" ? plotOptions : {};
  const plotType = Reflect.get(source, "plotType");
  const xyPairs = Reflect.get(source, "xyPairs");
  const plotCommand = Reflect.get(source, "plotCommand");
  const postPlotCommands = Reflect.get(source, "postPlotCommands");
  const lineWidth = Reflect.get(source, "lineWidth");

  const normalizedPlotType = Number(plotType);
  if (Number.isFinite(normalizedPlotType)) {
    args.push("--plot-type", String(Math.trunc(normalizedPlotType)));
  }

  if (typeof xyPairs === "string" && xyPairs.trim()) {
    args.push("--xy-pairs", xyPairs.trim());
  }

  if (typeof plotCommand === "string" && plotCommand.trim()) {
    args.push("--plot-command", plotCommand.trim());
  }

  if (Array.isArray(postPlotCommands)) {
    for (const rawCommand of postPlotCommands) {
      if (typeof rawCommand !== "string" || !rawCommand.trim()) continue;
      args.push("--post-plot-command", rawCommand.trim());
    }
  }

  const normalizedLineWidth = Number(lineWidth);
  if (Number.isFinite(normalizedLineWidth) && normalizedLineWidth > 0) {
    args.push("--line-width", String(normalizedLineWidth));
  }

  return args;
}

export function appendOriginCapabilitiesWorkerArgs(baseArgs, capabilities) {
  const args = Array.isArray(baseArgs) ? [...baseArgs] : [];
  if (!capabilities || typeof capabilities !== "object") {
    return args;
  }

  try {
    const capabilitiesJson = JSON.stringify(capabilities);
    if (capabilitiesJson && capabilitiesJson !== "{}") {
      args.push("--capabilities-json", capabilitiesJson);
    }
  } catch {
    // Ignore invalid/unserializable capability payloads and keep compatibility.
  }

  return args;
}

export function buildOriginCsvWorkerArgs({
  workDir,
  csvPath,
  originExePath,
  logPath,
  errorPath,
  importMode,
  workbookKey,
  workbookName,
  sheetName,
  plotType,
  xyPairs,
  plotCommand,
  postPlotCommands,
  lineWidth,
  capabilities,
}) {
  const args = [
    "--work-dir",
    workDir,
    "--csv-path",
    csvPath,
    "--origin-exe",
    originExePath,
    "--log-path",
    logPath,
    "--error-path",
    errorPath,
  ];

  if (typeof importMode === "string" && importMode.trim()) {
    args.push("--import-mode", importMode.trim());
  }

  if (typeof workbookKey === "string" && workbookKey.trim()) {
    args.push("--workbook-key", workbookKey.trim());
  }

  if (typeof workbookName === "string" && workbookName.trim()) {
    args.push("--workbook-name", workbookName.trim());
  }

  if (typeof sheetName === "string" && sheetName.trim()) {
    args.push("--sheet-name", sheetName.trim());
  }

  const withPlotArgs = appendOriginPlotWorkerArgs(args, {
    plotType,
    xyPairs,
    plotCommand,
    postPlotCommands,
    lineWidth,
  });
  return appendOriginCapabilitiesWorkerArgs(withPlotArgs, capabilities);
}

export async function runNativeCsvWorker(workerExecutablePath, workerArgs, options = {}) {
  if (!workerExecutablePath || !fs.existsSync(workerExecutablePath)) {
    const error = new Error(
      `Origin CSV worker executable not found: ${workerExecutablePath}`,
    );
    Reflect.set(error, "code", "ENOENT");
    throw error;
  }

  const result = await runProcess(workerExecutablePath, workerArgs, options);
  return {
    ...result,
    executable: workerExecutablePath,
  };
}

function collectPreferredPythonExecutables() {
  const candidates = [
    path.join(process.cwd(), ".venv-origin-workers", "Scripts", "python.exe"),
    path.join(__dirname, "..", "..", ".venv-origin-workers", "Scripts", "python.exe"),
  ];

  const seen = new Set();
  const existing = [];
  for (const item of candidates) {
    const normalized = normalizeOriginExePath(item);
    const key = normalizeOriginPathKey(item);
    if (!normalized || !key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    if (fs.existsSync(normalized)) {
      existing.push(normalized);
    }
  }
  return existing;
}

export async function runPythonScriptForBatch(pythonScriptPath, scriptArgs, options = {}) {
  const source = options && typeof options === "object" ? options : {};
  const requiredModuleRaw = Reflect.get(source, "requiredModule");
  const requiredModule =
    typeof requiredModuleRaw === "string" && requiredModuleRaw.trim()
      ? requiredModuleRaw.trim()
      : null;

  const attempts = [];
  const envPython = normalizeOriginExePath(process.env.ORIGIN_PYTHON);
  if (envPython) {
    attempts.push({ exe: envPython, prefix: [] });
  }
  for (const preferredPython of collectPreferredPythonExecutables()) {
    attempts.push({ exe: preferredPython, prefix: [] });
  }
  attempts.push(
    { exe: "python", prefix: [] },
    { exe: "py", prefix: ["-3"] },
  );

  const tried = [];
  let lastError = null;
  let sawExecutable = false;
  let sawRequiredModuleFailure = false;

  for (const attempt of attempts) {
    const key = `${attempt.exe}|${attempt.prefix.join(" ")}`;
    if (tried.includes(key)) continue;
    tried.push(key);

    try {
      if (requiredModule) {
        const probeArgs = [...attempt.prefix, "-c", `import ${requiredModule}`];
        const probeResult = await runProcess(attempt.exe, probeArgs, options);
        sawExecutable = true;
        if (probeResult.code !== 0) {
          sawRequiredModuleFailure = true;
          continue;
        }
      }

      const args = [...attempt.prefix, "-u", pythonScriptPath, ...scriptArgs];
      const result = await runProcess(attempt.exe, args, options);
      sawExecutable = true;
      return {
        ...result,
        executable: attempt.exe,
      };
    } catch (error) {
      lastError = error;
      const errorCode = Reflect.get(
        error && typeof error === "object" ? error : {},
        "code",
      );
      if (errorCode === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  if (requiredModule && sawExecutable && sawRequiredModuleFailure) {
    const moduleError = new Error(
      `Python executable found but required module '${requiredModule}' is unavailable.`,
    );
    Reflect.set(moduleError, "code", "PY_MODULE_MISSING");
    throw moduleError;
  }

  const notFoundError = new Error("Python executable not found.");
  Reflect.set(notFoundError, "code", "ENOENT");
  Reflect.set(notFoundError, "cause", lastError || null);
  throw notFoundError;
}

export function readWorkerErrorFiles(workDir, parseWorkerErrorPayload) {
  const { logPath, errorPath } = getOriginBridgeFilePaths(workDir);

  const workerErrorRaw = fs.existsSync(errorPath)
    ? String(fs.readFileSync(errorPath, "utf8") || "").trim()
    : "";

  return {
    logPath,
    errorPath,
    workerErrorRaw,
    workerErrorPayload: parseWorkerErrorPayload(workerErrorRaw),
  };
}

