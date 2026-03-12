import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  ensureDir,
  getOriginBridgeFilePaths,
  getOriginBridgeWorkDir,
  normalizeOriginExePath,
  sanitizeFileName,
} from "./core.js";

function resolveRuntimeRootDir(runtimeRootDir) {
  const normalized = normalizeOriginExePath(runtimeRootDir);
  const fallback = path.join(process.cwd(), ".device");
  const candidate = normalized
    ? path.isAbsolute(normalized)
      ? normalized
      : path.resolve(process.cwd(), normalized)
    : fallback;
  ensureDir(candidate);
  return candidate;
}

function normalizeCleanupPolicy(policy) {
  const source = policy && typeof policy === "object" ? policy : {};

  const enabled =
    typeof source.enabled === "boolean" ? source.enabled : true;

  const keepSuccessJobsRaw = Number(source.keepSuccessJobs);
  const keepSuccessJobs = Number.isFinite(keepSuccessJobsRaw)
    ? Math.min(100, Math.max(0, Math.floor(keepSuccessJobsRaw)))
    : 1;

  const failedRetentionDaysRaw = Number(source.failedRetentionDays);
  const failedRetentionDays = Number.isFinite(failedRetentionDaysRaw)
    ? Math.min(365, Math.max(1, Math.floor(failedRetentionDaysRaw)))
    : 7;

  return {
    enabled,
    keepSuccessJobs,
    failedRetentionDays,
  };
}

function listJobDirectories(baseDir) {
  if (!baseDir || !fs.existsSync(baseDir)) return [];

  let entries = [];
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry?.isDirectory?.())
    .map((entry) => path.join(baseDir, entry.name));
}

function readJobErrorText(jobDir) {
  const { errorPath } = getOriginBridgeFilePaths(getOriginBridgeWorkDir(jobDir));
  if (!fs.existsSync(errorPath)) return "";
  try {
    return String(fs.readFileSync(errorPath, "utf8") || "").trim();
  } catch {
    return "";
  }
}

function getJobMtimeMs(jobDir) {
  try {
    const stat = fs.statSync(jobDir);
    return Number.isFinite(stat?.mtimeMs) ? stat.mtimeMs : 0;
  } catch {
    return 0;
  }
}

function deleteJobDirectory(jobDir) {
  try {
    fs.rmSync(jobDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

function cleanupOneJobBase(baseDir, policy, options = {}) {
  const source = options && typeof options === "object" ? options : {};
  const clearAll = Reflect.get(source, "clearAll") === true;

  const jobs = listJobDirectories(baseDir).map((jobDir) => {
    const errorText = readJobErrorText(jobDir);
    return {
      jobDir,
      isFailed: errorText.length > 0,
      mtimeMs: getJobMtimeMs(jobDir),
    };
  });

  const successJobs = jobs
    .filter((item) => !item.isFailed)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  const failedJobs = jobs.filter((item) => item.isFailed);

  const keepSet = new Set(
    successJobs.slice(0, policy.keepSuccessJobs).map((item) => item.jobDir),
  );

  const cutoffMs =
    Date.now() - policy.failedRetentionDays * 24 * 60 * 60 * 1000;

  const toDelete = [];
  if (clearAll) {
    for (const job of jobs) {
      toDelete.push({ ...job, reason: "MANUAL_CLEAR_ALL" });
    }
  } else {
    for (const job of successJobs) {
      if (!keepSet.has(job.jobDir)) {
        toDelete.push({ ...job, reason: "SUCCESS_OVER_LIMIT" });
      }
    }
    for (const job of failedJobs) {
      if (job.mtimeMs < cutoffMs) {
        toDelete.push({ ...job, reason: "FAILED_EXPIRED" });
      }
    }
  }

  let removed = 0;
  for (const item of toDelete) {
    if (deleteJobDirectory(item.jobDir)) removed += 1;
  }

  return {
    baseDir,
    totalJobs: jobs.length,
    failedJobs: failedJobs.length,
    successJobs: successJobs.length,
    removedJobs: removed,
  };
}

export function runOriginRuntimeCleanup(options = {}) {
  const source = options && typeof options === "object" ? options : {};
  const runtimeRootDir = Reflect.get(source, "runtimeRootDir");
  const policy = Reflect.get(source, "policy");
  const force = Reflect.get(source, "force") === true;
  const clearAll = Reflect.get(source, "clearAll") === true;

  const normalizedPolicy = normalizeCleanupPolicy(policy);
  const resolvedRuntimeRoot = resolveRuntimeRootDir(runtimeRootDir);
  const originRootDir = path.join(resolvedRuntimeRoot, "origin");
  ensureDir(originRootDir);

  if (!force && !normalizedPolicy.enabled) {
    return {
      ok: true,
      skipped: true,
      reason: "ORIGIN_RUNTIME_CLEANUP_DISABLED",
      runtimeRootDir: originRootDir,
      policy: normalizedPolicy,
      removedTotal: 0,
    };
  }

  const csvSummary = cleanupOneJobBase(
    path.join(originRootDir, "csv-jobs"),
    normalizedPolicy,
    { clearAll },
  );

  return {
    ok: true,
    skipped: false,
    runtimeRootDir: originRootDir,
    clearAll,
    policy: normalizedPolicy,
    csv: csvSummary,
    removedTotal: csvSummary.removedJobs,
  };
}

export function createCsvJobPaths(csvName, options = {}) {
  const source = options && typeof options === "object" ? options : {};
  const runtimeRootDir = Reflect.get(source, "runtimeRootDir");

  const rootDir = path.join(
    resolveRuntimeRootDir(runtimeRootDir),
    "origin",
    "csv-jobs",
  );
  ensureDir(rootDir);

  const jobId = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const jobDir = path.join(rootDir, jobId);
  const workDir = getOriginBridgeWorkDir(jobDir);

  ensureDir(jobDir);
  ensureDir(workDir);

  const safeCsvName = sanitizeFileName(csvName || "device_analysis_origin.csv");
  const csvPath = path.join(jobDir, safeCsvName);

  return {
    jobDir,
    workDir,
    csvPath,
    ...getOriginBridgeFilePaths(workDir),
  };
}

