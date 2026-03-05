const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ORIGIN_ERROR_PREFIX = "__ORIGIN_ERROR__:";

function ensureDir(dirPath) {
  if (!dirPath || typeof dirPath !== "string") {
    throw new Error("Invalid directory path.");
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeFileName(name) {
  const raw = String(name || "device_analysis_origin.zip");
  const cleaned = raw
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "device_analysis_origin.zip";
}

function escapePsSingleQuoted(input) {
  return String(input || "").replace(/'/g, "''");
}

function getPowerShellExePath() {
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const candidate = path.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  return fs.existsSync(candidate) ? candidate : "powershell.exe";
}

function runProcess(exePath, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exePath, args, {
      cwd: options.cwd,
      windowsHide: options.windowsHide !== false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      resolve({
        code: Number.isInteger(code) ? code : -1,
        stdout,
        stderr,
      });
    });
  });
}

async function expandArchive(zipPath, destinationPath) {
  const psCommand = `Expand-Archive -LiteralPath '${escapePsSingleQuoted(
    zipPath,
  )}' -DestinationPath '${escapePsSingleQuoted(destinationPath)}' -Force`;

  const result = await runProcess(
    getPowerShellExePath(),
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCommand],
    { windowsHide: true },
  );

  if (result.code !== 0) {
    throw new Error(
      `Failed to extract ZIP (${result.code}): ${
        result.stderr || result.stdout || "unknown error"
      }`,
    );
  }
}

function normalizeZipBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
  if (ArrayBuffer.isView(bytes)) {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  if (Array.isArray(bytes)) return Buffer.from(bytes);
  throw new Error("Invalid ZIP payload bytes.");
}

function normalizeOriginExePath(inputPath) {
  if (typeof inputPath !== "string") return null;
  const normalized = inputPath.trim();
  return normalized || null;
}

function normalizeOriginErrorPayload(rawPayload, fallback = {}) {
  const payload = rawPayload && typeof rawPayload === "object" ? rawPayload : {};

  const normalizedMessage =
    typeof payload.message === "string" && payload.message.trim()
      ? payload.message.trim()
      : typeof fallback.message === "string" && fallback.message.trim()
        ? fallback.message.trim()
        : "Origin worker failed.";

  const normalizedCode =
    typeof payload.code === "string" && payload.code.trim()
      ? payload.code.trim()
      : typeof fallback.code === "string" && fallback.code.trim()
        ? fallback.code.trim()
        : "ORIGIN_WORKER_FAILED";

  const normalizedStage =
    typeof payload.stage === "string" && payload.stage.trim()
      ? payload.stage.trim()
      : typeof fallback.stage === "string" && fallback.stage.trim()
        ? fallback.stage.trim()
        : "UNKNOWN";

  const normalizedHResult =
    typeof payload.hresult === "string" && payload.hresult.trim()
      ? payload.hresult.trim()
      : typeof fallback.hresult === "string" && fallback.hresult.trim()
        ? fallback.hresult.trim()
        : null;

  const normalizedLogPath =
    typeof payload.logPath === "string" && payload.logPath.trim()
      ? payload.logPath.trim()
      : typeof fallback.logPath === "string" && fallback.logPath.trim()
        ? fallback.logPath.trim()
        : null;

  const normalizedOriginExe =
    typeof payload.originExe === "string" && payload.originExe.trim()
      ? payload.originExe.trim()
      : typeof fallback.originExe === "string" && fallback.originExe.trim()
        ? fallback.originExe.trim()
        : null;

  return {
    code: normalizedCode,
    stage: normalizedStage,
    message: normalizedMessage,
    hresult: normalizedHResult,
    logPath: normalizedLogPath,
    originExe: normalizedOriginExe,
  };
}

function toStructuredOriginError(rawPayload, fallback = {}) {
  const normalized = normalizeOriginErrorPayload(rawPayload, fallback);
  const error = new Error(`${ORIGIN_ERROR_PREFIX}${JSON.stringify(normalized)}`);
  error.name = "OriginBridgeError";
  error.origin = normalized;
  return error;
}

function parseWorkerErrorPayload(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // Fall through to plain text payload.
  }
  return { message: raw };
}

function assertOriginExePath(originExePath) {
  const normalized = normalizeOriginExePath(originExePath);
  if (!normalized) {
    throw new Error("Origin executable path is empty.");
  }
  if (!path.isAbsolute(normalized)) {
    throw new Error("Origin executable path must be absolute.");
  }
  if (!fs.existsSync(normalized)) {
    throw new Error(`Origin executable not found: ${normalized}`);
  }
  const stat = fs.statSync(normalized);
  if (!stat.isFile()) {
    throw new Error(`Origin executable path is not a file: ${normalized}`);
  }
  return normalized;
}

function assertDirectoryPath(dirPath, label = "Directory path") {
  const normalized = normalizeOriginExePath(dirPath);
  if (!normalized) {
    throw new Error(`${label} is empty.`);
  }
  if (!path.isAbsolute(normalized)) {
    throw new Error(`${label} must be absolute.`);
  }
  if (!fs.existsSync(normalized)) {
    throw new Error(`${label} not found: ${normalized}`);
  }
  const stat = fs.statSync(normalized);
  if (!stat.isDirectory()) {
    throw new Error(`${label} is not a directory: ${normalized}`);
  }
  return normalized;
}

function expandWindowsEnvVars(input) {
  const raw = String(input || "");
  return raw.replace(/%([^%]+)%/g, (_match, name) => {
    const key = String(name || "").trim();
    return process.env[key] ?? `%${key}%`;
  });
}

function collectCandidatePathsFromString(input) {
  const raw = String(input || "").trim();
  if (!raw) return [];

  const candidates = [];
  const exeMatches = raw.match(/[A-Za-z]:\\[^"\r\n]*?\.exe/gi) || [];
  for (const match of exeMatches) {
    const expanded = expandWindowsEnvVars(match).trim();
    if (expanded) candidates.push(expanded);
  }

  const normalized = expandWindowsEnvVars(raw).trim().replace(/^"(.*)"$/, "$1");
  if (/\.exe$/i.test(normalized)) {
    candidates.push(normalized);
  } else if (path.win32.isAbsolute(normalized)) {
    candidates.push(path.join(normalized, "Origin.exe"));
    candidates.push(path.join(normalized, "Origin64.exe"));
  }

  return candidates;
}

async function collectRegistryOriginCandidates() {
  const regQueries = [
    ["query", "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Origin.exe", "/ve"],
    ["query", "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Origin.exe", "/ve"],
    ["query", "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Origin.exe", "/ve"],
    ["query", "HKCU\\SOFTWARE\\OriginLab", "/s"],
    ["query", "HKLM\\SOFTWARE\\OriginLab", "/s"],
    ["query", "HKLM\\SOFTWARE\\WOW6432Node\\OriginLab", "/s"],
    [
      "query",
      "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
      "/s",
      "/f",
      "Origin",
      "/d",
    ],
    [
      "query",
      "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
      "/s",
      "/f",
      "Origin",
      "/d",
    ],
    [
      "query",
      "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
      "/s",
      "/f",
      "Origin",
      "/d",
    ],
  ];

  const candidates = [];
  for (const args of regQueries) {
    try {
      const result = await runProcess("reg.exe", args, { windowsHide: true });
      if (result.code !== 0) continue;
      const lines = String(result.stdout || "").split(/\r?\n/);
      for (const line of lines) {
        const match = line.match(/^\s*([^\s].*?)\s+REG_[A-Z0-9_]+\s+(.+)\s*$/i);
        if (!match) continue;
        const value = String(match[2] || "").trim();
        if (!value) continue;
        candidates.push(...collectCandidatePathsFromString(value));
      }
    } catch {
      // Ignore registry read failures; continue probing other sources.
    }
  }

  return candidates;
}

function collectDirectoryOriginCandidates() {
  const roots = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.LocalAppData,
  ]
    .filter((p) => typeof p === "string" && p.trim())
    .map((p) => String(p).trim());

  const candidates = [];
  const seenDirs = new Set();
  for (const root of roots) {
    const baseDir = path.join(root, "OriginLab");
    if (!fs.existsSync(baseDir) || seenDirs.has(baseDir.toLowerCase())) continue;
    seenDirs.add(baseDir.toLowerCase());

    const queue = [{ dir: baseDir, depth: 0 }];
    while (queue.length) {
      const { dir, depth } = queue.shift();
      if (depth > 2) continue;

      let entries = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile()) {
          if (/^origin(64)?\.exe$/i.test(entry.name)) {
            candidates.push(fullPath);
          }
          continue;
        }
        if (entry.isDirectory()) {
          queue.push({ dir: fullPath, depth: depth + 1 });
        }
      }
    }
  }

  return candidates;
}

function pickFirstValidOriginExePath(candidates) {
  const seen = new Set();
  for (const raw of candidates) {
    const candidate = normalizeOriginExePath(raw);
    if (!candidate) continue;
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      return assertOriginExePath(candidate);
    } catch {
      // Skip invalid path candidates.
    }
  }
  return null;
}

async function detectOriginExecutablePath() {
  if (process.platform !== "win32") return null;

  const candidates = [];
  candidates.push(...collectCandidatePathsFromString(process.env.ORIGIN_EXE_PATH));
  candidates.push(...(await collectRegistryOriginCandidates()));
  candidates.push(...collectDirectoryOriginCandidates());

  return pickFirstValidOriginExePath(candidates);
}

function createJobPaths(zipName) {
  const rootDir = path.join(os.tmpdir(), "device-analysis-origin", "jobs");
  ensureDir(rootDir);

  const jobId = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const jobDir = path.join(rootDir, jobId);
  const extractDir = path.join(jobDir, "extract");
  const workDir = path.join(jobDir, ".ob");

  ensureDir(jobDir);
  ensureDir(extractDir);
  ensureDir(workDir);

  const safeZipName = sanitizeFileName(zipName);
  const inputZipPath = path.join(jobDir, safeZipName);

  return {
    jobDir,
    extractDir,
    workDir,
    inputZipPath,
  };
}

function createBatchJobPaths() {
  const rootDir = path.join(os.tmpdir(), "device-analysis-origin", "batch-jobs");
  ensureDir(rootDir);

  const jobId = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const jobDir = path.join(rootDir, jobId);
  const workDir = path.join(jobDir, ".ob");

  ensureDir(jobDir);
  ensureDir(workDir);

  return {
    jobDir,
    workDir,
    logPath: path.join(workDir, "originbridge.log"),
    errorPath: path.join(workDir, "error.txt"),
    summaryPath: path.join(workDir, "summary.json"),
  };
}

function parseJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const raw = String(fs.readFileSync(filePath, "utf8") || "").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

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

async function runPythonScriptForBatch(pythonScriptPath, scriptArgs, options = {}) {
  const attempts = [];
  const envPython = normalizeOriginExePath(process.env.ORIGIN_PYTHON);
  if (envPython) {
    attempts.push({ exe: envPython, prefix: [] });
  }
  attempts.push(
    { exe: "python", prefix: [] },
    { exe: "py", prefix: ["-3"] },
  );

  const tried = [];
  let lastError = null;

  for (const attempt of attempts) {
    const key = `${attempt.exe}|${attempt.prefix.join(" ")}`;
    if (tried.includes(key)) continue;
    tried.push(key);

    try {
      const args = [...attempt.prefix, "-u", pythonScriptPath, ...scriptArgs];
      const result = await runProcess(attempt.exe, args, options);
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

  const notFoundError = new Error("Python executable not found.");
  notFoundError.code = "ENOENT";
  notFoundError.cause = lastError || null;
  throw notFoundError;
}

function readWorkerErrorFiles(workDir) {
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

  const { jobDir, extractDir, workDir, inputZipPath } = createJobPaths(zipName);
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

  let workerResult = null;
  let runnerKind = null;
  let runnerExecutable = null;
  let nativeWorkerFailedResult = null;

  if (nativeWorkerAvailable) {
    try {
      const nativeResult = await runNativeZipWorker(
        normalizedWorkerExecutablePath,
        zipWorkerArgs,
        { windowsHide: true },
      );
      if (nativeResult.code === 0) {
        workerResult = nativeResult;
        runnerKind = "native";
        runnerExecutable = nativeResult.executable;
      } else if (scriptWorkerAvailable) {
        nativeWorkerFailedResult = nativeResult;
      } else {
        workerResult = nativeResult;
        runnerKind = "native";
        runnerExecutable = nativeResult.executable;
      }
    } catch (error) {
      const canFallbackToScript = scriptWorkerAvailable && error?.code === "ENOENT";
      if (!canFallbackToScript) {
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
  }

  if (!workerResult && scriptWorkerAvailable) {
    workerResult = await runProcess(
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
      ],
      { windowsHide: true },
    );
    runnerKind = nativeWorkerFailedResult ? "powershell-fallback" : "powershell";
    runnerExecutable = workerScriptPath;
  }

  if (!workerResult && nativeWorkerFailedResult) {
    workerResult = nativeWorkerFailedResult;
    runnerKind = "native";
    runnerExecutable = normalizedWorkerExecutablePath;
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

  const workerErrorFiles = readWorkerErrorFiles(workDir);
  const workerErrorPayload = workerErrorFiles.workerErrorPayload;
  const workerErrorRaw = workerErrorFiles.workerErrorRaw;

  if (workerResult.code !== 0) {
    throw buildWorkerFailureError({
      workerResult,
      logPath,
      workerErrorPayload,
      fallbackStage: runnerKind === "native" ? "ZIP_NATIVE_RUNNER" : "RUN_WORKER",
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

async function runOriginHealthCheck({
  originExePath,
  workerScriptPath,
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

  const { jobDir, extractDir, workDir } = createJobPaths("origin_health_check.zip");

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
    readWorkerErrorFiles(workDir);

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

  const { jobDir, workDir, logPath, errorPath, summaryPath } = createBatchJobPaths();

  const workerArgs = buildOriginBatchWorkerArgs({
    workDir,
    inputDir: normalizedInputDir,
    originExePath: normalizedOriginExePath,
    summaryPath,
    logPath,
    errorPath,
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
        workerArgs,
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

async function pickOriginExecutable({
  dialog,
  ownerWindow,
  defaultPath,
}) {
  const result = await dialog.showOpenDialog(ownerWindow || undefined, {
    title: "Select Origin executable",
    defaultPath: defaultPath || undefined,
    properties: ["openFile"],
    filters: [
      { name: "Origin executable", extensions: ["exe"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
    return null;
  }

  return assertOriginExePath(result.filePaths[0]);
}

module.exports = {
  ORIGIN_ERROR_PREFIX,
  normalizeOriginExePath,
  assertOriginExePath,
  assertDirectoryPath,
  detectOriginExecutablePath,
  pickOriginExecutable,
  runOriginZipJob,
  runOriginHealthCheck,
  runOriginBatchJob,
};
