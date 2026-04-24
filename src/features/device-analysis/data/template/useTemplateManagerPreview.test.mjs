import test from "node:test";
import assert from "node:assert/strict";
import { resolvePreviewRenderColumnCount } from "./previewRenderColumns.ts";

test("resolvePreviewRenderColumnCount keeps placeholder columns for sparse files", () => {
  assert.equal(
    resolvePreviewRenderColumnCount({
      dataColumnCount: 2,
      minColumnWidthPx: 120,
      previewViewportWidth: 760,
      rowIndexWidthPx: 48,
    }),
    6,
  );
});

test("resolvePreviewRenderColumnCount never hides real data columns", () => {
  assert.equal(
    resolvePreviewRenderColumnCount({
      dataColumnCount: 12,
      minColumnWidthPx: 120,
      previewViewportWidth: 360,
      rowIndexWidthPx: 48,
    }),
    12,
  );
});
