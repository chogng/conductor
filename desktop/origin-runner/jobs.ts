import fs from "node:fs";
import {
  getPowerShellExePath,
  runProcess,
  normalizeOriginExePath,
  assertOriginExePath,
} from "./core.js";
import {
  normalizeOriginErrorPayload,
  toStructuredOriginError,
  parseWorkerErrorPayload,
} from "./errors.js";
import {
  createJobPaths,
  createCsvJobPaths,
} from "./runtime.js";
import {
  buildOriginCsvWorkerArgs,
  runNativeCsvWorker,
  runPythonScriptForBatch,
  readWorkerErrorFiles,
} from "./runners.js";

function buildWorkerFailureError({
  workerResult,
  logPath,
  workerErrorPayload,
  fallbackStage,
  fallbackCode,
  fallbackMessage,
  originExe,
}) {
  const payload = normalizeOriginErrorPayload(workerErrorPayload, {
    code: fallbackCode,
    stage: fallbackStage,
    message:
      fallbackMessage ||
      workerResult?.stderr ||
      workerResult?.stdout ||
      "Origin worker failed.",
    logPath,
    originExe,
  });
  return toStructuredOriginError(payload);
}

export async function runOriginCsvJob({
  csvName,
  csvText,
  originExePath,
  workerScriptPath,
  workerExecutablePath,
  runtimeRootDir,
  seriesName = "",
  plotType,
  xyPairs,
  plotCommand,
  postPlotCommands,
  lineWidth,
  capabilities,
}) {
  const normalizedOriginExePath = assertOriginExePath(originExePath);
  const normalizedWorkerExecutablePath = normalizeOriginExePath(workerExecutablePath);
  const nativeWorkerAvailable = Boolean(
    normalizedWorkerExecutablePath && fs.existsSync(normalizedWorkerExecutablePath),
  );
  const scriptWorkerAvailable = Boolean(workerScriptPath && fs.existsSync(workerScriptPath));

  if (!nativeWorkerAvailable && !scriptWorkerAvailable) {
    throw toStructuredOriginError({
      code: "ORIGIN_CSV_RUNNER_NOT_FOUND",
      stage: "PRECHECK",
      message:
        `No CSV runner is available. Worker: ${normalizedWorkerExecutablePath || "(none)"}; ` +
        `Script: ${workerScriptPath || "(none)"}`,
      originExe: normalizedOriginExePath,
    });
  }

  const normalizedCsvText = typeof csvText === "string" ? csvText : String(csvText || "");
  if (!normalizedCsvText.trim()) {
    throw toStructuredOriginError({
      code: "ORIGIN_CSV_EMPTY",
      stage: "PRECHECK",
      message: "CSV payload is empty.",
      originExe: normalizedOriginExePath,
    });
  }

  const { jobDir, workDir, csvPath, logPath, errorPath } = createCsvJobPaths(csvName, {
    runtimeRootDir,
  });
  fs.writeFileSync(csvPath, normalizedCsvText, "utf8");

  const workerArgs = buildOriginCsvWorkerArgs({
    workDir,
    csvPath,
    originExePath: normalizedOriginExePath,
    logPath,
    errorPath,
    seriesName,
    plotType,
    xyPairs,
    plotCommand,
    postPlotCommands,
    lineWidth,
    capabilities,
  });

  let workerResult = null;
  let runnerExecutable = null;
  let runnerKind = null;

  if (nativeWorkerAvailable) {
    try {
      workerResult = await runNativeCsvWorker(
        normalizedWorkerExecutablePath,
        workerArgs,
        { windowsHide: true },
      );
      runnerKind = "native";
      runnerExecutable = workerResult.executable;
    } catch (error) {
      const canFallbackToPython = scriptWorkerAvailable && error?.code === "ENOENT";
      if (!canFallbackToPython) {
        throw toStructuredOriginError({
          code: "ORIGIN_CSV_RUNNER_FAILED",
          stage: "NATIVE_RUNNER",
          message:
            error?.message ||
            "Failed to run Origin CSV native worker executable.",
          logPath,
          originExe: normalizedOriginExePath,
        });
      }
    }
  }

  if (!workerResult && scriptWorkerAvailable) {
    try {
      workerResult = await runPythonScriptForBatch(
        workerScriptPath,
        workerArgs,
        { windowsHide: true, requiredModule: "originpro" },
      );
      runnerKind = "python";
      runnerExecutable = workerResult.executable;
    } catch (error) {
      const pythonMissing = error?.code === "ENOENT";
      const moduleMissing = error?.code === "PY_MODULE_MISSING";
      throw toStructuredOriginError({
        code: pythonMissing
          ? "ORIGIN_PYTHON_NOT_FOUND"
          : moduleMissing
            ? "ORIGIN_ORIGINPRO_IMPORT_FAILED"
            : "ORIGIN_CSV_RUNNER_FAILED",
        stage: pythonMissing
          ? "PYTHON_RUNNER"
          : moduleMissing
            ? "ORIGINPRO_INIT"
            : "CSV_PYTHON_RUNNER",
        message:
          pythonMissing
            ? "Python executable not found. Install Python and ensure python/py is available in PATH."
            : moduleMissing
              ? "Failed to import originpro in available Python environments."
              : error?.message || "Failed to run Origin CSV python script.",
        logPath,
        originExe: normalizedOriginExePath,
      });
    }
  }

  if (!workerResult) {
    throw toStructuredOriginError({
      code: "ORIGIN_CSV_RUNNER_NOT_FOUND",
      stage: "PRECHECK",
      message: "No available runner could be started for Origin CSV job.",
      logPath,
      originExe: normalizedOriginExePath,
    });
  }

  const workerErrorFiles = readWorkerErrorFiles(workDir, parseWorkerErrorPayload);
  const workerErrorPayload = workerErrorFiles.workerErrorPayload;
  const workerErrorRaw = workerErrorFiles.workerErrorRaw;
  if (workerResult.code !== 0) {
    throw buildWorkerFailureError({
      workerResult,
      logPath,
      workerErrorPayload,
      fallbackStage: runnerKind === "native" ? "CSV_NATIVE_RUNNER" : "CSV_PYTHON_RUNNER",
      fallbackCode: "ORIGIN_CSV_FAILED",
      fallbackMessage:
        workerErrorRaw ||
        workerResult.stderr ||
        workerResult.stdout ||
        "Origin CSV run failed.",
      originExe: normalizedOriginExePath,
    });
  }

  return {
    ok: true,
    jobDir,
    workDir,
    logPath,
    errorPath,
    csvPath,
    runner: runnerKind,
    runnerExecutable,
    pythonExecutable: runnerKind === "python" ? runnerExecutable : null,
  };
}

export async function runOriginHealthCheck({
  originExePath,
  workerScriptPath,
  runtimeRootDir,
}) {
  const normalizedOriginExePath = assertOriginExePath(originExePath);
  if (!workerScriptPath || !fs.existsSync(workerScriptPath)) {
    throw toStructuredOriginError({
      code: "ORIGIN_WORKER_SCRIPT_NOT_FOUND",
      stage: "PRECHECK",
      message: `Origin worker script not found: ${workerScriptPath}`,
      originExe: normalizedOriginExePath,
    });
  }

  const { jobDir, extractDir, workDir } = createJobPaths("origin_health_check.zip", {
    runtimeRootDir,
  });

  const workerResult = await runProcess(
    getPowerShellExePath(),
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      workerScriptPath,
      "-WorkDir",
      workDir,
      "-ExtractDir",
      extractDir,
      "-OriginExe",
      normalizedOriginExePath,
      "-HealthCheckOnly",
    ],
    { windowsHide: true },
  );

  const { logPath, errorPath, workerErrorPayload, workerErrorRaw } =
    readWorkerErrorFiles(workDir, parseWorkerErrorPayload);

  if (workerResult.code !== 0) {
    throw buildWorkerFailureError({
      workerResult,
      logPath,
      workerErrorPayload,
      fallbackStage: "HEALTH_CHECK",
      fallbackCode: "ORIGIN_HEALTH_CHECK_FAILED",
      fallbackMessage:
        workerErrorRaw ||
        workerResult.stderr ||
        workerResult.stdout ||
        "Origin health check failed.",
      originExe: normalizedOriginExePath,
    });
  }

  return {
    ok: true,
    code: "ORIGIN_HEALTH_CHECK_OK",
    stage: "HEALTH_CHECK",
    originExePath: normalizedOriginExePath,
    jobDir,
    workDir,
    logPath,
    errorPath,
  };
}

