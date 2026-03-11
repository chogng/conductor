import test from "node:test";
import assert from "node:assert/strict";
import {
  collectMissingChunkRanges,
  clearChunkRows,
  hasChunkRowsInCache,
  isPreviewRowsResultForRequest,
  mergeChunkRangeRows,
  mergeChunkRows,
  sanitizePreviewRows,
} from "./previewRowChunk.js";

test("sanitizePreviewRows normalizes non-array rows", () => {
  const rows = sanitizePreviewRows([["a"], null, 1, ["b", "c"]]);
  assert.deepEqual(rows, [["a"], [], [], ["b", "c"]]);
});

test("isPreviewRowsResultForRequest rejects cross-file and mismatched start row", () => {
  assert.equal(
    isPreviewRowsResultForRequest({
      requestFileId: "file_A",
      requestStartRow: 0,
      payloadFileId: "file_B",
      payloadStartRow: 0,
    }),
    false,
  );

  assert.equal(
    isPreviewRowsResultForRequest({
      requestFileId: "file_A",
      requestStartRow: 50,
      payloadFileId: "file_A",
      payloadStartRow: 0,
    }),
    false,
  );

  assert.equal(
    isPreviewRowsResultForRequest({
      requestFileId: "file_A",
      requestStartRow: 50,
      payloadFileId: "file_A",
      payloadStartRow: 50,
    }),
    true,
  );
});

test("mergeChunkRows does not mark chunk loaded when payload is short", () => {
  const rowCache = new Map();
  const loadedChunks = new Set([0]);
  rowCache.set(50, ["stale"]);
  rowCache.set(51, ["stale"]);

  const merged = mergeChunkRows({
    rowCache,
    loadedChunks,
    chunkStart: 50,
    chunkEnd: 53,
    rows: [["new_0"], ["new_1"]],
    chunkSize: 50,
    maxChunks: 8,
  });

  assert.equal(merged, false);
  assert.equal(loadedChunks.has(50), false);
  assert.equal(rowCache.has(50), false);
  assert.equal(rowCache.has(51), false);
  assert.equal(rowCache.has(52), false);
});

test("mergeChunkRows stores complete chunk and evicts oldest chunk rows by LRU", () => {
  const rowCache = new Map();
  const loadedChunks = new Set([0, 50]);
  rowCache.set(0, ["old_0"]);
  rowCache.set(1, ["old_1"]);
  rowCache.set(50, ["mid_0"]);
  rowCache.set(51, ["mid_1"]);

  const merged = mergeChunkRows({
    rowCache,
    loadedChunks,
    chunkStart: 100,
    chunkEnd: 102,
    rows: [["new_0"], ["new_1"]],
    chunkSize: 50,
    maxChunks: 2,
  });

  assert.equal(merged, true);
  assert.deepEqual(rowCache.get(100), ["new_0"]);
  assert.deepEqual(rowCache.get(101), ["new_1"]);
  assert.equal(loadedChunks.has(100), true);

  // Chunk 0 should be evicted as the oldest entry.
  assert.equal(loadedChunks.has(0), false);
  assert.equal(rowCache.has(0), false);
  assert.equal(rowCache.has(1), false);
});

test("collectMissingChunkRanges merges contiguous gaps and skips cached or pending chunks", () => {
  const rowCache = new Map();
  const pendingChunks = new Set([100]);

  for (let rowIndex = 50; rowIndex < 100; rowIndex += 1) {
    rowCache.set(rowIndex, [`cached_${rowIndex}`]);
  }

  const ranges = collectMissingChunkRanges({
    rowCache,
    pendingChunks,
    startRow: 0,
    endRow: 151,
    chunkSize: 50,
    maxRangeRows: 200,
  });

  assert.deepEqual(ranges, [
    {
      rangeStart: 0,
      rangeEnd: 50,
      chunkStarts: [0],
    },
    {
      rangeStart: 150,
      rangeEnd: 151,
      chunkStarts: [150],
    },
  ]);
});

test("collectMissingChunkRanges splits oversized missing ranges", () => {
  const ranges = collectMissingChunkRanges({
    rowCache: new Map(),
    pendingChunks: new Set(),
    startRow: 0,
    endRow: 260,
    chunkSize: 50,
    maxRangeRows: 100,
  });

  assert.deepEqual(ranges, [
    {
      rangeStart: 0,
      rangeEnd: 100,
      chunkStarts: [0, 50],
    },
    {
      rangeStart: 100,
      rangeEnd: 200,
      chunkStarts: [100, 150],
    },
    {
      rangeStart: 200,
      rangeEnd: 260,
      chunkStarts: [200, 250],
    },
  ]);
});

test("mergeChunkRangeRows seeds multiple chunks into cache and updates LRU", () => {
  const rowCache = new Map();
  const loadedChunks = new Set([0]);
  rowCache.set(0, ["old_0"]);
  rowCache.set(1, ["old_1"]);

  const merged = mergeChunkRangeRows({
    rowCache,
    loadedChunks,
    rangeStart: 50,
    rangeEnd: 154,
    rows: Array.from({ length: 104 }, (_, index) => [`row_${index}`]),
    chunkSize: 50,
    maxChunks: 3,
  });

  assert.deepEqual(merged, {
    complete: true,
    mergedChunkStarts: [50, 100, 150],
  });
  assert.deepEqual(rowCache.get(50), ["row_0"]);
  assert.deepEqual(rowCache.get(103), ["row_53"]);
  assert.deepEqual(rowCache.get(153), ["row_103"]);
  assert.equal(loadedChunks.has(0), false);
  assert.equal(loadedChunks.has(50), true);
  assert.equal(loadedChunks.has(100), true);
  assert.equal(loadedChunks.has(150), true);
});

test("hasChunkRowsInCache validates full row range presence", () => {
  const rowCache = new Map();
  rowCache.set(0, ["a"]);
  rowCache.set(1, ["b"]);
  assert.equal(hasChunkRowsInCache(rowCache, 0, 2), true);
  clearChunkRows(rowCache, 1, 2);
  assert.equal(hasChunkRowsInCache(rowCache, 0, 2), false);
});
