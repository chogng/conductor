const fs = require("node:fs");
const path = require("node:path");
const {
  normalizeOriginExePath,
  runProcess,
} = require("./core.cjs");

function buildOriginBatchWorkerArgs({
  workDir,
  inputDir,
  originExePath,
  summaryPath,
  logPath,
  errorPath,
}) {
  return [
    "--work-dir",
    workDir,
    "--input-dir",
    inputDir,
    "--origin-exe",
    originExePath,
    "--summary-path",
    summaryPath,
    "--log-path",
    logPath,
    "--error-path",
    errorPath,
  ];
}

function buildOriginZipWorkerArgs({
  workDir,
  extractDir,
  originExePath,
  logPath,
  errorPath,
}) {
  return [
    "--work-dir",
    workDir,
    "--extract-dir",
    extractDir,
    "--origin-exe",
    originExePath,
    "--log-path",
    logPath,
    "--error-path",
    errorPath,
  ];
}

function appendOriginPlotWorkerArgs(baseArgs, {
  plotType,
  xyPairs,
  plotCommand,
  postPlotCommands,
} = {}) {
  const args = Array.isArray(baseArgs) ? [...baseArgs] : [];

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

  return args;
}

function buildOriginCsvWorkerArgs({
  workDir,
  csvPath,
  originExePath,
  logPath,
  errorPath,
  seriesName,
  plotType,
  xyPairs,
  plotCommand,
  postPlotCommands,
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

  if (typeof seriesName === "string" && seriesName.trim()) {
    args.push("--series-name", seriesName.trim());
  }

  return appendOriginPlotWorkerArgs(args, {
    plotType,
    xyPairs,
    plotCommand,
    postPlotCommands,
  });
}

async function runNativeBatchWorker(workerExecutablePath, workerArgs, options = {}) {
  if (!workerExecutablePath || !fs.existsSync(workerExecutablePath)) {
    const error = new Error(
      `Origin batch worker executable not found: ${workerExecutablePath}`,
    );
    error.code = "ENOENT";
    throw error;
  }

  const result = await runProcess(workerExecutablePath, workerArgs, options);
  return {
    ...result,
    executable: workerExecutablePath,
  };
}

async function runNativeZipWorker(workerExecutablePath, workerArgs, options = {}) {
  if (!workerExecutablePath || !fs.existsSync(workerExecutablePath)) {
    const error = new Error(
      `Origin ZIP worker executable not found: ${workerExecutablePath}`,
    );
    error.code = "ENOENT";
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
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (fs.existsSync(normalized)) {
      existing.push(normalized);
    }
  }
  return existing;
}

async function runPythonScriptForBatch(pythonScriptPath, scriptArgs, options = {}) {
  const requiredModule =
    typeof options?.requiredModule === "string" && options.requiredModule.trim()
      ? options.requiredModule.trim()
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
      if (error?.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  if (requiredModule && sawExecutable && sawRequiredModuleFailure) {
    const moduleError = new Error(
      `Python executable found but required module '${requiredModule}' is unavailable.`,
    );
    moduleError.code = "PY_MODULE_MISSING";
    throw moduleError;
  }

  const notFoundError = new Error("Python executable not found.");
  notFoundError.code = "ENOENT";
  notFoundError.cause = lastError || null;
  throw notFoundError;
}

function readWorkerErrorFiles(workDir, parseWorkerErrorPayload) {
  const logPath = path.join(workDir, "originbridge.log");
  const errorPath = path.join(workDir, "error.txt");

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

module.exports = {
  buildOriginBatchWorkerArgs,
  buildOriginZipWorkerArgs,
  appendOriginPlotWorkerArgs,
  buildOriginCsvWorkerArgs,
  runNativeBatchWorker,
  runNativeZipWorker,
  runPythonScriptForBatch,
  readWorkerErrorFiles,
};
