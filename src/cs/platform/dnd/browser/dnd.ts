import { isNative } from "src/cs/base/common/platform";

export type DataTransferFile = {
  readonly file: File;
  readonly relativePath?: string | null;
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

type ElectronWebUtils = {
  conductor?: {
    webUtils?: {
      getPathForFile(file: File): string;
    };
  };
};

export function getPathForFile(file: File): string | undefined {
  if (
    isNative &&
    typeof (globalThis as ElectronWebUtils).conductor?.webUtils?.getPathForFile === "function"
  ) {
    return (globalThis as ElectronWebUtils).conductor?.webUtils?.getPathForFile(file);
  }

  return undefined;
}

export function containsDragType(event: DragEvent, ...dragTypesToFind: string[]): boolean {
  if (!event.dataTransfer) {
    return false;
  }

  const lowercaseDragTypes = Array.from(
    event.dataTransfer.types,
    (dragType) => dragType.toLowerCase(),
  );

  for (const dragType of dragTypesToFind) {
    if (lowercaseDragTypes.includes(dragType.toLowerCase())) {
      return true;
    }
  }

  return false;
}

const getFileKey = (file: File, relativePath?: string | null): string =>
  `${relativePath || file.name}::${file.size}::${file.lastModified}`;

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

const collectEntryFiles = async (
  entry: FileSystemEntryLike | null | undefined,
  files: DataTransferFile[],
  parentPath = "",
): Promise<void> => {
  if (!entry) {
    return;
  }

  const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;

  if (entry.isFile) {
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
    await collectEntryFiles(child, files, relativePath);
  }
};

export const collectDataTransferFiles = async (
  dataTransfer: DataTransfer,
): Promise<DataTransferFile[]> => {
  const items = Array.from(dataTransfer.items) as DataTransferItemWithWebkit[];
  const files: DataTransferFile[] = [];

  const pendingTraversals = items.map(async (item) => {
    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
    if (!entry) {
      return;
    }

    await collectEntryFiles(entry, files);
  });

  await Promise.all(pendingTraversals);

  const seenFiles = new Set(files.map(({ file, relativePath }) => getFileKey(file, relativePath)));
  for (const file of Array.from(dataTransfer.files)) {
    const relativePath = file.name;
    const key = getFileKey(file, relativePath);
    if (!seenFiles.has(key)) {
      seenFiles.add(key);
      files.push({ file, relativePath });
    }
  }

  return files;
};
