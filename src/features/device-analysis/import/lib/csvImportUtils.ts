import { stableItemKey } from "../../../../utils/stableKey";

export const buildFileKeyRaw = (file: File | null | undefined): string =>
  file ? `${file.name}::${file.size}` : "";

export const buildUnknownFileKey = (fileLike: unknown): string => {
  if (!fileLike || typeof fileLike !== "object") return "";
  if (!("name" in fileLike) || !("size" in fileLike)) return "";
  return `${String(fileLike.name ?? "")}::${String(fileLike.size ?? "")}`;
};

export const buildItemKey = (file: File | null | undefined): string => {
  const raw = buildFileKeyRaw(file);
  if (!raw) return "";
  return stableItemKey("csv", raw);
};

export const toDomIdToken = (value: unknown): string =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 120);

export const createCsvImporterFileId = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `file_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
};

export const filterUniqueCsvFiles = (
  existingEntries: Array<{ file?: unknown }>,
  newFiles: File[],
): File[] => {
  const seenKeys = new Set(
    existingEntries.map((entry) => buildUnknownFileKey(entry?.file)).filter(Boolean),
  );

  const uniqueFiles: File[] = [];
  for (const newFile of newFiles) {
    const key = buildFileKeyRaw(newFile);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    uniqueFiles.push(newFile);
  }

  return uniqueFiles;
};
