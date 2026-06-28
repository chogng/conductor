/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { createCalculatedMetricRecordsByFile } from "src/cs/workbench/services/calculation/common/calculationMetricRecordBuilder";
import { ParametersService } from "src/cs/workbench/services/parameters/browser/parametersService";
import type { ParametersViewState } from "src/cs/workbench/services/parameters/common/parameterModel";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import type { FileRecord, MetricKey } from "src/cs/workbench/services/session/common/sessionModel";

suite("workbench/services/parameters/test/browser/parametersService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("publishes parameter view state from the service", () => {
    const service = store.add(new ParametersService());
    const viewStates: ParametersViewState[] = [];
    const disposable = store.add(service.onDidChangeParametersViewState(state => {
      viewStates.push(state);
    }));

    const viewState = service.updateViewState({
      fileId: null,
      snapshot: createEmptySnapshot(),
    });

    assert.deepEqual(viewState, {
      kind: "empty",
      message: "parameters.empty.noData",
    });
    assert.deepEqual(service.getViewState(), viewState);
    assert.deepEqual(viewStates, [viewState]);

    disposable.dispose();
    service.dispose();
  });

  test("does not publish unchanged parameter view state input", () => {
    const service = store.add(new ParametersService());
    const viewStates: ParametersViewState[] = [];
    const snapshot = createProcessedSnapshot();
    const disposable = store.add(service.onDidChangeParametersViewState(state => {
      viewStates.push(state);
    }));

    const firstViewState = service.updateViewState({
      fileId: "file-a",
      snapshot,
    });
    const secondViewState = service.updateViewState({
      fileId: "file-a",
      snapshot,
    });

    assert.equal(secondViewState, firstViewState);
    assert.deepEqual(viewStates, [firstViewState]);

    disposable.dispose();
    service.dispose();
  });

  test("requires caller-owned file selection for parameter view state", () => {
    const service = store.add(new ParametersService());
    const snapshot = createProcessedSnapshot();

    const missingSelection = service.createViewState({
      fileId: null,
      snapshot,
    });
    const selectedFile = service.createViewState({
      fileId: "file-a",
      snapshot,
    });

    assert.deepEqual(missingSelection, {
      kind: "empty",
      message: "parameters.empty.noData",
    });
    assert.equal(selectedFile.kind, "table");
    if (selectedFile.kind === "table") {
      assert.equal(selectedFile.gmMetricHeader, "gm");
      assert.equal(selectedFile.rows[0]?.id, "series-1");
    }
  });
});

const createEmptySnapshot = (): SessionSnapshot => ({
  fileOrder: [],
  filesById: {},
  schemaVersion: 1,
  sessionVersion: 1,
});

const createProcessedSnapshot = (): SessionSnapshot => {
  const file = createProcessedFileRecord();
  const filesById = { [file.id]: file };
  const fileOrder = [file.id];
  const metricRecords = createCalculatedMetricRecordsByFile(
    filesById,
    fileOrder,
  );
  const metricsByKey = Object.fromEntries(
    (metricRecords["file-a"] ?? []).map(metric => [metric.key, metric]),
  );
  const metricsBySeriesId = Object.values(metricsByKey).reduce<Record<string, MetricKey[]>>(
    (result, metric) => {
      result[metric.seriesId] = [...(result[metric.seriesId] ?? []), metric.key];
      return result;
    },
    {},
  );

  return {
    ...createEmptySnapshot(),
    fileOrder,
    filesById: {
      "file-a": {
        ...file,
        metricsByKey,
        metricsBySeriesId,
      },
    },
  };
};

const createProcessedFileRecord = (): FileRecord => ({
  id: "file-a",
  kind: "unknown",
  name: "Transfer.csv",
  raw: {
    fileId: "file-a",
    fileName: "Transfer.csv",
    tableOrder: [],
    tablesById: {},
  },
  rawTableVersionsById: {},
  seriesById: {
    "series-1": {
      fileId: "file-a",
      groupIndex: 0,
      id: "series-1",
      legendValue: "0.1",
      y: [1e-12, 1e-9, 1e-6],
      yCol: 2,
    },
  },
  seriesOrder: ["series-1"],
  curvesByKey: {
    "base:iv:transfer:series-1": {
      curveFamily: "iv",
      curveGeneration: "base",
      domain: {
        x: [0, 2],
        y: [1e-12, 1e-6],
      },
      fileId: "file-a",
      ivMode: "transfer",
      lineage: {
        baseFamily: "iv",
        baseSeries: {
          fileId: "file-a",
          seriesId: "series-1",
        },
        curveGeneration: "base",
        ivMode: "transfer",
      },
      points: [
        { x: 0, y: 1e-12 },
        { x: 1, y: 1e-9 },
        { x: 2, y: 1e-6 },
      ],
      seriesId: "series-1",
      signature: "series-1",
    },
  },
  metricsByKey: {},
});
