import fs from "node:fs";
import path from "node:path";
import type { SharedProcessContributionContext } from "../sharedProcessMain.js";

const DESKTOP_LOG_FILE_NAME = "desktop-renderer.log";
const MAX_DESKTOP_LOG_BYTES = 2 * 1024 * 1024;
const RETAIN_LOG_FILES_DAYS = 14;

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const isStaleFile = (stats: fs.Stats, nowMs: number) => {
  const ageMs = nowMs - stats.mtimeMs;
  return ageMs > RETAIN_LOG_FILES_DAYS * 24 * 60 * 60 * 1000;
};

const truncateLargeDesktopLog = (
  context: SharedProcessContributionContext,
  logPath: string,
) => {
  if (!fs.existsSync(logPath)) return;

  try {
    const stats = fs.statSync(logPath);
    if (!stats.isFile() || stats.size <= MAX_DESKTOP_LOG_BYTES) return;

    // Keep the current log file path stable for appenders while trimming old boot noise.
    fs.writeFileSync(
      logPath,
      `[shared-process] Previous log exceeded ${MAX_DESKTOP_LOG_BYTES} bytes and was trimmed.\n`,
      "utf8",
    );
    context.log(`[shared-process] Trimmed large desktop log: ${logPath}`);
  } catch (error) {
    context.warn(
      `[shared-process] Failed to inspect desktop log: ${logPath}`,
      error,
    );
  }
};

const cleanStaleLogDirectory = (
  context: SharedProcessContributionContext,
  logsDir: string,
) => {
  if (!fs.existsSync(logsDir)) return;

  const nowMs = Date.now();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(logsDir, { withFileTypes: true });
  } catch (error) {
    context.warn(`[shared-process] Failed to read logs directory: ${logsDir}`, error);
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const filePath = path.join(logsDir, entry.name);
    try {
      const stats = fs.statSync(filePath);
      if (!isStaleFile(stats, nowMs)) continue;
      fs.rmSync(filePath, { force: true });
      context.log(`[shared-process] Removed stale log file: ${filePath}`);
    } catch (error) {
      context.warn(
        `[shared-process] Failed to clean log file '${filePath}': ${getErrorMessage(error)}`,
        error,
      );
    }
  }
};

export const cleanSharedProcessLogs = (context: SharedProcessContributionContext) => {
  const desktopLogPath = path.join(context.analysisHomeDir, DESKTOP_LOG_FILE_NAME);
  truncateLargeDesktopLog(context, desktopLogPath);

  // Future rotating loggers should write under analysisHomeDir/logs so retention stays localized.
  cleanStaleLogDirectory(context, path.join(context.analysisHomeDir, "logs"));
};
