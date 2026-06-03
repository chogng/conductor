import { URI } from "src/cs/base/common/uri";
import {
  FileType,
  type IFileContent,
  type IFileService,
} from "src/cs/platform/files/common/files";
import {
  isExcelImportFileName,
  isSupportedImportFileName,
  type FileSource,
} from "src/cs/workbench/contrib/files/common/files";

export {
  buildFileIdentityKey,
  buildItemKey,
  type FileSource,
} from "src/cs/workbench/contrib/files/common/files";

const MAX_FOLDER_WALK_DEPTH = 32;
const WINDOWS_DRIVE_PREFIX = /^[a-zA-Z]:[\\/]/;

export type FolderFileReadFailure = {
  readonly fileName: string;
  readonly message: string;
  readonly relativePath: string;
};

export type FolderFileCollection = {
  readonly files: FileSource[];
  readonly readFailures: FolderFileReadFailure[];
};

function joinFsPath(parent: string, name: string): string {
  const separator = parent.includes("\\") || WINDOWS_DRIVE_PREFIX.test(parent) ? "\\" : "/";
  const trimmedParent = parent.replace(/[\\/]+$/, "");
  return `${trimmedParent}${separator}${name}`;
}

function joinResourcePath(parent: URI, name: string): URI {
  if (WINDOWS_DRIVE_PREFIX.test(parent.fsPath)) {
    return URI.file(joinFsPath(parent.fsPath, name));
  }

  const trimmedPath = parent.path.replace(/\/+$/, "");
  const encodedName = encodeURIComponent(name);
  return URI.file(`${trimmedPath}/${encodedName}`);
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

    const result = await tryReadFileSource(child, name, filesService);
    if (result.ok) {
      files.push({
        file: result.file,
        kind: "path",
        relativePath,
        resource: child,
      });
    } else {
      readFailures.push({
        fileName: name,
        message: result.message,
        relativePath,
      });
    }
  }
}

async function tryReadFileSource(
  resource: URI,
  name: string,
  filesService: IFileService,
): Promise<
  | { readonly ok: true; readonly file: File }
  | { readonly ok: false; readonly message: string }
> {
  try {
    return {
      file: await readFileSource(resource, name, filesService),
      ok: true,
    };
  } catch (error) {
    return {
      message: getErrorMessage(error),
      ok: false,
    };
  }
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
