import fs from "node:fs";
import type { SharedProcessContributionContext } from "../sharedProcessMain.js";

const removeDirectoryIfExists = (
  context: SharedProcessContributionContext,
  targetPath: string,
  label: string,
) => {
  try {
    if (!fs.existsSync(targetPath)) return;
    fs.rmSync(targetPath, { recursive: true, force: true });
    context.log(`[shared-process] Cleaned ${label}: ${targetPath}`);
  } catch (error) {
    context.warn(`[shared-process] Failed to clean ${label}: ${targetPath}`, error);
  }
};

export const cleanOriginRuntimeStorage = (
  context: SharedProcessContributionContext,
) => {
  // Origin jobs are temp runtime artifacts. They are recreated per export/run.
  removeDirectoryIfExists(
    context,
    context.originRuntimeStorageDir,
    "Origin runtime storage",
  );
};

export const cleanRustExcelJobs = (context: SharedProcessContributionContext) => {
  // Rust Excel conversion jobs are scratch files and must not survive app restarts.
  removeDirectoryIfExists(context, context.rustExcelJobRootDir, "Rust Excel job storage");
};
