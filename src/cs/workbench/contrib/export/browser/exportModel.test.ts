import assert from "assert";

import type { FileRecord } from "src/cs/workbench/services/session/common/sessionModel";

import {
  createExportPaneState,
  createOriginCurveOptionsFromRecord,
  getCanvasScopeSummary,
  getExportSelectionSummary,
} from "./exportModel.ts";

suite("workbench/contrib/export/browser/exportModel", () => {
  const t = (key: string, vars: Record<string, unknown> = {}) =>
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

  test("createOriginCurveOptionsFromRecord uses canonical series order", () => {
    assert.deepEqual(
      createOriginCurveOptionsFromRecord(
        createFileRecord(),
        (_fileId, seriesId, fallback) =>
          seriesId === "series-b" ? "Edited B" : fallback,
      ),
      [
        {
          key: "series-a",
          label: "Vd=0.1",
          sourceFileId: "file-a",
          sourceSeriesId: "series-a",
        },
        {
          key: "series-b",
          label: "Edited B",
          sourceFileId: "file-a",
          sourceSeriesId: "series-b",
        },
      ],
    );
  });
});

const createFileRecord = (): FileRecord => ({
  assessment: {
    baseFamily: "iv",
  },
  baseCandidateOrder: [],
  baseCandidatesById: {},
  curvesByKey: {},
  id: "file-a",
  metricsByKey: {},
  raw: {
    fileId: "file-a",
    fileName: "file-a.csv",
    tableOrder: [],
    tablesById: {},
  },
  seriesById: {
    "series-a": {
      fileId: "file-a",
      groupIndex: 0,
      id: "series-a",
      legendValue: "Vd=0.1",
      y: [1],
    },
    "series-b": {
      fileId: "file-a",
      groupIndex: 1,
      id: "series-b",
      name: "Source B",
      y: [2],
    },
  },
  seriesOrder: ["series-a", "series-b"],
  xGroups: [[0], [1]],
});
