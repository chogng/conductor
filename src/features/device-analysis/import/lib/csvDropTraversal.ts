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

const traverseCsvEntry = async (
  entry: FileSystemEntryLike | null | undefined,
  csvFiles: File[],
): Promise<void> => {
  if (!entry) return;

  if (entry.isFile) {
    if (!entry.name.toLowerCase().endsWith(".csv")) return;
    const file = await readEntryFile(entry as FileSystemFileEntryLike);
    csvFiles.push(file);
    return;
  }

  if (!entry.isDirectory) return;

  const entries = await readAllDirectoryEntries(
    entry as FileSystemDirectoryEntryLike,
  );
  for (const child of entries) {
    await traverseCsvEntry(child, csvFiles);
  }
};

export const collectDroppedCsvFiles = async (
  dataTransfer: DataTransfer,
): Promise<File[]> => {
  const items = Array.from(dataTransfer.items) as DataTransferItemWithWebkit[];
  const csvFiles: File[] = [];

  const pendingTraversals = items.map(async (item) => {
    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
    if (entry) {
      await traverseCsvEntry(entry, csvFiles);
      return;
    }

    const file = item.getAsFile();
    if (file && file.name.toLowerCase().endsWith(".csv")) {
      csvFiles.push(file);
    }
  });

  await Promise.all(pendingTraversals);
  return csvFiles;
};
