import fs from "node:fs";
import {
  normalizeOriginExePath,
  assertOriginExePath,
} from "./core.js";
import {
  normalizeOriginErrorPayload,
  toStructuredOriginError,
  parseWorkerErrorPayload,
} from "./errors.js";
import {
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

function buildPythonRunnerStartError(error, { logPath, originExe }) {
  const pythonMissing = error?.code === "ENOENT";
  const moduleMissing = error?.code === "PY_MODULE_MISSING";
  return toStructuredOriginError({
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
    originExe,
  });
}

function buildHealthCheckPythonRunnerStartError(error, { logPath, originExe }) {
  const pythonMissing = error?.code === "ENOENT";
  const moduleMissing = error?.code === "PY_MODULE_MISSING";
  return toStructuredOriginError({
    code: pythonMissing
      ? "ORIGIN_PYTHON_NOT_FOUND"
      : moduleMissing
        ? "ORIGIN_ORIGINPRO_IMPORT_FAILED"
        : "ORIGIN_HEALTH_CHECK_RUNNER_FAILED",
    stage: pythonMissing
      ? "PYTHON_RUNNER"
      : moduleMissing
        ? "ORIGINPRO_INIT"
        : "HEALTH_CHECK_PYTHON_RUNNER",
    message:
      pythonMissing
        ? "Python executable not found. Install Python and ensure python/py is available in PATH."
        : moduleMissing
          ? "Failed to import originpro in available Python environments."
          : error?.message || "Failed to run Origin health-check python script.",
    logPath,
    originExe,
  });
}

function buildNativeRunnerStartError(error, { logPath, originExe, stage, message, code }) {
  return toStructuredOriginError({
    code: code || "ORIGIN_CSV_RUNNER_FAILED",
    stage,
    message: error?.message || message,
    logPath,
    originExe,
  });
}

function buildNativeWorkerEnv(workDir) {
  return {
    ...process.env,
    TEMP: workDir,
    TMP: workDir,
  };
}

async function runPythonWorker(workerScriptPath, workerArgs) {
  return runPythonScriptForBatch(workerScriptPath, workerArgs, {
    windowsHide: true,
    requiredModule: "originpro",
  });
}

export async function runOriginCsvJob({
  csvName,
  csvText,
  originExePath,
  workerScriptPath,
  workerExecutablePath,
  runtimeRootDir,
  importMode = "new-book",
  workbookKey = "",
  workbookName = "",
  sheetName = "",
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
  });

  let workerResult = null;
  let runnerExecutable = null;
  let runnerKind = null;
  let scriptStartUnavailable = false;

  if (scriptWorkerAvailable) {
    try {
      workerResult = await runPythonWorker(workerScriptPath, workerArgs);
      runnerKind = "python";
      runnerExecutable = workerResult.executable;
    } catch (error) {
      const pythonMissing = error?.code === "ENOENT";
      const moduleMissing = error?.code === "PY_MODULE_MISSING";
      if (!nativeWorkerAvailable || (!pythonMissing && !moduleMissing)) {
        throw buildPythonRunnerStartError(error, {
          logPath,
          originExe: normalizedOriginExePath,
        });
      }
      scriptStartUnavailable = true;
    }
  }

  if (!workerResult && nativeWorkerAvailable) {
    try {
      workerResult = await runNativeCsvWorker(
        normalizedWorkerExecutablePath,
        workerArgs,
        {
          cwd: workDir,
          env: buildNativeWorkerEnv(workDir),
          windowsHide: true,
        },
      );
      runnerKind = "native";
      runnerExecutable = workerResult.executable;
    } catch (error) {
      throw buildNativeRunnerStartError(error, {
        code: "ORIGIN_CSV_RUNNER_FAILED",
        logPath,
        originExe: normalizedOriginExePath,
        stage: "NATIVE_RUNNER",
        message: "Failed to run Origin CSV native worker executable.",
      });
    }
  }

  if (!workerResult) {
    throw toStructuredOriginError({
      code: scriptStartUnavailable
        ? "ORIGIN_CSV_RUNNER_FAILED"
        : "ORIGIN_CSV_RUNNER_NOT_FOUND",
      stage: "PRECHECK",
      message: scriptStartUnavailable
        ? "Python-based Origin CSV runner is unavailable, and no native runner could be started."
        : "No available runner could be started for Origin CSV job.",
      logPath,
      originExe: normalizedOriginExePath,
    });
  }

  const { workerErrorPayload, workerErrorRaw } =
    readWorkerErrorFiles(workDir, parseWorkerErrorPayload);

  if (workerResult.code !== 0) {
    throw buildWorkerFailureError({
      workerResult,
      logPath,
      workerErrorPayload,
      fallbackStage: runnerKind === "python" ? "CSV_PYTHON_RUNNER" : "CSV_NATIVE_RUNNER",
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
  workerExecutablePath,
  workerScriptPath,
  runtimeRootDir,
}) {
  const normalizedOriginExePath = assertOriginExePath(originExePath);
  const normalizedWorkerExecutablePath = normalizeOriginExePath(workerExecutablePath);
  const nativeWorkerAvailable = Boolean(
    normalizedWorkerExecutablePath && fs.existsSync(normalizedWorkerExecutablePath),
  );
  const scriptWorkerAvailable = Boolean(workerScriptPath && fs.existsSync(workerScriptPath));

  if (!nativeWorkerAvailable && !scriptWorkerAvailable) {
    throw toStructuredOriginError({
      code: "ORIGIN_HEALTH_CHECK_RUNNER_NOT_FOUND",
      stage: "PRECHECK",
      message:
        `No health-check runner is available. Worker: ${normalizedWorkerExecutablePath || "(none)"}; ` +
        `Script: ${workerScriptPath || "(none)"}`,
      originExe: normalizedOriginExePath,
    });
  }

  const { jobDir, workDir, logPath, errorPath } = createCsvJobPaths(
    "origin_health_check.csv",
    {
      runtimeRootDir,
    },
  );

  const healthCheckWorkerArgs = [
    "--work-dir",
    workDir,
    "--origin-exe",
    normalizedOriginExePath,
    "--log-path",
    logPath,
    "--error-path",
    errorPath,
    "--health-check-only",
  ];

  let workerResult = null;
  let runnerKind = null;
  let runnerExecutable = null;
  let scriptStartUnavailable = false;

  if (scriptWorkerAvailable) {
    try {
      workerResult = await runPythonWorker(workerScriptPath, healthCheckWorkerArgs);
      runnerKind = "python";
      runnerExecutable = workerResult.executable;
    } catch (error) {
      const pythonMissing = error?.code === "ENOENT";
      const moduleMissing = error?.code === "PY_MODULE_MISSING";
      if (!nativeWorkerAvailable || (!pythonMissing && !moduleMissing)) {
        throw buildHealthCheckPythonRunnerStartError(error, {
          logPath,
          originExe: normalizedOriginExePath,
        });
      }
      scriptStartUnavailable = true;
    }
  }

  if (!workerResult && nativeWorkerAvailable) {
    try {
      workerResult = await runNativeCsvWorker(
        normalizedWorkerExecutablePath,
        healthCheckWorkerArgs,
        {
          cwd: workDir,
          env: buildNativeWorkerEnv(workDir),
          windowsHide: true,
        },
      );
      runnerKind = "native";
      runnerExecutable = workerResult.executable;
    } catch (error) {
      throw buildNativeRunnerStartError(error, {
        code: "ORIGIN_HEALTH_CHECK_RUNNER_FAILED",
        logPath,
        originExe: normalizedOriginExePath,
        stage: "HEALTH_CHECK_NATIVE_RUNNER",
        message: "Failed to run Origin health-check native worker executable.",
      });
    }
  }

  if (!workerResult) {
    throw toStructuredOriginError({
      code: scriptStartUnavailable
        ? "ORIGIN_HEALTH_CHECK_RUNNER_FAILED"
        : "ORIGIN_HEALTH_CHECK_RUNNER_NOT_FOUND",
      stage: "PRECHECK",
      message: scriptStartUnavailable
        ? "Python-based Origin health-check runner is unavailable, and no native runner could be started."
        : "No available runner could be started for Origin health check.",
      logPath,
      originExe: normalizedOriginExePath,
    });
  }

  const { workerErrorPayload, workerErrorRaw } =
    readWorkerErrorFiles(workDir, parseWorkerErrorPayload);

  if (workerResult.code !== 0) {
    throw buildWorkerFailureError({
      workerResult,
      logPath,
      workerErrorPayload,
      fallbackStage:
        runnerKind === "python"
          ? "HEALTH_CHECK_PYTHON_RUNNER"
          : "HEALTH_CHECK_NATIVE_RUNNER",
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
    runner: runnerKind,
    runnerExecutable,
  };
}
