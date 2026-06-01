import { isSupportedDataImportFileName } from "src/cs/workbench/contrib/import/common/constants";
import type { ImportSourceFile } from "src/cs/workbench/contrib/import/browser/importSourceFile";

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
};

type FileSystemFileEntryLike = FileSystemEntryLike & {
  isFile: true;
  file: (successCallback: (file: File) => void) => void;
};

type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
  isDirectory: true;
  createReader: () => {
    readEntries: (successCallback: (entries: FileSystemEntryLike[]) => void) => void;
  };
};

type DataTransferItemWithWebkit = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntryLike | null;
};

const readEntryFile = (entry: FileSystemFileEntryLike): Promise<File> =>
  new Promise<File>((resolve) => entry.file(resolve));

const readAllDirectoryEntries = async (
  entry: FileSystemDirectoryEntryLike,
): Promise<FileSystemEntryLike[]> => {
  const reader = entry.createReader();
  const collected: FileSystemEntryLike[] = [];

  while (true) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve) => {
      reader.readEntries(resolve);
    });
    if (!batch.length) break;
    collected.push(...batch);
  }

  return collected;
};

const traverseImportEntry = async (
  entry: FileSystemEntryLike | null | undefined,
  importFiles: ImportSourceFile[],
  parentPath = "",
): Promise<void> => {
  if (!entry) return;

  const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;

  if (entry.isFile) {
    if (!isSupportedDataImportFileName(entry.name)) return;
    const file = await readEntryFile(entry as FileSystemFileEntryLike);
    importFiles.push({ file, relativePath });
    return;
  }

  if (!entry.isDirectory) return;

  const entries = await readAllDirectoryEntries(
    entry as FileSystemDirectoryEntryLike,
  );
  for (const child of entries) {
    await traverseImportEntry(child, importFiles, relativePath);
  }
};

export const collectDroppedImportFiles = async (
  dataTransfer: DataTransfer,
): Promise<ImportSourceFile[]> => {
  const items = Array.from(dataTransfer.items) as DataTransferItemWithWebkit[];
  const importFiles: ImportSourceFile[] = [];

  const pendingTraversals = items.map(async (item) => {
    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
    if (entry) {
      await traverseImportEntry(entry, importFiles);
      return;
    }

    const file = item.getAsFile();
    if (file && isSupportedDataImportFileName(file.name)) {
      importFiles.push({ file, relativePath: null });
    }
  });

  await Promise.all(pendingTraversals);
  return importFiles;
};
