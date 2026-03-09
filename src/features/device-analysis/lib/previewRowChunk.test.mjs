import test from "node:test";
import assert from "node:assert/strict";
import {
  clearChunkRows,
  hasChunkRowsInCache,
  isPreviewRowsResultForRequest,
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

test("hasChunkRowsInCache validates full row range presence", () => {
  const rowCache = new Map();
  rowCache.set(0, ["a"]);
  rowCache.set(1, ["b"]);
  assert.equal(hasChunkRowsInCache(rowCache, 0, 2), true);
  clearChunkRows(rowCache, 1, 2);
  assert.equal(hasChunkRowsInCache(rowCache, 0, 2), false);
});
