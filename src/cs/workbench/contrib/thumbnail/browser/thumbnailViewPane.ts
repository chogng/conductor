export type ThumbnailSelectionEvent = {
  fileId: string;
};

export type ThumbnailVisibleFilesEvent = {
  fileIds: string[];
};

export const createThumbnailSelectionEvent = (
  fileId: unknown,
): ThumbnailSelectionEvent | null => {
  const normalizedFileId = String(fileId ?? "").trim();
  return normalizedFileId ? { fileId: normalizedFileId } : null;
};

export const createThumbnailVisibleFilesEvent = (
  fileIds: readonly unknown[],
): ThumbnailVisibleFilesEvent => ({
  fileIds: fileIds
    .map((fileId) => String(fileId ?? "").trim())
    .filter(Boolean),
});
