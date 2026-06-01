import { isSupportedDataFileName } from "src/cs/workbench/contrib/files/common/files";
import { stableItemKey } from "src/utils/stableKey";

export type FileSource = {
  readonly file: File;
  readonly relativePath?: string | null;
};

export const buildFileIdentityKey = (
  file: File | null | undefined,
  relativePath?: string | null,
): string => {
  if (!file) {
    return "";
  }

  const path = relativePath?.trim();
  return `${path || file.name}::${file.size}::${file.lastModified}`;
};

export const buildItemKey = (
  file: File | null | undefined,
  relativePath?: string | null,
): string => {
  const raw = buildFileIdentityKey(file, relativePath);
  if (!raw) {
    return "";
  }

  return stableItemKey("csv", raw);
};

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

const getFileRelativePath = (file: File): string | null => {
  // Keep directory imports stable by carrying the browser-provided relative path
  // through the whole import pipeline.
  const path = file.webkitRelativePath?.trim();
  return path || null;
};

const createFileSource = (file: File): FileSource => ({
  file,
  relativePath: getFileRelativePath(file),
});

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

export const collectInputFiles = (fileList: FileList | null): FileSource[] =>
  Array.from(fileList ?? [])
    .map(createFileSource)
    .filter((source) =>
      Boolean(source.relativePath && isSupportedDataFileName(source.file.name)),
    );

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
