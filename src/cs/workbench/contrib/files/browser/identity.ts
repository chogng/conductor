import { stableItemKey } from "src/utils/stableKey";

export const buildFileIdentityKey = (
  file: File | null | undefined,
  relativePath?: string | null,
): string => {
  if (!file) return "";
  const path = relativePath?.trim();
  return `${path || file.name}::${file.size}::${file.lastModified}`;
};

export const buildUnknownFileIdentityKey = (
  fileLike: unknown,
  relativePath?: unknown,
): string => {
  if (!fileLike || typeof fileLike !== "object") return "";
  if (
    !("name" in fileLike) ||
    !("size" in fileLike) ||
    !("lastModified" in fileLike)
  ) {
    return "";
  }
  const path = typeof relativePath === "string" ? relativePath.trim() : "";
  const name = path || String(fileLike.name ?? "");
  return `${name}::${String(fileLike.size ?? "")}::${String(
    fileLike.lastModified ?? "",
  )}`;
};

export const buildItemKey = (
  file: File | null | undefined,
  relativePath?: string | null,
): string => {
  const raw = buildFileIdentityKey(file, relativePath);
  if (!raw) return "";
  return stableItemKey("csv", raw);
};

export const buildEntrySourceKey = (entryLike: unknown): string => {
  if (!entryLike || typeof entryLike !== "object") return "";
  const entry = entryLike as {
    file?: unknown;
    relativePath?: unknown;
    sourceKey?: unknown;
  };
  if (typeof entry.sourceKey === "string" && entry.sourceKey) return entry.sourceKey;
  return buildUnknownFileIdentityKey(entry.file, entry.relativePath);
};

export const createFileId = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `file_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
};

export const filterUniqueFiles = (
  existingEntries: Array<{
    file?: unknown;
    relativePath?: unknown;
    sourceKey?: unknown;
  }>,
  newFiles: Array<{ file: File; relativePath?: string | null }>,
): Array<{ file: File; relativePath?: string | null }> => {
  const seenKeys = new Set(
    existingEntries.map((entry) => buildEntrySourceKey(entry)).filter(Boolean),
  );

  const uniqueFiles: Array<{ file: File; relativePath?: string | null }> = [];
  for (const newFile of newFiles) {
    const key = buildFileIdentityKey(newFile.file, newFile.relativePath);
    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);
    uniqueFiles.push(newFile);
  }

  return uniqueFiles;
};
