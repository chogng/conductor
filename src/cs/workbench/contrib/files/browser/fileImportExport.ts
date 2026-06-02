import {
  isSupportedDataFileName,
  type FileSource,
} from "src/cs/workbench/contrib/files/common/files";

export {
  buildFileIdentityKey,
  buildItemKey,
  type FileSource,
} from "src/cs/workbench/contrib/files/common/files";

type FileSystemEntryLike = {
  isDirectory: boolean;
  isFile: boolean;
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
    if (!batch.length) {
      break;
    }
    collected.push(...batch);
  }

  return collected;
};

const traverseDroppedEntry = async (
  entry: FileSystemEntryLike | null | undefined,
  files: FileSource[],
  parentPath = "",
): Promise<void> => {
  if (!entry) {
    return;
  }

  const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;

  if (entry.isFile) {
    if (!isSupportedDataFileName(entry.name)) {
      return;
    }

    const file = await readEntryFile(entry as FileSystemFileEntryLike);
    files.push({ file, relativePath });
    return;
  }

  if (!entry.isDirectory) {
    return;
  }

  const entries = await readAllDirectoryEntries(
    entry as FileSystemDirectoryEntryLike,
  );
  for (const child of entries) {
    await traverseDroppedEntry(child, files, relativePath);
  }
};

export const collectDroppedFiles = async (
  dataTransfer: DataTransfer,
): Promise<FileSource[]> => {
  const items = Array.from(dataTransfer.items) as DataTransferItemWithWebkit[];
  const files: FileSource[] = [];

  const pendingTraversals = items.map(async (item) => {
    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
    if (entry?.isDirectory) {
      await traverseDroppedEntry(entry, files);
    }
  });

  await Promise.all(pendingTraversals);
  return files;
};
