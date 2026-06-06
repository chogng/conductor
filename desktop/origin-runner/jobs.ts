import fs from "node:fs";
import path from "node:path";
import {
  normalizeOriginExePath,
  assertOriginExePath,
  sanitizeFileName,
  type RunProcessResult,
} from "./core.js";
import {
  normalizeOriginErrorPayload,
  toStructuredOriginError,
  parseWorkerErrorPayload,
  type OriginErrorPayload,
} from "./errors.js";
import {
  createCsvJobPaths,
} from "./runtime.js";
import {
  buildOriginCsvBatchWorkerArgs,
  buildOriginCsvWorkerArgs,
  runNativeCsvWorker,
  runPythonScriptForBatch,
  readWorkerErrorFiles,
} from "./runners.js";

type OriginRunnerResult = RunProcessResult & {
  executable: string;
};

type OriginCsvJobInput = {
  csvName?: unknown;
  csvPath?: unknown;
  csvText?: unknown;
  originExePath: unknown;
  workerScriptPath?: string | null;
  workerExecutablePath?: unknown;
  runtimeRootDir?: unknown;
  importMode?: string;
  workbookKey?: string;
  workbookName?: string;
  sheetName?: string;
  sheetShortName?: string;
  plotType?: unknown;
  xyPairs?: unknown;
  plotCommand?: unknown;
  postPlotCommands?: unknown;
  skipPlot?: unknown;
  lineWidth?: unknown;
  capabilities?: unknown;
};

type OriginCsvBatchInput = {
  jobs?: unknown;
  originExePath: unknown;
  workerScriptPath?: string | null;
  workerExecutablePath?: unknown;
  runtimeRootDir?: unknown;
};

type OriginHealthCheckInput = {
  originExePath: unknown;
  workerExecutablePath?: unknown;
  workerScriptPath?: string | null;
  runtimeRootDir?: unknown;
};

type NormalizedBatchCsvJob = {
  csvName: string;
  csvPath: string;
  csvText: string;
  importMode: string;
  workbookKey: string;
  workbookName: string;
  sheetName: string;
  sheetShortName: string;
  plotType: unknown;
  xyPairs: string;
  plotCommand: string;
  postPlotCommands: unknown[];
  skipPlot: boolean;
  lineWidth: unknown;
  capabilities: Record<string, unknown> | null;
};

function getErrorCode(error: unknown): unknown {
  return Reflect.get(error && typeof error === "object" ? error : {}, "code");
}

function getErrorMessage(error: unknown): string | null {
  return error instanceof Error && error.message ? error.message : null;
}

function buildWorkerFailureError({
  workerResult,
  logPath,
  workerErrorPayload,
  fallbackStage,
  fallbackCode,
  fallbackMessage,
  originExe,
}: {
  workerResult: OriginRunnerResult;
  logPath: string;
  workerErrorPayload: OriginErrorPayload | null;
  fallbackStage: string;
  fallbackCode: string;
  fallbackMessage: string;
  originExe: string;
}): Error {
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

function buildPythonRunnerStartError(
  error: unknown,
  { logPath, originExe }: { logPath: string; originExe: string },
): Error {
  const errorCode = getErrorCode(error);
  const pythonMissing = errorCode === "ENOENT";
  const moduleMissing = errorCode === "PY_MODULE_MISSING";
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
          : getErrorMessage(error) || "Failed to run Origin CSV python script.",
    logPath,
    originExe,
  });
}

function buildHealthCheckPythonRunnerStartError(
  error: unknown,
  { logPath, originExe }: { logPath: string; originExe: string },
): Error {
  const errorCode = getErrorCode(error);
  const pythonMissing = errorCode === "ENOENT";
  const moduleMissing = errorCode === "PY_MODULE_MISSING";
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
          : getErrorMessage(error) || "Failed to run Origin health-check python script.",
    logPath,
    originExe,
  });
}

function buildNativeRunnerStartError(
  error: unknown,
  { logPath, originExe, workerExe, stage, message, code }: {
    logPath: string;
    originExe: string;
    workerExe?: string | null;
    stage: string;
    message: string;
    code?: string;
  },
): Error {
  return toStructuredOriginError({
    code: code || "ORIGIN_CSV_RUNNER_FAILED",
    stage,
    message: getErrorMessage(error) || message,
    logPath,
    originExe,
    workerExe,
  });
}

function buildNativeWorkerEnv(workDir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    TEMP: workDir,
    TMP: workDir,
  };
}

function hasSuccessfulOriginHealthCheckLog(logPath: string): boolean {
  if (!logPath || !fs.existsSync(logPath)) return false;
  try {
    const logText = fs.readFileSync(logPath, "utf8");
    return logText.includes("Origin health check completed successfully.");
  } catch {
    return false;
  }
}

async function runPythonWorker(
  workerScriptPath: string,
  workerArgs: string[],
): Promise<OriginRunnerResult> {
  return runPythonScriptForBatch(workerScriptPath, workerArgs, {
    windowsHide: true,
    requiredModule: "originpro",
  });
}

function createUniqueCsvFileName(
  name: unknown,
  usedNames: Set<string>,
  index: number,
): string {
  const original = sanitizeFileName(name || `origin_${index + 1}.csv`);
  const extension = path.extname(original);
  const base = extension ? original.slice(0, -extension.length) : original;
  let candidate = original;
  let counter = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${base}_${counter}${extension}`;
    counter += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function normalizeReadableCsvPath(csvPath: unknown, originExePath: string): string {
  const normalized = normalizeOriginExePath(csvPath);
  if (!normalized) return "";
  if (!path.isAbsolute(normalized)) {
    throw toStructuredOriginError({
      code: "ORIGIN_CSV_PATH_INVALID",
      stage: "PRECHECK",
      message: "CSV path must be absolute.",
      originExe: originExePath,
    });
  }
  if (!fs.existsSync(normalized)) {
    throw toStructuredOriginError({
      code: "ORIGIN_CSV_PATH_NOT_FOUND",
      stage: "PRECHECK",
      message: `CSV file was not found: ${normalized}`,
      originExe: originExePath,
    });
  }
  const stat = fs.statSync(normalized);
  if (!stat.isFile() || stat.size <= 0) {
    throw toStructuredOriginError({
      code: "ORIGIN_CSV_PATH_INVALID",
      stage: "PRECHECK",
      message: `CSV path is not a readable file: ${normalized}`,
      originExe: originExePath,
    });
  }
  return normalized;
}

function normalizeBatchCsvJobs(
  jobs: unknown,
  originExePath: string,
): NormalizedBatchCsvJob[] {
  const list = Array.isArray(jobs) ? jobs : [];
  if (!list.length) {
    throw toStructuredOriginError({
      code: "ORIGIN_CSV_EMPTY",
      stage: "PRECHECK",
      message: "Origin CSV batch payload is empty.",
      originExe: originExePath,
    });
  }

  return list.map((job, index) => {
    const source = job && typeof job === "object" ? job : {};
    const csvName =
      typeof source.csvName === "string" && source.csvName.trim()
        ? source.csvName.trim()
        : `origin_${index + 1}.csv`;
    const csvPath = normalizeReadableCsvPath(
      Reflect.get(source, "csvPath"),
      originExePath,
    );
    const csvText =
      typeof source.csvText === "string" ? source.csvText : String(source.csvText || "");
    if (!csvPath && !csvText.trim()) {
      throw toStructuredOriginError({
        code: "ORIGIN_CSV_EMPTY",
        stage: "PRECHECK",
        message: `CSV payload is empty for batch job #${index + 1}.`,
        originExe: originExePath,
      });
    }

    return {
      csvName,
      csvPath,
      csvText,
      importMode:
        typeof source.importMode === "string" && source.importMode.trim()
          ? source.importMode.trim()
          : "new-book",
      workbookKey:
        typeof source.workbookKey === "string" ? source.workbookKey.trim() : "",
      workbookName:
        typeof source.workbookName === "string" ? source.workbookName.trim() : "",
      sheetName:
        typeof source.sheetName === "string" ? source.sheetName.trim() : "",
      sheetShortName:
        typeof source.sheetShortName === "string" ? source.sheetShortName.trim() : "",
      plotType: source.plotType,
      xyPairs: typeof source.xyPairs === "string" ? source.xyPairs : "",
      plotCommand:
        typeof source.plotCommand === "string" ? source.plotCommand : "",
      postPlotCommands: Array.isArray(source.postPlotCommands)
        ? source.postPlotCommands
        : [],
      skipPlot: source.skipPlot === true,
      lineWidth: source.lineWidth,
      capabilities:
        source.capabilities && typeof source.capabilities === "object"
          ? source.capabilities
          : null,
    };
  });
}

export async function runOriginCsvJob({
  csvName,
  csvPath,
  csvText,
  originExePath,
  workerScriptPath,
  workerExecutablePath,
  runtimeRootDir,
  importMode = "new-book",
  workbookKey = "",
  workbookName = "",
  sheetName = "",
  sheetShortName = "",
  plotType,
  xyPairs,
  plotCommand,
  postPlotCommands,
  skipPlot,
  lineWidth,
  capabilities,
}: OriginCsvJobInput) {
  const normalizedOriginExePath = assertOriginExePath(originExePath);
  const normalizedWorkerExecutablePath = normalizeOriginExePath(workerExecutablePath);
  const nativeWorkerAvailable = Boolean(
    normalizedWorkerExecutablePath && fs.existsSync(normalizedWorkerExecutablePath),
  );
  const scriptWorkerAvailable =
    typeof workerScriptPath === "string" && fs.existsSync(workerScriptPath);

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

  const normalizedCsvPath = normalizeReadableCsvPath(csvPath, normalizedOriginExePath);
  const normalizedCsvText = typeof csvText === "string" ? csvText : String(csvText || "");
  if (!normalizedCsvPath && !normalizedCsvText.trim()) {
    throw toStructuredOriginError({
      code: "ORIGIN_CSV_EMPTY",
      stage: "PRECHECK",
      message: "CSV payload is empty.",
      originExe: normalizedOriginExePath,
    });
  }

  const {
    jobDir,
    workDir,
    csvPath: jobCsvPath,
    logPath,
    errorPath,
  } = createCsvJobPaths(csvName, {
    runtimeRootDir,
  });
  const workerCsvPath = normalizedCsvPath || jobCsvPath;
  if (!normalizedCsvPath) {
    fs.writeFileSync(workerCsvPath, normalizedCsvText, "utf8");
  }

  const workerArgs = buildOriginCsvWorkerArgs({
    workDir,
    csvPath: workerCsvPath,
    originExePath: normalizedOriginExePath,
    logPath,
    errorPath,
    importMode,
    workbookKey,
    workbookName,
    sheetName,
    sheetShortName,
    plotType,
    xyPairs,
    plotCommand,
    postPlotCommands,
    skipPlot,
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
      const errorCode = getErrorCode(error);
      const pythonMissing = errorCode === "ENOENT";
      const moduleMissing = errorCode === "PY_MODULE_MISSING";
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
        workerExe: normalizedWorkerExecutablePath,
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
    csvPath: workerCsvPath,
    runner: runnerKind,
    runnerExecutable,
    pythonExecutable: runnerKind === "python" ? runnerExecutable : null,
  };
}

export async function runOriginCsvBatchJob({
  jobs,
  originExePath,
  workerScriptPath,
  workerExecutablePath,
  runtimeRootDir,
}: OriginCsvBatchInput) {
  const normalizedOriginExePath = assertOriginExePath(originExePath);
  const normalizedWorkerExecutablePath = normalizeOriginExePath(workerExecutablePath);
  const nativeWorkerAvailable = Boolean(
    normalizedWorkerExecutablePath && fs.existsSync(normalizedWorkerExecutablePath),
  );
  const scriptWorkerAvailable =
    typeof workerScriptPath === "string" && fs.existsSync(workerScriptPath);

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

  const normalizedJobs = normalizeBatchCsvJobs(jobs, normalizedOriginExePath);
  const { jobDir, workDir, logPath, errorPath } = createCsvJobPaths(
    normalizedJobs[0]?.csvName || "origin.csv",
    {
      runtimeRootDir,
    },
  );
  const manifestPath = path.join(workDir, "batch-jobs.json");
  const usedCsvNames = new Set<string>();
  const manifestJobs = normalizedJobs.map((job, index) => {
    const csvFileName = createUniqueCsvFileName(job.csvName, usedCsvNames, index);
    const csvPath = path.join(jobDir, csvFileName);
    const workerCsvPath = job.csvPath || csvPath;
    if (!job.csvPath) {
      fs.writeFileSync(workerCsvPath, job.csvText, "utf8");
    }
    return {
      csvPath: workerCsvPath,
      importMode: job.importMode,
      workbookKey: job.workbookKey,
      workbookName: job.workbookName,
      sheetName: job.sheetName,
      sheetShortName: job.sheetShortName,
      plotType: job.plotType,
      xyPairs: job.xyPairs,
      plotCommand: job.plotCommand,
      postPlotCommands: job.postPlotCommands,
      skipPlot: job.skipPlot,
      lineWidth: job.lineWidth,
      capabilities: job.capabilities,
    };
  });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ jobs: manifestJobs }, null, 2),
    "utf8",
  );

  const workerArgs = buildOriginCsvBatchWorkerArgs({
    workDir,
    batchJobsPath: manifestPath,
    originExePath: normalizedOriginExePath,
    logPath,
    errorPath,
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
      const errorCode = getErrorCode(error);
      const pythonMissing = errorCode === "ENOENT";
      const moduleMissing = errorCode === "PY_MODULE_MISSING";
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
        workerExe: normalizedWorkerExecutablePath,
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
        : "No available runner could be started for Origin CSV batch job.",
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
        "Origin CSV batch run failed.",
      originExe: normalizedOriginExePath,
    });
  }

  return {
    ok: true,
    jobDir,
    workDir,
    logPath,
    errorPath,
    batchJobCount: manifestJobs.length,
    manifestPath,
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
}: OriginHealthCheckInput) {
  const normalizedOriginExePath = assertOriginExePath(originExePath);
  const normalizedWorkerExecutablePath = normalizeOriginExePath(workerExecutablePath);
  const nativeWorkerAvailable = Boolean(
    normalizedWorkerExecutablePath && fs.existsSync(normalizedWorkerExecutablePath),
  );
  const scriptWorkerAvailable =
    typeof workerScriptPath === "string" && fs.existsSync(workerScriptPath);

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
      const errorCode = getErrorCode(error);
      const pythonMissing = errorCode === "ENOENT";
      const moduleMissing = errorCode === "PY_MODULE_MISSING";
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
        workerExe: normalizedWorkerExecutablePath,
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
    if (!workerErrorRaw && hasSuccessfulOriginHealthCheckLog(logPath)) {
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
        workerExitCode: workerResult.code,
        warning:
          "Origin health check completed successfully, but the worker wrapper returned a non-zero exit code.",
      };
    }

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
