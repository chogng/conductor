/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { createCalculatedMetricRecordsByFile } from "src/cs/workbench/services/calculation/common/calculationMetricRecordBuilder";
import { ParametersService } from "src/cs/workbench/services/parameters/browser/parametersService";
import type { ParametersViewState } from "src/cs/workbench/services/parameters/common/parameterModel";
import type {
  ISessionService,
  SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import type { FileRecord, MetricKey } from "src/cs/workbench/services/session/common/sessionModel";

let parametersTestStore: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>;

suite("workbench/services/parameters/test/browser/parametersService", () => {
  parametersTestStore = ensureNoDisposablesAreLeakedInTestSuite();

  test("publishes parameter view state from the service", () => {
    const service = createParametersService();
    const viewStates: ParametersViewState[] = [];
    const disposable = parametersTestStore.add(service.onDidChangeParametersViewState(state => {
      viewStates.push(state);
    }));

    const viewState = service.updateViewState({
      fileId: null,
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
    const fileRecord = createParametersFileRecord();
    const service = createParametersService(createSnapshot([fileRecord]));
    const viewStates: ParametersViewState[] = [];
    const disposable = parametersTestStore.add(service.onDidChangeParametersViewState(state => {
      viewStates.push(state);
    }));

    const firstViewState = service.updateViewState({
      fileId: "file-a",
    });
    const secondViewState = service.updateViewState({
      fileId: "file-a",
    });

    assert.equal(secondViewState, firstViewState);
    assert.deepEqual(viewStates, [firstViewState]);

    disposable.dispose();
    service.dispose();
  });

  test("publishes selected file again when Session version changes", () => {
    const fileRecord = createParametersFileRecord();
    let snapshot = createSnapshot([fileRecord], 1);
    const service = createParametersService(() => snapshot);
    const viewStates: ParametersViewState[] = [];
    const disposable = parametersTestStore.add(service.onDidChangeParametersViewState(state => {
      viewStates.push(state);
    }));

    const firstViewState = service.updateViewState({
      fileId: "file-a",
    });
    snapshot = createSnapshot([fileRecord], 2);
    const secondViewState = service.updateViewState({
      fileId: "file-a",
    });

    assert.notEqual(secondViewState, firstViewState);
    assert.deepEqual(viewStates, [firstViewState, secondViewState]);

    disposable.dispose();
    service.dispose();
  });

  test("does not publish empty selection again when only Session version changes", () => {
    let snapshot = createEmptySnapshot();
    const service = createParametersService(() => snapshot);
    const viewStates: ParametersViewState[] = [];
    const disposable = parametersTestStore.add(service.onDidChangeParametersViewState(state => {
      viewStates.push(state);
    }));

    const firstViewState = service.updateViewState({
      fileId: null,
    });
    snapshot = {
      ...snapshot,
      sessionVersion: snapshot.sessionVersion + 1,
    };
    const secondViewState = service.updateViewState({
      fileId: null,
    });

    assert.equal(secondViewState, firstViewState);
    assert.deepEqual(viewStates, [firstViewState]);

    disposable.dispose();
    service.dispose();
  });

  test("resolves selected file record from Session for parameter view state", () => {
    const fileRecord = createParametersFileRecord();
    const service = createParametersService(createSnapshot([fileRecord]));

    const missingSelection = service.createViewState({
      fileId: null,
    });
    const selectedFile = service.createViewState({
      fileId: "file-a",
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

const createParametersService = (
  snapshotOrFactory: SessionSnapshot | (() => SessionSnapshot) = createEmptySnapshot(),
): ParametersService => {
  const getSnapshot = typeof snapshotOrFactory === "function"
    ? snapshotOrFactory
    : () => snapshotOrFactory;
  const service = new ParametersService(createSessionServiceStub(getSnapshot));
  parametersTestStore.add(service);
  return service;
};

const createSessionServiceStub = (getSnapshot: () => SessionSnapshot): ISessionService => ({
  getSnapshot,
} as ISessionService);

const createEmptySnapshot = (): SessionSnapshot => ({
  fileOrder: [],
  filesById: {},
  schemaVersion: 1,
  sessionVersion: 1,
});

const createSnapshot = (
  files: readonly FileRecord[],
  sessionVersion = 1,
): SessionSnapshot => ({
  fileOrder: files.map(file => file.id),
  filesById: Object.fromEntries(files.map(file => [file.id, file])),
  schemaVersion: 1,
  sessionVersion,
});

const createParametersFileRecord = (): FileRecord => {
  const file = createProcessedFileRecord();
  const filesById = { [file.id]: file };
  const fileOrder = [file.id];
  const metricRecords = createCalculatedMetricRecordsByFile(
    filesById,
    fileOrder,
  );
  const metricsByKey = Object.fromEntries(
    (metricRecords[file.id] ?? []).map(metric => [metric.key, metric]),
  );
  const metricsBySeriesId = Object.values(metricsByKey).reduce<Record<string, MetricKey[]>>(
    (result, metric) => {
      result[metric.seriesId] = [...(result[metric.seriesId] ?? []), metric.key];
      return result;
    },
    {},
  );

  return {
    ...file,
    metricsByKey,
    metricsBySeriesId,
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
