/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";
import { URI } from "src/cs/base/common/uri";
import type { CalculationResourceResult } from "src/cs/workbench/services/calculation/common/calculation";

import {
  createExportPaneState,
  createOriginCurveOptions,
  getCanvasScopeSummary,
  getExportSelectionSummary,
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

  test("createOriginCurveOptions uses calculation series order", () => {
    assert.deepEqual(
      createOriginCurveOptions(
        createCalculationResult(),
        (_fileId, seriesId, fallback) =>
          seriesId === "series-b" ? "Edited B" : fallback,
      ),
      [
        {
          key: "series-a",
          label: "Vd=0.1",
          sourceFileId: "test:/file-a.csv",
          sourceSeriesId: "series-a",
        },
        {
          key: "series-b",
          label: "Edited B",
          sourceFileId: "test:/file-a.csv",
          sourceSeriesId: "series-b",
        },
      ],
    );
  });
});

const createCalculationResult = (): CalculationResourceResult => ({
  axis: {
    xAxisRole: "vg",
    xLabel: "Gate Voltage",
    xUnit: "V",
    yLabel: "Drain Current",
    yUnit: "A",
  },
  completedAt: 1,
  curvesByKey: {
    "base:iv:transfer:series-a": {
      curveFamily: "iv",
      curveGeneration: "base",
      ivMode: "transfer",
      lineage: {
        baseFamily: "iv",
        baseSeries: { seriesId: "series-a" },
        curveGeneration: "base",
        ivMode: "transfer",
      },
      points: [{ x: 0, y: 1 }],
      seriesId: "series-a",
      signature: "base-a",
    },
    "base:iv:transfer:series-b": {
      curveFamily: "iv",
      curveGeneration: "base",
      ivMode: "transfer",
      lineage: {
        baseFamily: "iv",
        baseSeries: { seriesId: "series-b" },
        curveGeneration: "base",
        ivMode: "transfer",
      },
      points: [{ x: 1, y: 2 }],
      seriesId: "series-b",
      signature: "base-b",
    },
  },
  inputSignature: "input-a",
  metricsByKey: {},
  requestSignature: "request-a",
  resource: URI.parse("test:/file-a.csv"),
  seriesById: {
    "series-a": {
      groupIndex: 0,
      id: "series-a",
      legendValue: "Vd=0.1",
      y: [1],
    },
    "series-b": {
      groupIndex: 1,
      id: "series-b",
      name: "Source B",
      y: [2],
    },
  },
  seriesOrder: ["series-a", "series-b"],
  sourceModelVersion: 1,
  sourceVersion: 1,
});
