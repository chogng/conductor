/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "src/cs/base/common/uri";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { createCalculatedMetricRecordsByFile } from "src/cs/workbench/services/calculation/common/calculationMetricRecordBuilder";
import { ParametersService } from "src/cs/workbench/services/parameters/browser/parametersService";
import type { ParametersViewState } from "src/cs/workbench/services/parameters/common/parameterModel";
import type {
  ISessionService,
  SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import type { FileRecord, MetricKey } from "src/cs/workbench/services/session/common/sessionModel";
import type {
  ISliceService,
  SliceResourceResult,
} from "src/cs/workbench/services/slice/common/slice";

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

  test("resolves selected resource result without reading Session", () => {
    let snapshotReads = 0;
    const resource = URI.file("/data/Transfer.csv");
    const service = createParametersService(() => {
      snapshotReads += 1;
      throw new Error("Resource parameter input should not read Session.");
    }, [createSliceResourceResult({ resource, sheetId: "sheet-a" })]);

    const viewState = service.createViewState({
      fileId: "resource-file-a",
      resource,
      sheetId: "sheet-a",
    });

    assert.equal(snapshotReads, 0);
    assert.equal(viewState.kind, "table");
    if (viewState.kind === "table") {
      assert.equal(viewState.gmMetricHeader, "gm");
      assert.equal(viewState.showTransferMetrics, true);
      assert.equal(viewState.rows[0]?.id, "series-a");
      assert.equal(viewState.rows[0]?.name, "A");
      assert.notEqual(viewState.rows[0]?.gmMaxAbs, null);
      assert.notEqual(viewState.rows[0]?.ion, null);
    }
  });

  test("publishes selected resource again when Slice result version changes", () => {
    const resource = URI.file("/data/Transfer.csv");
    let result = createSliceResourceResult({ resource, sheetId: "sheet-a" }, 1);
    const service = createParametersService(createEmptySnapshot(), () => [result]);
    const viewStates: ParametersViewState[] = [];
    const disposable = parametersTestStore.add(service.onDidChangeParametersViewState(state => {
      viewStates.push(state);
    }));

    const firstViewState = service.updateViewState({
      fileId: "resource-file-a",
      resource,
      sheetId: "sheet-a",
    });
    result = createSliceResourceResult({ resource, sheetId: "sheet-a" }, 2);
    const secondViewState = service.updateViewState({
      fileId: "resource-file-a",
      resource,
      sheetId: "sheet-a",
    });

    assert.notEqual(secondViewState, firstViewState);
    assert.deepEqual(viewStates, [firstViewState, secondViewState]);

    disposable.dispose();
  });
});

const createParametersService = (
  snapshotOrFactory: SessionSnapshot | (() => SessionSnapshot) = createEmptySnapshot(),
  resourceResultsOrFactory: readonly SliceResourceResult[] | (() => readonly SliceResourceResult[]) = [],
): ParametersService => {
  const getSnapshot = typeof snapshotOrFactory === "function"
    ? snapshotOrFactory
    : () => snapshotOrFactory;
  const service = new ParametersService(
    createSessionServiceStub(getSnapshot),
    createSliceServiceStub(resourceResultsOrFactory),
  );
  parametersTestStore.add(service);
  return service;
};

const createSessionServiceStub = (getSnapshot: () => SessionSnapshot): ISessionService => ({
  getSnapshot,
} as ISessionService);

const createSliceServiceStub = (
  resourceResultsOrFactory: readonly SliceResourceResult[] | (() => readonly SliceResourceResult[]),
): ISliceService => {
  const getResourceResults = typeof resourceResultsOrFactory === "function"
    ? resourceResultsOrFactory
    : () => resourceResultsOrFactory;
  return {
    getResourceResult: (resource, sheetId) =>
      getResourceResults().find(result =>
        result.resource.toString() === resource.toString() &&
        String(result.sheetId ?? "") === String(sheetId ?? "")
      ) ?? null,
  } as ISliceService;
};

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

const createSliceResourceResult = (
  {
    resource,
    sheetId = null,
  }: {
    readonly resource: URI;
    readonly sheetId?: string | null;
  },
  sourceVersion = 1,
): SliceResourceResult => ({
  completedAt: sourceVersion,
  curves: [{
    curveFamily: "iv",
    curveGeneration: "base",
    ivMode: "transfer",
    lineage: {
      baseFamily: "iv",
      baseSeries: {
        resource,
        sheetId,
        seriesId: "series-a",
      },
      curveGeneration: "base",
      ivMode: "transfer",
    },
    points: [
      { x: 0, y: 1e-12 },
      { x: 1, y: 1e-9 },
      { x: 2, y: 1e-6 },
    ],
    resource,
    seriesId: "series-a",
    sheetId,
    signature: `slice-curve-a-${sourceVersion}`,
  }],
  requestSignature: `request-a-${sourceVersion}`,
  resource,
  run: {
    errors: [],
    id: "slice-resource-run-a",
    inputRanges: [{
      range: {
        endCol: 1,
        endRow: 2,
        startCol: 0,
        startRow: 0,
      },
      resource,
      sheetId,
    }],
    mode: "auto",
    outputCurveKeys: [],
    outputSeriesIds: ["series-a"],
    resource,
    selection: { kind: "auto" },
    sheetId,
    sourceContentSignature: `source-a-${sourceVersion}`,
    template: {
      blocks: [{
        legend: { target: "yColumn" },
        rowRange: { endRow: 2, startRow: 0 },
        segmentation: { kind: "none" },
        titles: {
          bottom: "Voltage",
          left: "Current",
        },
        x: {
          columns: [0],
          unit: "V",
        },
        y: {
          columns: [1],
          unit: "A",
        },
      }],
      name: "transfer",
      schemaVersion: 1,
      stopOnError: false,
      version: 1,
    },
    templateFingerprint: "template-a",
    warnings: [],
  },
  series: [{
    groupIndex: 0,
    id: "series-a",
    name: "A",
    resource,
    sheetId,
    y: [1e-12, 1e-9, 1e-6],
  }],
  sheetId,
  sourceModelVersion: sourceVersion,
  sourceVersion,
});
