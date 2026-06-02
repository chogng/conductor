import { URI } from "src/cs/base/common/uri";
import { collectDataTransferFiles } from "src/cs/platform/dnd/browser/dnd";
import {
  FileType,
  type IFileContent,
  type IFileService,
} from "src/cs/platform/files/common/files";
import {
  isExcelDataFileName,
  isSupportedDataFileName,
  type FileSource,
} from "src/cs/workbench/contrib/files/common/files";

export {
  buildFileIdentityKey,
  buildItemKey,
  type FileSource,
} from "src/cs/workbench/contrib/files/common/files";

const MAX_FOLDER_WALK_DEPTH = 32;
const WINDOWS_DRIVE_PREFIX = /^[a-zA-Z]:[\\/]/;

function joinFsPath(parent: string, name: string): string {
  const separator = parent.includes("\\") || WINDOWS_DRIVE_PREFIX.test(parent) ? "\\" : "/";
  const trimmedParent = parent.replace(/[\\/]+$/, "");
  return `${trimmedParent}${separator}${name}`;
}

function getPathBaseName(path: string): string {
  const normalized = path.trim().replace(/[\\/]+$/, "");
  const separatorIndex = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\"),
  );

  return separatorIndex >= 0 ? normalized.slice(separatorIndex + 1) : normalized;
}

function getFileMimeType(fileName: string): string {
  if (isExcelDataFileName(fileName)) {
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

export const collectDroppedFiles = async (
  dataTransfer: DataTransfer,
): Promise<FileSource[]> => collectDataTransferFiles(dataTransfer);

export async function collectFolderFiles(
  folderPath: string,
  filesService: IFileService,
): Promise<FileSource[]> {
  const rootName = getPathBaseName(folderPath) || "Folder";
  const root = URI.file(folderPath);
  const files: FileSource[] = [];

  await collectFolderFilesAt(root, rootName, files, 0, filesService);
  return files;
}

async function collectFolderFilesAt(
  folder: URI,
  relativeFolderPath: string,
  files: FileSource[],
  depth: number,
  filesService: IFileService,
): Promise<void> {
  if (depth > MAX_FOLDER_WALK_DEPTH) {
    return;
  }

  const entries = await filesService.readDir(folder);
  for (const [name, type] of entries) {
    const child = URI.file(joinFsPath(folder.fsPath, name));
    const relativePath = `${relativeFolderPath}/${name}`;

    if ((type & FileType.Directory) === FileType.Directory) {
      await collectFolderFilesAt(child, relativePath, files, depth + 1, filesService);
      continue;
    }

    if ((type & FileType.File) !== FileType.File || !isSupportedDataFileName(name)) {
      continue;
    }

    files.push({
      file: await readFileSource(child, name, filesService),
      relativePath,
      resource: child,
    });
  }
}

async function readFileSource(
  resource: URI,
  name: string,
  filesService: IFileService,
): Promise<File> {
  const stat = await filesService.stat(resource);
  const content = await filesService.readFile(resource, {
    encoding: isExcelDataFileName(name) ? "base64" : "utf8",
  });

  return new File([toFilePart(content)], name, {
    lastModified: Number.isFinite(stat.mtime) ? stat.mtime : Date.now(),
    type: getFileMimeType(name),
  });
}
