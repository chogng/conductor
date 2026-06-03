import type { URI } from "src/cs/base/common/uri";
import { startPerf } from "src/cs/workbench/common/perf";
import {
  buildFileIdentityKey,
  isSupportedImportFileName,
  type FileSource,
} from "src/cs/workbench/contrib/files/common/files";

export type PendingImportFile = {
  finishFilePerf: (meta?: Record<string, unknown>) => void;
  kind: FileSource["kind"];
  relativePath: string | null;
  resource: URI | null;
  sourceFile: File;
  sourceKey: string;
};

export type PendingImportFilesResult = {
  readonly hasAnyUnsupportedFiles: boolean;
  readonly pendingImportFiles: PendingImportFile[];
  readonly unsupportedCount: number;
};

export const collectPendingImportFiles = (
  files: FileSource[],
): PendingImportFilesResult => {
  let hasAnyUnsupportedFiles = false;
  let unsupportedCount = 0;
  const pendingImportFiles: PendingImportFile[] = [];

  for (const source of files) {
    const sourceFile = source.file;
    const relativePath = source.relativePath?.trim() || null;
    const finishFilePerf = startPerf("import:prepare-file", {
      fileName: sourceFile.name,
      sizeBytes: sourceFile.size,
    });
    const sourceKey = buildFileIdentityKey(sourceFile, relativePath);
    if (!sourceKey) {
      finishFilePerf({ skipped: "missing-key" });
      continue;
    }

    if (!isSupportedImportFileName(sourceFile.name)) {
      hasAnyUnsupportedFiles = true;
      unsupportedCount += 1;
      finishFilePerf({ skipped: "unsupported" });
      continue;
    }

    pendingImportFiles.push({
      finishFilePerf,
      kind: source.kind,
      relativePath,
      resource: source.resource ?? null,
      sourceFile,
      sourceKey,
    });
  }

  return {
    hasAnyUnsupportedFiles,
    pendingImportFiles,
    unsupportedCount,
  };
};
