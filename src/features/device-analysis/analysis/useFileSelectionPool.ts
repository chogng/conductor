import { useCallback, useEffect, useMemo, useState } from "react";

const normalizeFileIds = (fileIds: unknown[]): string[] =>
  (Array.isArray(fileIds) ? fileIds : [])
    .map((item) => String(item ?? "").trim())
    .filter((item, index, arr) => Boolean(item) && arr.indexOf(item) === index);

type UseFileSelectionPoolOptions = {
  availableFileIds: unknown[];
  defaultSelectedFileIds?: unknown[];
  fallbackFileId?: unknown;
};

export const useFileSelectionPool = ({
  availableFileIds,
  defaultSelectedFileIds = [],
  fallbackFileId = "",
}: UseFileSelectionPoolOptions) => {
  const availableIds = useMemo(() => normalizeFileIds(availableFileIds), [availableFileIds]);
  const defaultIds = useMemo(() => normalizeFileIds(defaultSelectedFileIds), [defaultSelectedFileIds]);
  const fallbackId = String(fallbackFileId ?? "").trim();

  const [selectedFileIds, setSelectedFileIds] = useState<string[]>(() => {
    const availableSet = new Set(availableIds);
    const initial = defaultIds.filter((item) => availableSet.has(item));
    if (initial.length) return initial;
    if (fallbackId && availableSet.has(fallbackId)) return [fallbackId];
    return availableIds[0] ? [availableIds[0]] : [];
  });

  useEffect(() => {
    setSelectedFileIds((prev) => {
      if (!availableIds.length) return prev.length ? [] : prev;

      const availableSet = new Set(availableIds);
      const filtered = normalizeFileIds(prev).filter((item) => availableSet.has(item));
      if (filtered.length) {
        const unchanged =
          filtered.length === prev.length &&
          filtered.every((value, index) => value === prev[index]);
        return unchanged ? prev : filtered;
      }

      const defaultSelection = defaultIds.filter((item) => availableSet.has(item));
      const next = defaultSelection.length
        ? defaultSelection
        : fallbackId && availableSet.has(fallbackId)
          ? [fallbackId]
          : [availableIds[0]];
      const unchanged =
        next.length === prev.length && next.every((value, index) => value === prev[index]);
      return unchanged ? prev : next;
    });
  }, [availableIds, defaultIds, fallbackId]);

  const selectedFileIdSet = useMemo(() => new Set(selectedFileIds), [selectedFileIds]);

  const toggleFileSelection = useCallback((fileIdRaw: unknown) => {
    const fileId = String(fileIdRaw ?? "").trim();
    if (!fileId) return;

    setSelectedFileIds((prev) => {
      const current = normalizeFileIds(prev);
      if (current.includes(fileId)) {
        return current.filter((item) => item !== fileId);
      }
      return [...current, fileId];
    });
  }, []);

  const replaceFileSelection = useCallback((fileIds: unknown[]) => {
    setSelectedFileIds(normalizeFileIds(fileIds));
  }, []);

  const selectAllFiles = useCallback(() => {
    setSelectedFileIds(availableIds);
  }, [availableIds]);

  const clearFileSelection = useCallback(() => {
    setSelectedFileIds([]);
  }, []);

  return {
    clearFileSelection,
    replaceFileSelection,
    selectAllFiles,
    selectedFileIds,
    selectedFileIdSet,
    toggleFileSelection,
  };
};
