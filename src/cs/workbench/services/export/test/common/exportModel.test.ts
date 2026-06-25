/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import type { FileRecord } from "src/cs/workbench/services/session/common/sessionModel";

import {
  createExportPaneState,
  createOriginCurveOptionsFromRecord,
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
  tableModelByRawTableId: {},
  curvesByKey: {
    "base:iv:transfer:series-a": {
      curveFamily: "iv",
      curveGeneration: "base",
      fileId: "file-a",
      ivMode: "transfer",
      lineage: {
        baseFamily: "iv",
        baseSeries: { fileId: "file-a", seriesId: "series-a" },
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
      fileId: "file-a",
      ivMode: "transfer",
      lineage: {
        baseFamily: "iv",
        baseSeries: { fileId: "file-a", seriesId: "series-b" },
        curveGeneration: "base",
        ivMode: "transfer",
      },
      points: [{ x: 1, y: 2 }],
      seriesId: "series-b",
      signature: "base-b",
    },
  },
  id: "file-a",
  kind: "unknown",
  measurementBlockOrder: [],
  measurementBlocksById: {},
  metricsByKey: {},
  name: "file-a.csv",
  raw: {
    fileId: "file-a",
    fileName: "file-a.csv",
    tableOrder: [],
    tablesById: {},
  },
  rawTableVersionsById: {},
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
});
