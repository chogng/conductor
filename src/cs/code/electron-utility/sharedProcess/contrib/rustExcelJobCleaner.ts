import fs from "node:fs";
import path from "node:path";
import type { SharedProcessContributionContext } from "../sharedProcessMain.js";

const RUST_EXCEL_JOB_DIR_NAME = "rust-xls-jobs";

const isExpectedRustExcelJobDir = (context: SharedProcessContributionContext) => {
  const targetPath = path.resolve(context.rustExcelJobRootDir);
  const tempRoot = path.resolve(context.analysisTempRootDir);
  return (
    path.dirname(targetPath) === tempRoot &&
    path.basename(targetPath) === RUST_EXCEL_JOB_DIR_NAME
  );
};

export const cleanRustExcelJobs = (context: SharedProcessContributionContext) => {
  const targetPath = context.rustExcelJobRootDir;
  if (!isExpectedRustExcelJobDir(context)) {
    context.warn(
      `[shared-process] Skipped Rust Excel job cleanup for unexpected path: ${targetPath}`,
    );
    return;
  }

  try {
    if (!fs.existsSync(targetPath)) return;
    fs.rmSync(targetPath, { recursive: true, force: true });
    context.log(`[shared-process] Cleaned Rust Excel job storage: ${targetPath}`);
  } catch (error) {
    context.warn(
      `[shared-process] Failed to clean Rust Excel job storage: ${targetPath}`,
      error,
    );
  }
};
