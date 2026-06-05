import { URI } from "src/cs/base/common/uri";
import {
  FileType,
  type IFileContent,
  type IFileStat,
  type IFileService,
} from "src/cs/platform/files/common/files";
import {
  isExcelImportFileName,
  isSupportedImportFileName,
  type FileSource,
  type PathFileSource,
} from "src/cs/workbench/contrib/files/common/files";
import {
  FOLDER_IMPORT_STAT_CONCURRENCY,
} from "src/cs/workbench/contrib/files/browser/fileConstants";

export {
  buildFileIdentityKey,
  buildItemKey,
  type FileSource,
} from "src/cs/workbench/contrib/files/common/files";

const MAX_FOLDER_WALK_DEPTH = 32;
export type FolderImportFileSource = PathFileSource & {
  readonly loadFile: () => Promise<File>;
};

export type FolderFileReadFailure = {
  readonly fileName: string;
  readonly message: string;
  readonly relativePath: string;
};

export type FolderFileCollection = {
  readonly files: FolderImportFileSource[];
  readonly readFailures: FolderFileReadFailure[];
};

export type FolderFileCollectionBatch = {
  readonly files: FolderImportFileSource[];
};

type CollectFolderImportFilesOptions = {
  readonly onBatch?: (batch: FolderFileCollectionBatch) => Promise<void> | void;
  readonly shouldContinue?: () => boolean;
};

type FolderFileStatTask = {
  readonly name: string;
  readonly relativePath: string;
  readonly resource: URI;
};

function joinResourcePath(parent: URI, name: string): URI {
  return URI.joinPath(parent, name);
}

function getPathBaseName(path: string): string {
  const normalized = path.trim().replace(/[\\/]+$/, "");
  const separatorIndex = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\"),
  );

  return decodePathSegment(
    separatorIndex >= 0 ? normalized.slice(separatorIndex + 1) : normalized,
  );
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getFileMimeType(fileName: string): string {
  if (isExcelImportFileName(fileName)) {
    return "application/octet-stream";
  }

  return "text/csv;charset=utf-8";
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return buffer;
}

function toFilePart(content: IFileContent): string | ArrayBuffer {
  return content.encoding === "base64" ? decodeBase64(content.value) : content.value;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "The file could not be read.";
}

export async function collectFolderFiles(
  folder: URI,
  filesService: IFileService,
): Promise<FileSource[]> {
  return (await collectFolderImportFiles(folder, filesService)).files;
}

export async function collectFolderImportFiles(
  folder: URI,
  filesService: IFileService,
): Promise<FolderFileCollection> {
  return collectFolderImportFilesIncrementally(folder, filesService);
}

export async function collectFolderImportFilesIncrementally(
  folder: URI,
  filesService: IFileService,
  options: CollectFolderImportFilesOptions = {},
): Promise<FolderFileCollection> {
  const root = URI.revive(folder);
  const rootName = getPathBaseName(root.path) || "Folder";
  const files: FolderImportFileSource[] = [];
  const readFailures: FolderFileReadFailure[] = [];

  await collectFolderFilesAt(root, rootName, files, readFailures, 0, filesService, options);
  return { files, readFailures };
}

function shouldContinueCollecting(options: CollectFolderImportFilesOptions): boolean {
  return !options.shouldContinue || options.shouldContinue();
}

async function collectFolderFilesAt(
  folder: URI,
  relativeFolderPath: string,
  files: FolderImportFileSource[],
  readFailures: FolderFileReadFailure[],
  depth: number,
  filesService: IFileService,
  options: CollectFolderImportFilesOptions,
): Promise<void> {
  if (depth > MAX_FOLDER_WALK_DEPTH || !shouldContinueCollecting(options)) {
    return;
  }

  let entries: readonly [string, FileType][];
  try {
    entries = await filesService.readDir(folder);
  } catch (error) {
    readFailures.push({
      fileName: getPathBaseName(relativeFolderPath) || relativeFolderPath,
      message: getErrorMessage(error),
      relativePath: relativeFolderPath,
    });
    return;
  }

  const fileTasks: FolderFileStatTask[] = [];
  const folderTasks: Array<{
    readonly relativePath: string;
    readonly resource: URI;
  }> = [];

  for (const [name, type] of entries) {
    const child = joinResourcePath(folder, name);
    const relativePath = `${relativeFolderPath}/${name}`;

    if ((type & FileType.Directory) === FileType.Directory) {
      folderTasks.push({
        relativePath,
        resource: child,
      });
      continue;
    }

    if ((type & FileType.File) !== FileType.File || !isSupportedImportFileName(name)) {
      continue;
    }

    fileTasks.push({
      name,
      relativePath,
      resource: child,
    });
  }

  if (fileTasks.length > 0) {
    const sortedFileTasks = [...fileTasks].sort(compareFolderFileStatTasks);
    for (
      let startIndex = 0;
      startIndex < sortedFileTasks.length;
      startIndex += FOLDER_IMPORT_STAT_CONCURRENCY
    ) {
      if (!shouldContinueCollecting(options)) {
        return;
      }

      const batch = await statFolderFileTasks(
        sortedFileTasks.slice(startIndex, startIndex + FOLDER_IMPORT_STAT_CONCURRENCY),
        filesService,
      );
      files.push(...batch.files);
      readFailures.push(...batch.readFailures);
      if (batch.files.length > 0 && shouldContinueCollecting(options)) {
        await options.onBatch?.({ files: batch.files });
      }
    }
  }

  for (const task of folderTasks) {
    if (!shouldContinueCollecting(options)) {
      return;
    }

    await collectFolderFilesAt(
      task.resource,
      task.relativePath,
      files,
      readFailures,
      depth + 1,
      filesService,
      options,
    );
  }
}

function compareFolderFileStatTasks(
  first: FolderFileStatTask,
  second: FolderFileStatTask,
): number {
  const firstIsExcel = isExcelImportFileName(first.name);
  const secondIsExcel = isExcelImportFileName(second.name);
  if (firstIsExcel !== secondIsExcel) {
    return firstIsExcel ? 1 : -1;
  }

  return first.relativePath.localeCompare(second.relativePath, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

async function statFolderFileTasks(
  tasks: readonly FolderFileStatTask[],
  filesService: IFileService,
): Promise<FolderFileCollection> {
  const results: Array<
    | {
      readonly ok: true;
      readonly lastModified: number;
      readonly name: string;
      readonly relativePath: string;
      readonly resource: URI;
      readonly size: number;
    }
    | {
      readonly ok: false;
      readonly fileName: string;
      readonly message: string;
      readonly relativePath: string;
    }
    | undefined
  > = new Array(tasks.length);
  let nextTaskIndex = 0;
  const workerCount = Math.min(FOLDER_IMPORT_STAT_CONCURRENCY, tasks.length);
  const files: FolderImportFileSource[] = [];
  const readFailures: FolderFileReadFailure[] = [];

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextTaskIndex;
      nextTaskIndex += 1;
      const task = tasks[index];
      if (!task) {
        return;
      }

      const result = await tryStatFileSource(task.resource, filesService);
      results[index] = result.ok
        ? {
          lastModified: getFileLastModified(result.stat),
          name: task.name,
          ok: true,
          relativePath: task.relativePath,
          resource: task.resource,
          size: Number(result.stat.size) || 0,
        }
        : {
          fileName: task.name,
          message: result.message,
          ok: false,
          relativePath: task.relativePath,
        };
    }
  }));

  for (const result of results) {
    if (!result) {
      continue;
    }

    if (result.ok) {
      files.push({
        fileName: result.name,
        kind: "path",
        lastModified: result.lastModified,
        loadFile: () => readFileSource(result.resource, result.name, filesService),
        relativePath: result.relativePath,
        resource: result.resource,
        size: result.size,
      });
    } else {
      readFailures.push({
        fileName: result.fileName,
        message: result.message,
        relativePath: result.relativePath,
      });
    }
  }

  return { files, readFailures };
}

async function tryStatFileSource(
  resource: URI,
  filesService: IFileService,
): Promise<
  | { readonly ok: true; readonly stat: IFileStat }
  | { readonly ok: false; readonly message: string }
> {
  try {
    return {
      ok: true,
      stat: await filesService.stat(resource),
    };
  } catch (error) {
    return {
      message: getErrorMessage(error),
      ok: false,
    };
  }
}

function getFileLastModified(stat: IFileStat): number {
  return Number.isFinite(stat.mtime) ? stat.mtime : Date.now();
}

async function readFileSource(
  resource: URI,
  name: string,
  filesService: IFileService,
): Promise<File> {
  const stat = await filesService.stat(resource);
  const content = await filesService.readFile(resource, {
    encoding: isExcelImportFileName(name) ? "base64" : "utf8",
  });

  return new File([toFilePart(content)], name, {
    lastModified: Number.isFinite(stat.mtime) ? stat.mtime : Date.now(),
    type: getFileMimeType(name),
  });
}
