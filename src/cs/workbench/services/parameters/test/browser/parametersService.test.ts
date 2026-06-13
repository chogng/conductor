/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, Event } from "src/cs/base/common/event";
import { ParametersService } from "src/cs/workbench/services/parameters/browser/parametersService";
import type { ParametersState } from "src/cs/workbench/services/parameters/common/parameters";
import type { ParametersViewState } from "src/cs/workbench/services/parameters/common/parameterModel";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import type {
  ConductorSettings,
  ISettingsService,
} from "src/cs/workbench/services/settings/common/settings";
import {
  mergeProcessedFileIntoRecords,
  mergeRawFilesIntoRecords,
} from "src/cs/workbench/services/session/common/sessionModelAdapter";

suite("workbench/services/parameters/test/browser/parametersService", () => {
  test("owns parameter view state outside session", () => {
    const service = new ParametersService(createSettingsService());
    const states: ParametersState[] = [];
    const disposable = service.onDidChangeParametersState(state => {
      states.push(state);
    });

    service.setSsMethod("manual");
    service.setShowFitLine(false);
    service.setIonIoffMethod("manual");

    assert.deepEqual(service.getState(), {
      activeMetricKey: null,
      selectedMetricKeys: [],
      ionIoffMethod: "manual",
      ssMethod: "manual",
      showFitLine: false,
    });
    assert.equal(states.length, 3);
    disposable.dispose();
  });

  test("applies parameter defaults from settings changes", () => {
    let settings: ConductorSettings | null = {
      ionIoffMethodDefault: "manual",
      ssMethodDefault: "manual",
      ssShowFitLine: false,
    };
    const emitter = new Emitter<ConductorSettings | null>();
    const service = new ParametersService(createSettingsService({
      getConductorSettings: () => settings,
      onDidChangeConductorSettings: emitter.event,
    }));

    assert.deepEqual(service.getState(), {
      activeMetricKey: null,
      selectedMetricKeys: [],
      ionIoffMethod: "manual",
      ssMethod: "manual",
      showFitLine: false,
    });

    settings = {
      ionIoffMethodDefault: "auto",
      ssMethodDefault: "auto",
      ssShowFitLine: true,
    };
    emitter.fire(settings);

    assert.deepEqual(service.getState(), {
      activeMetricKey: null,
      selectedMetricKeys: [],
      ionIoffMethod: "auto",
      ssMethod: "auto",
      showFitLine: true,
    });

    service.dispose();
    emitter.dispose();
  });

  test("publishes parameter view state from the service", () => {
    const service = new ParametersService(createSettingsService());
    const viewStates: ParametersViewState[] = [];
    const disposable = service.onDidChangeParametersViewState(state => {
      viewStates.push(state);
    });

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

  test("requires caller-owned file selection for parameter view state", () => {
    const service = new ParametersService(createSettingsService());
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
  const rawRecords = mergeRawFilesIntoRecords({}, [], [{
    fileId: "file-a",
    fileName: "Transfer.csv",
  }]);
  const rawSnapshot = {
    ...createEmptySnapshot(),
    ...rawRecords,
  };
  const processedRecords = mergeProcessedFileIntoRecords(
    rawRecords.filesById,
    rawRecords.fileOrder,
    {
      curveType: "transfer",
      fileId: "file-a",
      fileName: "Transfer.csv",
      series: [{
        groupIndex: 0,
        id: "series-1",
        legendValue: "0.1",
        y: [1e-12, 1e-9, 1e-6],
        yCol: 2,
      }],
      xAxisRole: "vg",
      xGroups: [[0, 1, 2]],
      xUnit: "V",
      yUnit: "A",
    },
    rawSnapshot,
  );
  return {
    ...rawSnapshot,
    ...processedRecords,
  };
};

const createSettingsService = (
  overrides: Partial<ISettingsService> = {},
): ISettingsService => ({
  _serviceBrand: undefined,
  canCheckOriginHealth: () => false,
  canManageOrigin: () => false,
  canRunOriginCleanup: () => false,
  checkOriginHealth: async () => ({}),
  chooseOriginExePath: async () => "",
  errorMessage: error => String(error),
  formatOriginError: error => String(error),
  getConductorSettings: () => null,
  getOriginExePath: async () => "",
  getOriginSettingsViewInput: () => ({}),
  getSettingsViewInput: () => null,
  mergeConductorSettings: () => undefined,
  onDidChangeConductorSettings: Event.None,
  onDidChangeOriginSettingsViewInput: Event.None,
  onDidChangeSettingsViewInput: Event.None,
  runOriginCleanup: async () => ({ removedTotal: 0 }),
  update: () => undefined,
  updateOriginPlotOptions: async () => null,
  updatePlotAxisSettings: async () => null,
  updateSettings: async () => null,
  ...overrides,
});
