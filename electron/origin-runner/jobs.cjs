const fs = require("node:fs");
const path = require("node:path");
const {
  getPowerShellExePath,
  runProcess,
  expandArchive,
  normalizeZipBuffer,
  normalizeOriginExePath,
  assertOriginExePath,
  assertDirectoryPath,
  parseJsonFile,
} = require("./core.cjs");
const {
  normalizeOriginErrorPayload,
  toStructuredOriginError,
  parseWorkerErrorPayload,
} = require("./errors.cjs");
const {
  createJobPaths,
  createBatchJobPaths,
  createCsvJobPaths,
} = require("./runtime.cjs");
const {
  buildOriginBatchWorkerArgs,
  buildOriginZipWorkerArgs,
  appendOriginPlotWorkerArgs,
  buildOriginCsvWorkerArgs,
  runNativeBatchWorker,
  runNativeZipWorker,
  runPythonScriptForBatch,
  readWorkerErrorFiles,
} = require("./runners.cjs");

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

async function runOriginZipJob({
  zipName,
  bytes,
  originExePath,
  workerScriptPath,
  workerExecutablePath,
  plotType,
  xyPairs,
  plotCommand,
  postPlotCommands,
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
      code: "ORIGIN_ZIP_RUNNER_NOT_FOUND",
      stage: "PRECHECK",
      message:
        `No ZIP runner is available. Worker: ${normalizedWorkerExecutablePath || "(none)"}; ` +
        `Script: ${workerScriptPath || "(none)"}`,
      originExe: normalizedOriginExePath,
    });
  }

  const zipBuffer = normalizeZipBuffer(bytes);
  if (!zipBuffer.length) {
    throw toStructuredOriginError({
      code: "ORIGIN_ZIP_EMPTY",
      stage: "PRECHECK",
      message: "ZIP payload is empty.",
      originExe: normalizedOriginExePath,
    });
  }

  const { jobDir, extractDir, workDir, inputZipPath } = createJobPaths(zipName, {
    runtimeRootDir,
  });
  fs.writeFileSync(inputZipPath, zipBuffer);
  const logPath = path.join(workDir, "originbridge.log");
  const errorPath = path.join(workDir, "error.txt");

  try {
    await expandArchive(inputZipPath, extractDir);
  } catch (error) {
    throw toStructuredOriginError({
      code: "ORIGIN_ZIP_EXTRACT_FAILED",
      stage: "ZIP_EXTRACT",
      message: error?.message || "Failed to extract Origin package ZIP.",
      originExe: normalizedOriginExePath,
      logPath,
    });
  }

  const zipWorkerArgs = buildOriginZipWorkerArgs({
    workDir,
    extractDir,
    originExePath: normalizedOriginExePath,
    logPath,
    errorPath,
  });
  const zipPythonWorkerArgs = appendOriginPlotWorkerArgs(zipWorkerArgs, {
    plotType,
    xyPairs,
    plotCommand,
    postPlotCommands,
  });

  let workerResult = null;
  let runnerKind = null;
  let runnerExecutable = null;
  // ZIP path: prefer Python script (originpro pip), fallback to native worker only
  // when Python is unavailable. This avoids mixed-runner duplicate window launches.
  if (scriptWorkerAvailable) {
    try {
      const scriptResult = await runPythonScriptForBatch(
        workerScriptPath,
        zipPythonWorkerArgs,
        { windowsHide: true, requiredModule: "originpro" },
      );
      workerResult = scriptResult;
      runnerKind = "python";
      runnerExecutable = scriptResult.executable;
    } catch (error) {
      const pythonMissing = error?.code === "ENOENT";
      const moduleMissing = error?.code === "PY_MODULE_MISSING";
      const canFallbackToNative = nativeWorkerAvailable && (pythonMissing || moduleMissing);
      if (!canFallbackToNative) {
        throw toStructuredOriginError({
          code: pythonMissing
            ? "ORIGIN_PYTHON_NOT_FOUND"
            : moduleMissing
              ? "ORIGIN_ORIGINPRO_IMPORT_FAILED"
              : "ORIGIN_ZIP_RUNNER_FAILED",
          stage: pythonMissing
            ? "PYTHON_RUNNER"
            : moduleMissing
              ? "ORIGINPRO_INIT"
              : "RUN_WORKER",
          message:
            pythonMissing
              ? "Python executable not found. Install Python and ensure python/py is available in PATH."
              : moduleMissing
                ? "Failed to import originpro in available Python environments."
              : error?.message || "Failed to run Origin ZIP python script.",
          logPath,
          originExe: normalizedOriginExePath,
        });
      }
    }
  }

  if (!workerResult && nativeWorkerAvailable) {
    try {
      const nativeResult = await runNativeZipWorker(
        normalizedWorkerExecutablePath,
        zipWorkerArgs,
        { windowsHide: true },
      );
      workerResult = nativeResult;
      runnerKind = "native";
      runnerExecutable = nativeResult.executable;
    } catch (error) {
      throw toStructuredOriginError({
        code: "ORIGIN_ZIP_RUNNER_FAILED",
        stage: "NATIVE_RUNNER",
        message:
          error?.message ||
          "Failed to run Origin ZIP native worker executable.",
        logPath,
        originExe: normalizedOriginExePath,
      });
    }
  }

  if (!workerResult) {
    throw toStructuredOriginError({
      code: "ORIGIN_ZIP_RUNNER_NOT_FOUND",
      stage: "PRECHECK",
      message: "No available runner could be started for Origin ZIP job.",
      logPath,
      originExe: normalizedOriginExePath,
    });
  }

  const workerErrorFiles = readWorkerErrorFiles(workDir, parseWorkerErrorPayload);
  const workerErrorPayload = workerErrorFiles.workerErrorPayload;
  const workerErrorRaw = workerErrorFiles.workerErrorRaw;

  if (workerResult.code !== 0) {
    const fallbackStage =
      runnerKind === "native"
        ? "ZIP_NATIVE_RUNNER"
        : runnerKind === "python"
          ? "ZIP_PYTHON_RUNNER"
          : "RUN_WORKER";
    throw buildWorkerFailureError({
      workerResult,
      logPath,
      workerErrorPayload,
      fallbackStage,
      fallbackCode: "ORIGIN_WORKER_FAILED",
      fallbackMessage:
        workerErrorRaw ||
        workerResult.stderr ||
        workerResult.stdout ||
        "Origin worker failed.",
      originExe: normalizedOriginExePath,
    });
  }

  return {
    jobDir,
    extractDir,
    workDir,
    logPath,
    errorPath,
    runner: runnerKind,
    runnerExecutable,
  };
}

async function runOriginCsvJob({
  csvName,
  csvText,
  originExePath,
  workerScriptPath,
  runtimeRootDir,
  seriesName = "",
  plotType,
  xyPairs,
  plotCommand,
  postPlotCommands,
}) {
  const normalizedOriginExePath = assertOriginExePath(originExePath);
  const scriptWorkerAvailable = Boolean(workerScriptPath && fs.existsSync(workerScriptPath));

  if (!scriptWorkerAvailable) {
    throw toStructuredOriginError({
      code: "ORIGIN_CSV_RUNNER_NOT_FOUND",
      stage: "PRECHECK",
      message: `No CSV runner script is available: ${workerScriptPath || "(none)"}`,
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
  });

  let workerResult = null;
  let runnerExecutable = null;
  try {
    workerResult = await runPythonScriptForBatch(
      workerScriptPath,
      workerArgs,
      { windowsHide: true, requiredModule: "originpro" },
    );
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

  const workerErrorFiles = readWorkerErrorFiles(workDir, parseWorkerErrorPayload);
  const workerErrorPayload = workerErrorFiles.workerErrorPayload;
  const workerErrorRaw = workerErrorFiles.workerErrorRaw;
  if (workerResult.code !== 0) {
    throw buildWorkerFailureError({
      workerResult,
      logPath,
      workerErrorPayload,
      fallbackStage: "CSV_PYTHON_RUNNER",
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
    runner: "python",
    runnerExecutable,
    pythonExecutable: runnerExecutable,
  };
}

async function runOriginHealthCheck({
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

async function runOriginBatchJob({
  inputDir,
  originExePath,
  batchScriptPath,
  batchWorkerPath,
  plotType,
  xyPairs,
  plotCommand,
  postPlotCommands,
  runtimeRootDir,
}) {
  let normalizedOriginExePath = null;
  try {
    normalizedOriginExePath = assertOriginExePath(originExePath);
  } catch (error) {
    throw toStructuredOriginError({
      code: "ORIGIN_EXE_NOT_FOUND",
      stage: "PRECHECK",
      message: error?.message || "Origin executable path is invalid.",
      originExe: normalizeOriginExePath(originExePath),
    });
  }
  let normalizedInputDir = null;
  try {
    normalizedInputDir = assertDirectoryPath(
      inputDir,
      "Origin batch input directory",
    );
  } catch (error) {
    throw toStructuredOriginError({
      code: "ORIGIN_BATCH_INPUT_DIR_INVALID",
      stage: "PRECHECK",
      message:
        error?.message ||
        "Origin batch input directory is invalid.",
      originExe: normalizedOriginExePath,
    });
  }

  const { jobDir, workDir, logPath, errorPath, summaryPath } = createBatchJobPaths({
    runtimeRootDir,
  });

  const workerArgs = buildOriginBatchWorkerArgs({
    workDir,
    inputDir: normalizedInputDir,
    originExePath: normalizedOriginExePath,
    summaryPath,
    logPath,
    errorPath,
  });
  const pythonWorkerArgs = appendOriginPlotWorkerArgs(workerArgs, {
    plotType,
    xyPairs,
    plotCommand,
    postPlotCommands,
  });

  const normalizedBatchWorkerPath = normalizeOriginExePath(batchWorkerPath);
  const nativeWorkerAvailable = Boolean(
    normalizedBatchWorkerPath && fs.existsSync(normalizedBatchWorkerPath),
  );
  const pythonScriptAvailable = Boolean(batchScriptPath && fs.existsSync(batchScriptPath));

  if (!nativeWorkerAvailable && !pythonScriptAvailable) {
    throw toStructuredOriginError({
      code: "ORIGIN_BATCH_RUNNER_NOT_FOUND",
      stage: "PRECHECK",
      message:
        `No batch runner is available. Worker: ${normalizedBatchWorkerPath || "(none)"}; ` +
        `Script: ${batchScriptPath || "(none)"}`,
      logPath,
      originExe: normalizedOriginExePath,
    });
  }

  let workerResult = null;
  let runnerKind = null;
  let runnerExecutable = null;

  if (nativeWorkerAvailable) {
    try {
      workerResult = await runNativeBatchWorker(
        normalizedBatchWorkerPath,
        workerArgs,
        { windowsHide: true },
      );
      runnerKind = "native";
      runnerExecutable = workerResult.executable;
    } catch (error) {
      const canFallbackToPython = pythonScriptAvailable && error?.code === "ENOENT";
      if (!canFallbackToPython) {
        throw toStructuredOriginError({
          code: "ORIGIN_BATCH_RUNNER_FAILED",
          stage: "NATIVE_RUNNER",
          message:
            error?.message ||
            "Failed to run Origin batch native worker executable.",
          logPath,
          originExe: normalizedOriginExePath,
        });
      }
    }
  }

  if (!workerResult && pythonScriptAvailable) {
    try {
      workerResult = await runPythonScriptForBatch(
        batchScriptPath,
        pythonWorkerArgs,
        { windowsHide: true },
      );
      runnerKind = "python";
      runnerExecutable = workerResult.executable;
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw toStructuredOriginError({
          code: "ORIGIN_PYTHON_NOT_FOUND",
          stage: "PYTHON_RUNNER",
          message:
            "Python executable not found. Install Python and ensure python/py is available in PATH.",
          logPath,
          originExe: normalizedOriginExePath,
        });
      }
      throw toStructuredOriginError({
        code: "ORIGIN_BATCH_RUNNER_FAILED",
        stage: "PYTHON_RUNNER",
        message: error?.message || "Failed to run Origin batch python script.",
        logPath,
        originExe: normalizedOriginExePath,
      });
    }
  }

  if (!workerResult) {
    throw toStructuredOriginError({
      code: "ORIGIN_BATCH_RUNNER_NOT_FOUND",
      stage: "PRECHECK",
      message: "No available runner could be started for Origin batch.",
      logPath,
      originExe: normalizedOriginExePath,
    });
  }

  const workerErrorRaw = fs.existsSync(errorPath)
    ? String(fs.readFileSync(errorPath, "utf8") || "").trim()
    : "";
  const workerErrorPayload = parseWorkerErrorPayload(workerErrorRaw);
  const summary = parseJsonFile(summaryPath);

  if (workerResult.code !== 0) {
    throw buildWorkerFailureError({
      workerResult,
      logPath,
      workerErrorPayload,
      fallbackStage: "BATCH_RUN",
      fallbackCode: "ORIGIN_BATCH_FAILED",
      fallbackMessage:
        workerErrorRaw ||
        workerResult.stderr ||
        workerResult.stdout ||
        "Origin batch run failed.",
      originExe: normalizedOriginExePath,
    });
  }

  return {
    ok: true,
    jobDir,
    workDir,
    logPath,
    errorPath,
    summaryPath,
    inputDir: normalizedInputDir,
    summary,
    runner: runnerKind,
    runnerExecutable,
    pythonExecutable: runnerKind === "python" ? runnerExecutable : null,
  };
}

module.exports = {
  runOriginZipJob,
  runOriginCsvJob,
  runOriginHealthCheck,
  runOriginBatchJob,
};
