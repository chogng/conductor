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
export type FolderFileReadFailure = {
  readonly fileName: string;
  readonly message: string;
  readonly relativePath: string;
};

export type FolderFileCollection = {
  readonly files: FileSource[];
  readonly readFailures: FolderFileReadFailure[];
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
  const root = URI.revive(folder);
  const rootName = getPathBaseName(root.path) || "Folder";
  const files: FileSource[] = [];
  const readFailures: FolderFileReadFailure[] = [];

  await collectFolderFilesAt(root, rootName, files, readFailures, 0, filesService);
  return { files, readFailures };
}

async function collectFolderFilesAt(
  folder: URI,
  relativeFolderPath: string,
  files: FileSource[],
  readFailures: FolderFileReadFailure[],
  depth: number,
  filesService: IFileService,
): Promise<void> {
  if (depth > MAX_FOLDER_WALK_DEPTH) {
    return;
  }

  const entries = await filesService.readDir(folder);
  const fileTasks: FolderFileStatTask[] = [];

  for (const [name, type] of entries) {
    const child = joinResourcePath(folder, name);
    const relativePath = `${relativeFolderPath}/${name}`;

    if ((type & FileType.Directory) === FileType.Directory) {
      await collectFolderFilesAt(child, relativePath, files, readFailures, depth + 1, filesService);
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
    await statFolderFileTasks(fileTasks, files, readFailures, filesService);
  }
}

async function statFolderFileTasks(
  tasks: readonly FolderFileStatTask[],
  files: FileSource[],
  readFailures: FolderFileReadFailure[],
  filesService: IFileService,
): Promise<void> {
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
