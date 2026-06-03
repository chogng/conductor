import { isWindows } from "src/cs/base/common/platform";
import { URI } from "src/cs/base/common/uri";
import {
  collectDataTransferFiles,
  getPathForFile,
  type DataTransferFile,
} from "src/cs/platform/dnd/browser/dnd";
import type { FileSource } from "src/cs/workbench/contrib/files/common/files";

const isAbsoluteFilePath = (filePath: string): boolean => {
  if (isWindows) {
    return /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith("\\\\");
  }

  return filePath.startsWith("/");
};

export const createFileSource = (
  file: File,
  relativePath?: string | null,
  resource?: URI | null,
): FileSource => {
  const resourcePath = String(resource?.fsPath ?? "").trim();
  if (resource && resourcePath && isAbsoluteFilePath(resourcePath)) {
    return {
      file,
      kind: "path",
      relativePath,
      resource,
    };
  }

  const filePath = String(getPathForFile(file) ?? "").trim();
  if (filePath && isAbsoluteFilePath(filePath)) {
    return {
      file,
      kind: "path",
      relativePath,
      resource: URI.file(filePath),
    };
  }

  return {
    file,
    kind: "data",
    relativePath,
    resource: null,
  };
};

const createDroppedFileSource = ({
  file,
  relativePath,
}: DataTransferFile): FileSource => createFileSource(file, relativePath);

export const collectDroppedFiles = async (
  dataTransfer: DataTransfer,
): Promise<FileSource[]> =>
  (await collectDataTransferFiles(dataTransfer)).map(createDroppedFileSource);
