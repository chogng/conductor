import test from "node:test";
import assert from "node:assert/strict";

import {
  createExportPaneState,
  getCanvasScopeSummary,
  getExportSelectionSummary,
} from "./exportModel.ts";

const t = (key, vars = {}) =>
  Object.keys(vars).length ? `${key}:${JSON.stringify(vars)}` : key;

test("createExportPaneState resolves export canvas selection mode", () => {
  assert.deepEqual(
    createExportPaneState({
      originCanvasExportScope: "selected",
      resultsTab: "export",
    }),
    {
      isExportListCanvasSelectionMode: true,
      isExportPaneActive: true,
      isManualCanvasScope: true,
      showFilteredCanvasKindSelect: false,
    },
  );

  assert.deepEqual(
    createExportPaneState({
      originCanvasExportScope: "filtered",
      resultsTab: "metrics",
    }),
    {
      isExportListCanvasSelectionMode: false,
      isExportPaneActive: false,
      isManualCanvasScope: false,
      showFilteredCanvasKindSelect: true,
    },
  );
});

test("getCanvasScopeSummary formats each canvas scope", () => {
  assert.equal(
    getCanvasScopeSummary({
      originCanvasExportScope: "current",
      originFilteredCanvasKind: "transfer",
      selectedCanvasCount: 1,
    }),
    "origin_canvas_scope_summary_current",
  );
  assert.equal(
    getCanvasScopeSummary({
      originCanvasExportScope: "filtered",
      originFilteredCanvasKind: "output",
      selectedCanvasCount: 3,
    }),
    'origin_canvas_scope_summary_filtered:{"count":3,"kind":"origin_filtered_canvas_kind_output"}',
  );
  assert.equal(
    getCanvasScopeSummary({
      originCanvasExportScope: "all",
      originFilteredCanvasKind: "transfer",
      selectedCanvasCount: 5,
    }),
    'origin_canvas_scope_summary_all:{"count":5}',
  );
  assert.equal(
    getCanvasScopeSummary({
      originCanvasExportScope: "selected",
      originFilteredCanvasKind: "transfer",
      selectedCanvasCount: 2,
    }),
    'origin_canvas_scope_summary_selected:{"count":2}',
  );
});

test("getExportSelectionSummary uses collection summary for merged export", () => {
  assert.equal(
    getExportSelectionSummary({
      resolvedOriginExportMode: "merged",
      selectedCanvasCount: 2,
      selectedOriginSeriesTotalCount: 7,
      separateCanvasScopeSummary: "separate",
    }),
    'origin_collection_summary:{"curves":7,"files":2}',
  );

  assert.equal(
    getExportSelectionSummary({
      resolvedOriginExportMode: "separate",
      selectedCanvasCount: 2,
      selectedOriginSeriesTotalCount: 7,
      separateCanvasScopeSummary: "separate",
    }),
    "separate",
  );
});
