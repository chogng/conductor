import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const normalizeFileIds = (fileIds: unknown[]): string[] =>
  (Array.isArray(fileIds) ? fileIds : [])
    .map((item) => String(item ?? "").trim())
    .filter((item, index, arr) => Boolean(item) && arr.indexOf(item) === index);

type UseFileSelectionPoolOptions = {
  availableFileIds: unknown[];
  initialSelectedFileIds?: unknown[];
};

export const useFileSelectionPool = ({
  availableFileIds,
  initialSelectedFileIds = [],
}: UseFileSelectionPoolOptions) => {
  const availableIds = useMemo(() => normalizeFileIds(availableFileIds), [availableFileIds]);
  const initialIds = useMemo(() => normalizeFileIds(initialSelectedFileIds), [initialSelectedFileIds]);
  const didApplyInitialSelectionRef = useRef(false);

  const [selectedFileIds, setSelectedFileIds] = useState<string[]>(() => {
    const availableSet = new Set(availableIds);
    const initial = initialIds.filter((item) => availableSet.has(item));
    if (initial.length) return initial;
    return [];
  });

  useEffect(() => {
    setSelectedFileIds((prev) => {
      if (!availableIds.length) return prev.length ? [] : prev;

      const availableSet = new Set(availableIds);
      const filtered = normalizeFileIds(prev).filter((item) => availableSet.has(item));
      const initial = initialIds.filter((item) => availableSet.has(item));
      const next = filtered.length || didApplyInitialSelectionRef.current ? filtered : initial;
      if (initial.length) didApplyInitialSelectionRef.current = true;
      const unchanged =
        next.length === prev.length && next.every((value, index) => value === prev[index]);
      return unchanged ? prev : next;
    });
  }, [availableIds, initialIds]);

  const selectedFileIdSet = useMemo(() => new Set(selectedFileIds), [selectedFileIds]);

  const toggleFileSelection = useCallback((fileIdRaw: unknown) => {
    const fileId = String(fileIdRaw ?? "").trim();
    if (!fileId) return;

    didApplyInitialSelectionRef.current = true;
    setSelectedFileIds((prev) => {
      const current = normalizeFileIds(prev);
      if (current.includes(fileId)) {
        return current.filter((item) => item !== fileId);
      }
      return [...current, fileId];
    });
  }, []);

  const replaceFileSelection = useCallback((fileIds: unknown[]) => {
    didApplyInitialSelectionRef.current = true;
    setSelectedFileIds(normalizeFileIds(fileIds));
  }, []);

  const selectAllFiles = useCallback(() => {
    didApplyInitialSelectionRef.current = true;
    setSelectedFileIds(availableIds);
  }, [availableIds]);

  const clearFileSelection = useCallback(() => {
    didApplyInitialSelectionRef.current = true;
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
