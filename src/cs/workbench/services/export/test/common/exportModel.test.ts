/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  createExportPaneState,
  createOriginCurveOptions,
  createOriginCurveOptionsFromRecord,
  getCanvasScopeSummary,
  getExportSelectionSummary,
  type OriginCurveOptionFile,
  type OriginCurveOptionRecord,
} from "src/cs/workbench/services/export/common/exportModel";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/export/common/exportModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
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
      "origin.canvasScope.summary.current",
    );
    assert.equal(
      getCanvasScopeSummary({
        originCanvasExportScope: "filtered",
        originFilteredCanvasKind: "output",
        selectedCanvasCount: 3,
      }),
      'origin.canvasScope.summary.filtered:{"count":3,"kind":"origin.filteredCanvasKind.output"}',
    );
    assert.equal(
      getCanvasScopeSummary({
        originCanvasExportScope: "all",
        originFilteredCanvasKind: "transfer",
        selectedCanvasCount: 5,
      }),
      'origin.canvasScope.summary.all:{"count":5}',
    );
    assert.equal(
      getCanvasScopeSummary({
        originCanvasExportScope: "selected",
        originFilteredCanvasKind: "transfer",
        selectedCanvasCount: 2,
      }),
      'origin.canvasScope.summary.selected:{"count":2}',
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
      'origin.collection.summary:{"curves":7,"files":2}',
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

  test("createOriginCurveOptions uses file series without Session processed-entry types", () => {
    assert.deepEqual(
      createOriginCurveOptions(
        createOriginCurveOptionFile(),
        (_file, series, index) =>
          series.id === "series-b" ? `Edited ${index + 1}` : String(series.name),
      ),
      [
        {
          key: "series-a",
          label: "Series A",
          sourceFileId: "file-a",
          sourceSeriesId: "series-a",
        },
        {
          key: "series-b",
          label: "Edited 2",
          sourceFileId: "file-a",
          sourceSeriesId: "series-b",
        },
      ],
    );
  });

  test("createOriginCurveOptionsFromRecord uses canonical series order", () => {
    assert.deepEqual(
      createOriginCurveOptionsFromRecord(
        createOriginCurveOptionRecord(),
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

const createOriginCurveOptionFile = (): OriginCurveOptionFile => ({
  fileId: "file-a",
  series: [{
    id: "series-a",
    name: "Series A",
  }, {
    id: "series-b",
    name: "Series B",
  }],
});

const createOriginCurveOptionRecord = (): OriginCurveOptionRecord => ({
  id: "file-a",
  seriesById: {
    "series-a": {
      legendValue: "Vd=0.1",
    },
    "series-b": {
      name: "Source B",
    },
  },
  seriesOrder: ["series-a", "series-b"],
});
