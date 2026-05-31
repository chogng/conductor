import fs from "node:fs";
import path from "node:path";
import type { SharedProcessContributionContext } from "../sharedProcessMain.js";

const ORIGIN_RUNTIME_STORAGE_DIR_NAME = "origin";

const isExpectedOriginRuntimeStorageDir = (
  context: SharedProcessContributionContext,
) => {
  const targetPath = path.resolve(context.originRuntimeStorageDir);
  const tempRoot = path.resolve(context.analysisTempRootDir);
  return (
    path.dirname(targetPath) === tempRoot &&
    path.basename(targetPath) === ORIGIN_RUNTIME_STORAGE_DIR_NAME
  );
};

export const cleanOriginRuntimeStorage = (
  context: SharedProcessContributionContext,
) => {
  const targetPath = context.originRuntimeStorageDir;
  if (!isExpectedOriginRuntimeStorageDir(context)) {
    context.warn(
      `[shared-process] Skipped Origin runtime storage cleanup for unexpected path: ${targetPath}`,
    );
    return;
  }

  try {
    if (!fs.existsSync(targetPath)) return;
    fs.rmSync(targetPath, { recursive: true, force: true });
    context.log(`[shared-process] Cleaned Origin runtime storage: ${targetPath}`);
  } catch (error) {
    context.warn(
      `[shared-process] Failed to clean Origin runtime storage: ${targetPath}`,
      error,
    );
  }
};
