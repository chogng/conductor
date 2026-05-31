export type PreviewSelectionEvent = {
  fileId: string;
};

export type PreviewVisibleFilesEvent = {
  fileIds: string[];
};

export const createPreviewSelectionEvent = (
  fileId: unknown,
): PreviewSelectionEvent | null => {
  const normalizedFileId = String(fileId ?? "").trim();
  return normalizedFileId ? { fileId: normalizedFileId } : null;
};

export const createPreviewVisibleFilesEvent = (
  fileIds: readonly unknown[],
): PreviewVisibleFilesEvent => ({
  fileIds: fileIds
    .map((fileId) => String(fileId ?? "").trim())
    .filter(Boolean),
});
