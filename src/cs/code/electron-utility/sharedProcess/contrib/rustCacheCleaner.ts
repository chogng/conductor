import fs from "node:fs";
import path from "node:path";
import type { SharedProcessContributionContext } from "../sharedProcessMain.js";

const RUST_PROCESSING_RESULT_DIR_PREFIX = "rust-process-";

const isExpectedRustProcessingResultDir = (
  context: SharedProcessContributionContext,
  targetPath: string,
) => {
  const resolvedTarget = path.resolve(targetPath);
  const tempRoot = path.resolve(context.analysisTempRootDir);
  return (
    path.dirname(resolvedTarget) === tempRoot &&
    path.basename(resolvedTarget).startsWith(RUST_PROCESSING_RESULT_DIR_PREFIX)
  );
};

export const cleanRustProcessingCaches = (
  context: SharedProcessContributionContext,
) => {
  const tempRoot = context.analysisTempRootDir;

  let entries: fs.Dirent[];
  try {
    if (!fs.existsSync(tempRoot)) {
      return;
    }
    entries = fs.readdirSync(tempRoot, { withFileTypes: true });
  } catch (error) {
    context.warn(
      `[shared-process] Failed to inspect Rust processing cache root: ${tempRoot}`,
      error,
    );
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(RUST_PROCESSING_RESULT_DIR_PREFIX)) {
      continue;
    }

    const targetPath = path.join(tempRoot, entry.name);
    if (!isExpectedRustProcessingResultDir(context, targetPath)) {
      context.warn(
        `[shared-process] Skipped Rust processing cache cleanup for unexpected path: ${targetPath}`,
      );
      continue;
    }

    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      context.log(`[shared-process] Cleaned Rust processing cache: ${targetPath}`);
    } catch (error) {
      context.warn(
        `[shared-process] Failed to clean Rust processing cache: ${targetPath}`,
        error,
      );
    }
  }
};
