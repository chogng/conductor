/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

const toSafeInt = (value, fallback = 0) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : fallback;
};

export const sanitizePreviewRows = (rows) => {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => (Array.isArray(row) ? row : []));
};

export const isPreviewRowsResultForRequest = ({
  requestFileId,
  requestStartRow,
  payloadFileId,
  payloadStartRow,
}) => {
  const expectedFileId =
    typeof requestFileId === "string" ? requestFileId : String(requestFileId || "");
  const actualFileId =
    typeof payloadFileId === "string" ? payloadFileId : String(payloadFileId || "");
  const expectedStart = Math.max(0, toSafeInt(requestStartRow, 0));
  const actualStart = Math.max(0, toSafeInt(payloadStartRow, 0));
  return expectedFileId === actualFileId && expectedStart === actualStart;
};

export const hasChunkRowsInCache = (rowCache, chunkStart, chunkEnd) => {
  if (!rowCache || typeof rowCache.has !== "function") return false;
  const start = Math.max(0, toSafeInt(chunkStart, 0));
  const end = Math.max(start, toSafeInt(chunkEnd, start));
  for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
    if (!rowCache.has(rowIndex)) return false;
  }
  return true;
};

export const clearChunkRows = (rowCache, chunkStart, chunkEnd) => {
  if (!rowCache || typeof rowCache.delete !== "function") return;
  const start = Math.max(0, toSafeInt(chunkStart, 0));
  const end = Math.max(start, toSafeInt(chunkEnd, start));
  for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
    rowCache.delete(rowIndex);
  }
};

export const collectMissingChunkRanges = ({
  rowCache,
  pendingChunks,
  startRow,
  endRow,
  chunkSize,
  maxRangeRows,
}) => {
  const safeChunkSize = Math.max(1, toSafeInt(chunkSize, 1));
  const start = Math.max(0, toSafeInt(startRow, 0));
  const end = Math.max(start, toSafeInt(endRow, start));
  const safeMaxRangeRows = Number.isFinite(Number(maxRangeRows))
    ? Math.max(safeChunkSize, toSafeInt(maxRangeRows, safeChunkSize))
    : Number.POSITIVE_INFINITY;
  const pendingSet =
    pendingChunks && typeof pendingChunks.has === "function"
      ? pendingChunks
      : { has: () => false };

  const ranges = [];
  let currentRange = null;

  const flushRange = () => {
    if (!currentRange || !currentRange.chunkStarts.length) return;
    ranges.push(currentRange);
    currentRange = null;
  };

  const firstChunkStart = Math.floor(start / safeChunkSize) * safeChunkSize;
  const lastChunkStart =
    end > start
      ? Math.floor((end - 1) / safeChunkSize) * safeChunkSize
      : firstChunkStart;

  for (
    let chunkStart = firstChunkStart;
    chunkStart <= lastChunkStart;
    chunkStart += safeChunkSize
  ) {
    const chunkEnd = Math.min(end, chunkStart + safeChunkSize);
    const isLoaded = hasChunkRowsInCache(rowCache, chunkStart, chunkEnd);
    const isPending = pendingSet.has(chunkStart);
    if (isLoaded || isPending) {
      flushRange();
      continue;
    }

    if (!currentRange) {
      currentRange = {
        rangeStart: chunkStart,
        rangeEnd: chunkEnd,
        chunkStarts: [chunkStart],
      };
      continue;
    }

    const nextRangeEnd = Math.max(currentRange.rangeEnd, chunkEnd);
    const nextRangeSize = Math.max(0, nextRangeEnd - currentRange.rangeStart);
    if (nextRangeSize > safeMaxRangeRows) {
      flushRange();
      currentRange = {
        rangeStart: chunkStart,
        rangeEnd: chunkEnd,
        chunkStarts: [chunkStart],
      };
      continue;
    }

    currentRange.rangeEnd = nextRangeEnd;
    currentRange.chunkStarts.push(chunkStart);
  }

  flushRange();
  return ranges;
};

export const mergeChunkRows = ({
  rowCache,
  loadedChunks,
  chunkStart,
  chunkEnd,
  rows,
  chunkSize,
  maxChunks,
}) => {
  if (!rowCache || typeof rowCache.set !== "function") return false;
  if (
    !loadedChunks ||
    typeof loadedChunks.delete !== "function" ||
    typeof loadedChunks.add !== "function" ||
    typeof loadedChunks.values !== "function"
  ) {
    return false;
  }

  const start = Math.max(0, toSafeInt(chunkStart, 0));
  const end = Math.max(start, toSafeInt(chunkEnd, start));
  const safeChunkSize = Math.max(1, toSafeInt(chunkSize, 1));
  const safeMaxChunks = Math.max(1, toSafeInt(maxChunks, 1));
  const safeRows = sanitizePreviewRows(rows);
  const expectedRows = Math.max(0, end - start);

  if (safeRows.length !== expectedRows) {
    clearChunkRows(rowCache, start, end);
    loadedChunks.delete(start);
    return false;
  }

  for (let index = 0; index < safeRows.length; index += 1) {
    rowCache.set(start + index, safeRows[index]);
  }

  loadedChunks.delete(start);
  loadedChunks.add(start);

  while (loadedChunks.size > safeMaxChunks) {
    const evictChunkStart = loadedChunks.values().next().value;
    if (!Number.isFinite(evictChunkStart)) break;
    loadedChunks.delete(evictChunkStart);
    clearChunkRows(rowCache, evictChunkStart, evictChunkStart + safeChunkSize);
  }

  return true;
};

export const mergeChunkRangeRows = ({
  rowCache,
  loadedChunks,
  rangeStart,
  rangeEnd,
  rows,
  chunkSize,
  maxChunks,
}) => {
  const safeChunkSize = Math.max(1, toSafeInt(chunkSize, 1));
  const start = Math.max(0, toSafeInt(rangeStart, 0));
  const end = Math.max(start, toSafeInt(rangeEnd, start));
  const safeRows = sanitizePreviewRows(rows);
  const expectedRows = Math.max(0, end - start);

  if (safeRows.length !== expectedRows) {
    return {
      complete: false,
      mergedChunkStarts: [],
    };
  }

  const mergedChunkStarts = [];
  for (let chunkStart = start; chunkStart < end; chunkStart += safeChunkSize) {
    const chunkEnd = Math.min(end, chunkStart + safeChunkSize);
    const sliceStart = Math.max(0, chunkStart - start);
    const sliceEnd = Math.max(sliceStart, chunkEnd - start);
    const merged = mergeChunkRows({
      rowCache,
      loadedChunks,
      chunkStart,
      chunkEnd,
      rows: safeRows.slice(sliceStart, sliceEnd),
      chunkSize: safeChunkSize,
      maxChunks,
    });
    if (!merged) {
      return {
        complete: false,
        mergedChunkStarts,
      };
    }
    mergedChunkStarts.push(chunkStart);
  }

  return {
    complete: true,
    mergedChunkStarts,
  };
};
