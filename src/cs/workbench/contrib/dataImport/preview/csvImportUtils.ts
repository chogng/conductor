import { stableItemKey } from "src/utils/stableKey";

export const buildFileIdentityKey = (file: File | null | undefined): string =>
  file ? `${file.name}::${file.size}::${file.lastModified}` : "";

export const buildUnknownFileIdentityKey = (fileLike: unknown): string => {
  if (!fileLike || typeof fileLike !== "object") return "";
  if (!("name" in fileLike) || !("size" in fileLike) || !("lastModified" in fileLike)) {
    return "";
  }
  return `${String(fileLike.name ?? "")}::${String(fileLike.size ?? "")}::${String(fileLike.lastModified ?? "")}`;
};

export const buildItemKey = (file: File | null | undefined): string => {
  const raw = buildFileIdentityKey(file);
  if (!raw) return "";
  return stableItemKey("csv", raw);
};

export const buildEntrySourceKey = (entryLike: unknown): string => {
  if (!entryLike || typeof entryLike !== "object") return "";
  const entry = entryLike as { sourceKey?: unknown; file?: unknown };
  if (typeof entry.sourceKey === "string" && entry.sourceKey) return entry.sourceKey;
  return buildUnknownFileIdentityKey(entry.file);
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
  existingEntries: Array<{ file?: unknown; sourceKey?: unknown }>,
  newFiles: File[],
): File[] => {
  const seenKeys = new Set(
    existingEntries.map((entry) => buildEntrySourceKey(entry)).filter(Boolean),
  );

  const uniqueFiles: File[] = [];
  for (const newFile of newFiles) {
    const key = buildFileIdentityKey(newFile);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    uniqueFiles.push(newFile);
  }

  return uniqueFiles;
};
