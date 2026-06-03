import type { URI } from "src/cs/base/common/uri";
import { startPerf } from "src/cs/workbench/common/perf";
import {
  buildFileSourceIdentityKey,
  isSupportedImportFileName,
  type FileSource,
} from "src/cs/workbench/contrib/files/common/files";

export type PendingImportFile = {
  finishFilePerf: (meta?: Record<string, unknown>) => void;
  kind: FileSource["kind"];
  lastModified: number;
  loadFile?: () => Promise<File>;
  relativePath: string | null;
  resource: URI | null;
  sourceFile?: File;
  sourceName: string;
  sourceSize: number;
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
    const sourceName = source.kind === "path" ? source.fileName : source.file.name;
    const sourceSize = source.kind === "path" ? source.size : source.file.size;
    const lastModified = source.kind === "path" ? source.lastModified : source.file.lastModified;
    const relativePath = source.relativePath?.trim() || null;
    const finishFilePerf = startPerf("import:prepare-file", {
      fileName: sourceName,
      sizeBytes: sourceSize,
    });
    const sourceKey = buildFileSourceIdentityKey(
      sourceName,
      sourceSize,
      lastModified,
      relativePath,
    );
    if (!sourceKey) {
      finishFilePerf({ skipped: "missing-key" });
      continue;
    }

    if (!isSupportedImportFileName(sourceName)) {
      hasAnyUnsupportedFiles = true;
      unsupportedCount += 1;
      finishFilePerf({ skipped: "unsupported" });
      continue;
    }

    pendingImportFiles.push({
      finishFilePerf,
      kind: source.kind,
      lastModified,
      loadFile: source.kind === "path" ? source.loadFile : undefined,
      relativePath,
      resource: source.resource ?? null,
      sourceFile,
      sourceName,
      sourceSize,
      sourceKey,
    });
  }

  return {
    hasAnyUnsupportedFiles,
    pendingImportFiles,
    unsupportedCount,
  };
};
