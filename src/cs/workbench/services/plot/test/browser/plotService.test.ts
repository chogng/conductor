/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";
import { Emitter, Event } from "src/cs/base/common/event";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
  StorageScope,
  StorageTarget,
} from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import type { ISessionService } from "src/cs/workbench/services/session/common/session";
import {
  createSessionChangeEvent,
  type SessionChangeEvent,
  type SessionChangeReason,
} from "src/cs/workbench/services/session/common/sessionEvents";
import type {
  BaseCurveKey,
  FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  PlotService,
  shouldInvalidatePlotModelsForSessionChange,
} from "src/cs/workbench/services/plot/browser/plotService";
import type {
  ConductorSettings,
  ISettingsService,
} from "src/cs/workbench/services/settings/common/settings";

suite("workbench/services/plot/test/browser/plotService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("owns active plot type outside session", () => {
    const service = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));
    let changeCount = 0;
    store.add(service.onDidChangePlotState(() => {
      changeCount += 1;
    }));

    service.setActivePlotType("gm");
    service.setActivePlotType("gm");

    assert.equal(service.getState().activePlotType, "gm");
    assert.equal(changeCount, 1);
  });

  test("creates display models with legend visibility, labels, units, and scale", () => {
    const service = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub({
        xUnitByFileId: { "file-a": "mV" },
        yScaleByFileId: { "file-a": "log" },
        yUnitByFileId: { "file-a": "mA" },
      }),
      store.add(new TestStorageService()),
    ));
    const displayModel = service.getPlotDisplayModel({
      hiddenLegendKeys: ["series-b"],
      legendLabels: { "series-a": "Edited A" },
      snapshot: createSnapshot(),
    });

    assert.equal(displayModel?.fileId, "file-a");
    assert.equal(displayModel?.chart.model.seriesList.length, 1);
    assert.equal(displayModel?.chart.model.seriesList[0]?.name, "Edited A");
    assert.equal(displayModel?.chart.plotXFactor, 1000);
    assert.equal(displayModel?.chart.plotYFactor, 1000);
    assert.equal(displayModel?.chart.plotXUnitLabel, "mV");
    assert.equal(displayModel?.chart.plotYUnitLabel, "mA");
    assert.equal(displayModel?.chart.xAxisTitle, "Gate");
    assert.equal(displayModel?.chart.yAxisTitle, "Drain current");
    assert.equal(displayModel?.chart.yScaleMode, "log");
    assert.deepEqual(displayModel?.unitControl, {
      fileId: "file-a",
      xUnit: "mV",
      xUnitOptions: ["V", "mV", "uV", "kV"],
      yScale: "log",
      yUnit: "mA",
      yUnitOptions: ["A", "mA", "uA", "nA", "pA"],
    });
  });

  test("limits y unit controls to the current plot output family", () => {
    const currentService = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub({
        xUnitByFileId: {},
        yScaleByFileId: {},
        yUnitByFileId: { "file-a": "F" },
      }),
      store.add(new TestStorageService()),
    ));
    const currentDisplayModel = currentService.getPlotDisplayModel({
      snapshot: createSnapshot({
        "file-a": createFileRecord("file-a", "series-a", "A", "A"),
      }),
    });

    assert.equal(currentDisplayModel?.chart.plotYUnitLabel, "A");
    assert.deepEqual(currentDisplayModel?.unitControl?.yUnitOptions, [
      "A",
      "mA",
      "uA",
      "nA",
      "pA",
    ]);

    const capacitanceService = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub({
        xUnitByFileId: {},
        yScaleByFileId: {},
        yUnitByFileId: { "file-a": "pF" },
      }),
      store.add(new TestStorageService()),
    ));
    const capacitanceDisplayModel = capacitanceService.getPlotDisplayModel({
      snapshot: createSnapshot({
        "file-a": createFileRecord("file-a", "series-a", "A", "F"),
      }),
    });

    assert.equal(capacitanceDisplayModel?.chart.plotYUnitLabel, "pF");
    assert.deepEqual(capacitanceDisplayModel?.unitControl?.yUnitOptions, [
      "F",
      "mF",
      "uF",
      "nF",
      "pF",
    ]);

    const frequencyService = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub({
        xUnitByFileId: { "file-a": "kHz" },
        yScaleByFileId: {},
        yUnitByFileId: { "file-a": "pF" },
      }),
      store.add(new TestStorageService()),
    ));
    const frequencyDisplayModel = frequencyService.getPlotDisplayModel({
      snapshot: createSnapshot({
        "file-a": createFileRecord("file-a", "series-a", "A", "F", "Hz"),
      }),
    });

    assert.equal(frequencyDisplayModel?.chart.plotXFactor, 1e-3);
    assert.equal(frequencyDisplayModel?.chart.plotXUnitLabel, "kHz");
    assert.equal(frequencyDisplayModel?.chart.plotYUnitLabel, "pF");
    assert.deepEqual(frequencyDisplayModel?.unitControl?.xUnitOptions, [
      "Hz",
      "kHz",
      "MHz",
      "GHz",
    ]);

    const invalidFrequencyDisplayModel = frequencyService.getPlotDisplayModel({
      snapshot: createSnapshot({
        "file-a": createFileRecord("file-a", "series-a", "A", "F", "V"),
      }),
    });
    assert.equal(invalidFrequencyDisplayModel?.chart.plotXUnitLabel, "V");
    assert.deepEqual(invalidFrequencyDisplayModel?.unitControl?.xUnitOptions, [
      "V",
      "mV",
      "uV",
      "kV",
    ]);

    const gmDisplayModel = currentService.getPlotDisplayModel({
      plotType: "gm",
      snapshot: createSnapshot({
        "file-a": createFileRecord("file-a", "series-a", "A", "A"),
      }),
    });

    assert.equal(gmDisplayModel?.chart.plotYUnitLabel, undefined);
    assert.equal(gmDisplayModel?.unitControl?.yUnit, null);
    assert.deepEqual(gmDisplayModel?.unitControl?.yUnitOptions, []);
  });

  test("creates display models for the requested file", () => {
    const service = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));
    const displayModel = service.getPlotDisplayModel({
      fileId: "file-b",
      snapshot: createSnapshot({
        "file-a": createFileRecord(),
        "file-b": createFileRecord("file-b", "series-c", "C"),
      }, ["file-a", "file-b"]),
    });

    assert.equal(displayModel?.fileId, "file-b");
    assert.equal(displayModel?.chart.model.seriesList[0]?.id, "series-c");
    assert.equal(displayModel?.chart.model.seriesList[0]?.name, "C");
  });

  test("caches calculated data per file record and plot type", () => {
    const service = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));
    const snapshot = createSnapshot();

    const first = service.getCalculatedData({
      fileId: "file-a",
      plotType: "iv",
      snapshot,
    });
    const second = service.getCalculatedData({
      fileId: "file-a",
      plotType: "iv",
      snapshot,
    });
    const differentPlot = service.getCalculatedData({
      fileId: "file-a",
      plotType: "gm",
      snapshot,
    });

    assert.equal(first, second);
    assert.notEqual(first, differentPlot);
  });

  test("prefetches calculated data on a deferred frame", async () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const scheduledFrames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;

    try {
      const file = createFileRecord();
      const curvesByKey = file.curvesByKey;
      let curveReads = 0;
      Object.defineProperty(file, "curvesByKey", {
        configurable: true,
        get: () => {
          curveReads += 1;
          return curvesByKey;
        },
      });
      const snapshot = createSnapshot({ "file-a": file });
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));

      service.prefetchCalculatedData(["file-a"], "visible", "iv");

      assert.equal(curveReads, 0);
      assert.equal(scheduledFrames.length, 1);

      scheduledFrames.shift()?.(0);
      await Promise.resolve();

      assert.ok(curveReads > 0);
      assert.equal(
        service.getCalculatedData({ fileId: "file-a", plotType: "iv", snapshot }),
        service.getCalculatedData({ fileId: "file-a", plotType: "iv", snapshot }),
      );
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  test("prefetches calculated data through a worker when available", async () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const originalWorker = globalThis.Worker;
    let scheduledFrame: FrameRequestCallback | null = null;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      scheduledFrame = callback;
      return 1;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;

    try {
      let workerFile: FileRecord | undefined;
      class TestWorker {
        public onerror: ((event: ErrorEvent) => void) | null = null;
        public onmessage: ((event: MessageEvent) => void) | null = null;

        public postMessage(message: {
          readonly payload?: {
            readonly file?: FileRecord;
            readonly plotType?: "iv";
            readonly requestId?: number;
            readonly sessionVersion?: number;
          };
        }): void {
          const payload = message.payload;
          workerFile = payload?.file;
          queueMicrotask(() => {
            this.onmessage?.({
              data: {
                payload: {
                  calculatedData: {
                    activeFile: null,
                    kind: payload?.plotType ?? "iv",
                    pointsCount: 0,
                    seriesList: [],
                    signature: "worker-result",
                    source: {
                      fileId: payload?.file?.id ?? null,
                      inputKind: "record",
                    },
                    xDomain: [0, 1],
                    xUnitLabel: "",
                    yDomain: [0, 1],
                    yUnitLabel: "",
                  },
                  fileId: payload?.file?.id ?? "",
                  plotType: payload?.plotType ?? "iv",
                  requestId: payload?.requestId ?? 0,
                  sessionVersion: payload?.sessionVersion ?? 0,
                },
                type: "calculateDataResult",
              },
            } as MessageEvent);
          });
        }

        public terminate(): void {
          return;
        }
      }
      globalThis.Worker = TestWorker as unknown as typeof Worker;

      const file = createFileRecord();
      file.raw.tablesById = {
        "sheet-a": {
          columnCount: 2,
          fileId: "file-a",
          maxCellLengths: [],
          rowCount: 1,
          rowStore: { kind: "memory", rows: [["raw", "row"]] },
          sheetId: "sheet-a",
          tableKey: "sheet-a",
        },
      };
      file.raw.tableOrder = ["sheet-a"];
      const snapshot = createSnapshot({ "file-a": file });
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));

      service.prefetchCalculatedData(["file-a"], "visible", "iv");
      scheduledFrame?.(0);
      await Promise.resolve();
      await Promise.resolve();

      assert.ok(workerFile);
      assert.notEqual(workerFile, file);
      assert.deepEqual(workerFile.raw.tablesById, {});
      assert.deepEqual(workerFile.raw.tableOrder, []);
      assert.deepEqual(Object.keys(workerFile.curvesByKey), Object.keys(file.curvesByKey));
      assert.equal(
        service.getCachedCalculatedData({ fileId: "file-a", plotType: "iv", snapshot })?.signature,
        "worker-result",
      );
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      globalThis.Worker = originalWorker;
    }
  });

  test("caches worker empty calculated data result as unavailable", async () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const originalWorker = globalThis.Worker;
    const scheduledFrames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;

    type WorkerRecord = {
      readonly message: {
        readonly payload?: {
          readonly file?: FileRecord;
          readonly fileId?: string;
          readonly plotType?: "iv";
          readonly requestId?: number;
          readonly sessionVersion?: number;
        };
        readonly type?: string;
      };
      readonly worker: TestWorker;
    };
    const workerRecords: WorkerRecord[] = [];
    class TestWorker {
      public onerror: ((event: ErrorEvent) => void) | null = null;
      public onmessage: ((event: MessageEvent) => void) | null = null;

      public postMessage(message: WorkerRecord["message"]): void {
        workerRecords.push({ message, worker: this });
      }

      public terminate(): void {
        return;
      }
    }

    try {
      globalThis.Worker = TestWorker as unknown as typeof Worker;
      const file = createFileRecord("file-a", "series-a", "A");
      file.curvesByKey = {};
      const snapshot = createSnapshot({ "file-a": file });
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));

      service.prefetchPlotDisplayModel({ fileId: "file-a", plotType: "iv", snapshot }, "active");
      scheduledFrames.shift()?.(0);
      assert.equal(workerRecords.length, 1);
      assert.equal(workerRecords[0]?.message.type, "calculateData");

      const payload = workerRecords[0]?.message.payload;
      workerRecords[0]?.worker.onmessage?.({
        data: {
          payload: {
            calculatedData: null,
            fileId: payload?.file?.id ?? "",
            plotType: payload?.plotType ?? "iv",
            requestId: payload?.requestId ?? 0,
            sessionVersion: payload?.sessionVersion ?? 0,
          },
          type: "calculateDataResult",
        },
      } as MessageEvent);
      await Promise.resolve();

      while (scheduledFrames.length) {
        scheduledFrames.shift()?.(0);
      }
      service.prefetchPlotDisplayModel({ fileId: "file-a", plotType: "iv", snapshot }, "active");
      service.prefetchCalculatedData(["file-a"], "active", "iv");
      while (scheduledFrames.length) {
        scheduledFrames.shift()?.(0);
      }

      assert.equal(workerRecords.length, 1);
      assert.equal(service.getCachedCalculatedData({ fileId: "file-a", plotType: "iv", snapshot }), null);
      assert.equal(service.getCachedPlotDisplayModel({ fileId: "file-a", plotType: "iv", snapshot }), null);
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      globalThis.Worker = originalWorker;
    }
  });

  test("skips calculated data prefetch entries that are already cached", () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    let scheduledFrame = false;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      scheduledFrame = true;
      return 1;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;

    try {
      const snapshot = createSnapshot();
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));

      service.getCalculatedData({
        fileId: "file-a",
        plotType: "iv",
        snapshot,
      });
      service.prefetchCalculatedData(["file-a"], "visible", "iv");

      assert.equal(scheduledFrame, false);
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  test("prefetches higher priority calculated data before backlog", async () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const scheduledFrames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;

    try {
      const snapshot = createSnapshot({
        "file-active": createFileRecord("file-active", "series-active", "Active"),
        "file-idle": createFileRecord("file-idle", "series-idle", "Idle"),
        "file-visible": createFileRecord("file-visible", "series-visible", "Visible"),
      }, ["file-idle", "file-visible", "file-active"]);
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));
      const events: string[] = [];
      store.add(service.onDidChangeCalculatedDataCache(event => {
        events.push(event.fileId);
      }));

      service.prefetchCalculatedData(["file-idle"], "idle", "iv");
      service.prefetchCalculatedData(["file-visible"], "visible", "iv");
      service.prefetchCalculatedData(["file-active"], "active", "iv");
      scheduledFrames.shift()?.(0);
      await Promise.resolve();

      assert.deepEqual(events, [
        "file-active",
        "file-visible",
      ]);

      scheduledFrames.shift()?.(0);
      await Promise.resolve();

      assert.deepEqual(events, [
        "file-active",
        "file-visible",
        "file-idle",
      ]);
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  test("starts active calculated data while background prefetch is still running", async () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const originalWorker = globalThis.Worker;
    const scheduledFrames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;

    type WorkerRecord = {
      readonly message: {
        readonly payload?: {
          readonly file?: FileRecord;
          readonly plotType?: "iv";
          readonly requestId?: number;
          readonly sessionVersion?: number;
        };
      };
      readonly worker: TestWorker;
    };
    const workerRecords: WorkerRecord[] = [];
    class TestWorker {
      public onerror: ((event: ErrorEvent) => void) | null = null;
      public onmessage: ((event: MessageEvent) => void) | null = null;

      public postMessage(message: WorkerRecord["message"]): void {
        workerRecords.push({ message, worker: this });
      }

      public terminate(): void {
        return;
      }
    }

    const completeWorker = (record: WorkerRecord): void => {
      const payload = record.message.payload;
      const fileId = payload?.file?.id ?? "";
      record.worker.onmessage?.({
        data: {
          payload: {
            calculatedData: {
              activeFile: null,
              kind: payload?.plotType ?? "iv",
              pointsCount: 0,
              seriesList: [],
              signature: `worker-result:${fileId}`,
              source: {
                fileId,
                inputKind: "record",
              },
              xDomain: [0, 1],
              xUnitLabel: "",
              yDomain: [0, 1],
              yUnitLabel: "",
            },
            fileId,
            plotType: payload?.plotType ?? "iv",
            requestId: payload?.requestId ?? 0,
            sessionVersion: payload?.sessionVersion ?? 0,
          },
          type: "calculateDataResult",
        },
      } as MessageEvent);
    };

    try {
      globalThis.Worker = TestWorker as unknown as typeof Worker;
      const snapshot = createSnapshot({
        "file-active": createFileRecord("file-active", "series-active", "Active"),
        "file-visible-a": createFileRecord("file-visible-a", "series-visible-a", "Visible A"),
        "file-visible-b": createFileRecord("file-visible-b", "series-visible-b", "Visible B"),
        "file-visible-c": createFileRecord("file-visible-c", "series-visible-c", "Visible C"),
      }, ["file-visible-a", "file-visible-b", "file-visible-c", "file-active"]);
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));

      service.prefetchCalculatedData([
        "file-visible-a",
        "file-visible-b",
        "file-visible-c",
      ], "visible", "iv");
      scheduledFrames.shift()?.(0);

      assert.deepEqual(
        workerRecords.map(record => record.message.payload?.file?.id),
        ["file-visible-a"],
      );

      service.prefetchCalculatedData(["file-active"], "active", "iv");
      scheduledFrames.shift()?.(0);

      assert.deepEqual(
        workerRecords.map(record => record.message.payload?.file?.id),
        ["file-visible-a", "file-active"],
      );

      for (const record of workerRecords) {
        completeWorker(record);
      }
      await Promise.resolve();
      service.setActivePlotType("gm");
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      globalThis.Worker = originalWorker;
    }
  });

  test("starts active display model while background display prefetch is still running", async () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const originalWorker = globalThis.Worker;
    const scheduledFrames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;

    type WorkerRecord = {
      readonly message: {
        readonly payload?: {
          readonly fileId?: string;
          readonly plotType?: "iv";
          readonly requestId?: number;
          readonly sessionVersion?: number;
        };
        readonly type?: string;
      };
      readonly worker: TestWorker;
    };
    const workerRecords: WorkerRecord[] = [];
    class TestWorker {
      public onerror: ((event: ErrorEvent) => void) | null = null;
      public onmessage: ((event: MessageEvent) => void) | null = null;

      public postMessage(message: WorkerRecord["message"]): void {
        workerRecords.push({ message, worker: this });
      }

      public terminate(): void {
        return;
      }
    }

    const completeDisplayWorker = (record: WorkerRecord): void => {
      const payload = record.message.payload;
      record.worker.onmessage?.({
        data: {
          payload: {
            displayModel: null,
            fileId: payload?.fileId ?? "",
            plotType: payload?.plotType ?? "iv",
            requestId: payload?.requestId ?? 0,
            sessionVersion: payload?.sessionVersion ?? 0,
          },
          type: "calculateDisplayModelResult",
        },
      } as MessageEvent);
    };

    try {
      globalThis.Worker = TestWorker as unknown as typeof Worker;
      const snapshot = createSnapshot({
        "file-active": createFileRecord("file-active", "series-active", "Active"),
        "file-visible": createFileRecord("file-visible", "series-visible", "Visible"),
      }, ["file-visible", "file-active"]);
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));

      service.getCalculatedData({ fileId: "file-visible", plotType: "iv", snapshot });
      service.getCalculatedData({ fileId: "file-active", plotType: "iv", snapshot });

      service.prefetchPlotDisplayModel({
        fileId: "file-visible",
        plotType: "iv",
        snapshot,
      }, "visible");
      scheduledFrames.shift()?.(0);

      assert.deepEqual(
        workerRecords.map(record => `${record.message.type}:${record.message.payload?.fileId}`),
        ["calculateDisplayModel:file-visible"],
      );

      service.prefetchPlotDisplayModel({
        fileId: "file-active",
        plotType: "iv",
        snapshot,
      }, "active");
      scheduledFrames.shift()?.(0);

      assert.deepEqual(
        workerRecords.map(record => `${record.message.type}:${record.message.payload?.fileId}`),
        [
          "calculateDisplayModel:file-visible",
          "calculateDisplayModel:file-active",
        ],
      );

      for (const record of workerRecords) {
        completeDisplayWorker(record);
      }
      await Promise.resolve();
      service.setActivePlotType("gm");
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      globalThis.Worker = originalWorker;
    }
  });

  test("keeps active display prefetch when another file changes", async () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const originalWorker = globalThis.Worker;
    const onDidChangeSessionEmitter = new Emitter<SessionChangeEvent>();
    const scheduledFrames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;

    type WorkerRecord = {
      readonly message: {
        readonly payload?: {
          readonly fileId?: string;
          readonly plotType?: "iv";
          readonly requestId?: number;
          readonly sessionVersion?: number;
        };
        readonly type?: string;
      };
      readonly worker: TestWorker;
    };
    const workerRecords: WorkerRecord[] = [];
    class TestWorker {
      public onerror: ((event: ErrorEvent) => void) | null = null;
      public onmessage: ((event: MessageEvent) => void) | null = null;

      public postMessage(message: WorkerRecord["message"]): void {
        workerRecords.push({ message, worker: this });
      }

      public terminate(): void {
        return;
      }
    }

    const completeDisplayWorker = (record: WorkerRecord): void => {
      const payload = record.message.payload;
      record.worker.onmessage?.({
        data: {
          payload: {
            displayModel: null,
            fileId: payload?.fileId ?? "",
            plotType: payload?.plotType ?? "iv",
            requestId: payload?.requestId ?? 0,
            sessionVersion: payload?.sessionVersion ?? 0,
          },
          type: "calculateDisplayModelResult",
        },
      } as MessageEvent);
    };

    try {
      globalThis.Worker = TestWorker as unknown as typeof Worker;
      const activeFile = createFileRecord("file-active", "series-active", "Active");
      let snapshot = createSnapshot({
        "file-active": activeFile,
        "file-other": createFileRecord("file-other", "series-other", "Other"),
      }, ["file-active", "file-other"]);
      const service = store.add(new PlotService(
        {
          ...createSessionServiceStub(snapshot, onDidChangeSessionEmitter.event),
          getSnapshot: () => snapshot,
        },
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));
      let plotStateChanges = 0;
      store.add(service.onDidChangePlotState(() => {
        plotStateChanges += 1;
      }));

      service.getCalculatedData({
        fileId: "file-active",
        plotType: "iv",
        snapshot,
      });
      service.prefetchPlotDisplayModel({
        fileId: "file-active",
        plotType: "iv",
        snapshot,
      }, "active");
      scheduledFrames.shift()?.(0);

      assert.deepEqual(
        workerRecords.map(record => `${record.message.type}:${record.message.payload?.fileId}`),
        ["calculateDisplayModel:file-active"],
      );

      snapshot = {
        ...snapshot,
        filesById: {
          ...snapshot.filesById,
          "file-other": createFileRecord("file-other", "series-other-next", "Other Next"),
        },
        sessionVersion: 2,
      };
      onDidChangeSessionEmitter.fire(createSessionChangeEvent(
        "templateRunChanged",
        2,
        { fileIds: ["file-other"] },
      ));

      assert.equal(plotStateChanges, 0);

      completeDisplayWorker(workerRecords[0]);
      await Promise.resolve();

      assert.ok(service.getCachedPlotDisplayModel({
        fileId: "file-active",
        plotType: "iv",
        snapshot,
      }));
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      globalThis.Worker = originalWorker;
      onDidChangeSessionEmitter.dispose();
    }
  });

  test("stale calculated data worker result does not clear a newer in-flight request", async () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const originalWorker = globalThis.Worker;
    const onDidChangeSessionEmitter = new Emitter<SessionChangeEvent>();
    const scheduledFrames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;

    type WorkerRecord = {
      readonly message: {
        readonly payload?: {
          readonly file?: FileRecord;
          readonly plotType?: "iv";
          readonly requestId?: number;
          readonly sessionVersion?: number;
        };
      };
      readonly worker: TestWorker;
    };
    const workerRecords: WorkerRecord[] = [];
    class TestWorker {
      public onerror: ((event: ErrorEvent) => void) | null = null;
      public onmessage: ((event: MessageEvent) => void) | null = null;

      public postMessage(message: WorkerRecord["message"]): void {
        workerRecords.push({ message, worker: this });
      }

      public terminate(): void {
        return;
      }
    }

    const completeCalculatedWorker = (record: WorkerRecord): void => {
      const payload = record.message.payload;
      const fileId = payload?.file?.id ?? "";
      record.worker.onmessage?.({
        data: {
          payload: {
            calculatedData: {
              activeFile: null,
              kind: payload?.plotType ?? "iv",
              pointsCount: 0,
              seriesList: [],
              signature: `worker-result:${fileId}:${payload?.sessionVersion ?? 0}`,
              source: {
                fileId,
                inputKind: "record",
              },
              xDomain: [0, 1],
              xUnitLabel: "",
              yDomain: [0, 1],
              yUnitLabel: "",
            },
            fileId,
            plotType: payload?.plotType ?? "iv",
            requestId: payload?.requestId ?? 0,
            sessionVersion: payload?.sessionVersion ?? 0,
          },
          type: "calculateDataResult",
        },
      } as MessageEvent);
    };

    try {
      globalThis.Worker = TestWorker as unknown as typeof Worker;
      let snapshot = createSnapshot({
        "file-a": createFileRecord("file-a", "series-a", "A"),
      });
      const service = store.add(new PlotService(
        {
          ...createSessionServiceStub(snapshot, onDidChangeSessionEmitter.event),
          getSnapshot: () => snapshot,
        },
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));

      service.prefetchCalculatedData(["file-a"], "visible", "iv");
      scheduledFrames.shift()?.(0);
      assert.equal(workerRecords.length, 1);

      snapshot = {
        ...createSnapshot({
          "file-a": createFileRecord("file-a", "series-a-next", "A Next"),
        }),
        sessionVersion: 2,
      };
      onDidChangeSessionEmitter.fire(createSessionChangeEvent(
        "curvesChanged",
        2,
        { fileIds: ["file-a"] },
      ));

      service.prefetchCalculatedData(["file-a"], "active", "iv");
      scheduledFrames.shift()?.(0);
      assert.equal(workerRecords.length, 2);

      completeCalculatedWorker(workerRecords[0]);
      await Promise.resolve();

      service.prefetchCalculatedData(["file-a"], "active", "iv");
      scheduledFrames.shift()?.(0);
      assert.equal(workerRecords.length, 2);

      completeCalculatedWorker(workerRecords[1]);
      await Promise.resolve();
      assert.equal(
        service.getCachedCalculatedData({ fileId: "file-a", plotType: "iv", snapshot })?.signature,
        "worker-result:file-a:2",
      );
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      globalThis.Worker = originalWorker;
      onDidChangeSessionEmitter.dispose();
    }
  });

  test("stale display model worker result does not clear a newer in-flight request", async () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const originalWorker = globalThis.Worker;
    const onDidChangeSessionEmitter = new Emitter<SessionChangeEvent>();
    const scheduledFrames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;

    type WorkerRecord = {
      readonly message: {
        readonly payload?: {
          readonly fileId?: string;
          readonly plotType?: "iv";
          readonly requestId?: number;
          readonly sessionVersion?: number;
        };
        readonly type?: string;
      };
      readonly worker: TestWorker;
    };
    const workerRecords: WorkerRecord[] = [];
    class TestWorker {
      public onerror: ((event: ErrorEvent) => void) | null = null;
      public onmessage: ((event: MessageEvent) => void) | null = null;

      public postMessage(message: WorkerRecord["message"]): void {
        workerRecords.push({ message, worker: this });
      }

      public terminate(): void {
        return;
      }
    }

    const completeDisplayWorker = (record: WorkerRecord): void => {
      const payload = record.message.payload;
      record.worker.onmessage?.({
        data: {
          payload: {
            displayModel: null,
            fileId: payload?.fileId ?? "",
            plotType: payload?.plotType ?? "iv",
            requestId: payload?.requestId ?? 0,
            sessionVersion: payload?.sessionVersion ?? 0,
          },
          type: "calculateDisplayModelResult",
        },
      } as MessageEvent);
    };

    try {
      globalThis.Worker = TestWorker as unknown as typeof Worker;
      let snapshot = createSnapshot({
        "file-a": createFileRecord("file-a", "series-a", "A"),
      });
      const service = store.add(new PlotService(
        {
          ...createSessionServiceStub(snapshot, onDidChangeSessionEmitter.event),
          getSnapshot: () => snapshot,
        },
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));

      service.getCalculatedData({ fileId: "file-a", plotType: "iv", snapshot });
      service.prefetchPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
        snapshot,
      }, "visible");
      scheduledFrames.shift()?.(0);
      assert.deepEqual(
        workerRecords.map(record => `${record.message.type}:${record.message.payload?.sessionVersion}`),
        ["calculateDisplayModel:1"],
      );

      snapshot = {
        ...createSnapshot({
          "file-a": createFileRecord("file-a", "series-a-next", "A Next"),
        }),
        sessionVersion: 2,
      };
      onDidChangeSessionEmitter.fire(createSessionChangeEvent(
        "curvesChanged",
        2,
        { fileIds: ["file-a"] },
      ));

      service.getCalculatedData({ fileId: "file-a", plotType: "iv", snapshot });
      service.prefetchPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
        snapshot,
      }, "active");
      scheduledFrames.shift()?.(0);
      assert.deepEqual(
        workerRecords.map(record => `${record.message.type}:${record.message.payload?.sessionVersion}`),
        [
          "calculateDisplayModel:1",
          "calculateDisplayModel:2",
        ],
      );

      completeDisplayWorker(workerRecords[0]);
      await Promise.resolve();

      service.prefetchPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
        snapshot,
      }, "active");
      scheduledFrames.shift()?.(0);
      assert.equal(workerRecords.length, 2);

      completeDisplayWorker(workerRecords[1]);
      await Promise.resolve();
      assert.ok(service.getCachedPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
        snapshot,
      }));
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      globalThis.Worker = originalWorker;
      onDidChangeSessionEmitter.dispose();
    }
  });

  test("falls back when calculated-data worker returns an empty result", async () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const originalWorker = globalThis.Worker;
    const scheduledFrames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;

    type WorkerRecord = {
      readonly message: {
        readonly payload?: {
          readonly fileId?: string;
          readonly plotType?: "iv";
          readonly requestId?: number;
          readonly sessionVersion?: number;
        };
        readonly type?: string;
      };
      readonly worker: TestWorker;
    };
    const workerRecords: WorkerRecord[] = [];
    class TestWorker {
      public onerror: ((event: ErrorEvent) => void) | null = null;
      public onmessage: ((event: MessageEvent) => void) | null = null;

      public postMessage(message: WorkerRecord["message"]): void {
        workerRecords.push({ message, worker: this });
      }

      public terminate(): void {
        return;
      }
    }

    const completeCalculatedWorkerWithEmptyResult = (record: WorkerRecord): void => {
      const payload = record.message.payload;
      record.worker.onmessage?.({
        data: {
          payload: {
            calculatedData: null,
            fileId: payload?.fileId ?? "",
            plotType: payload?.plotType ?? "iv",
            requestId: payload?.requestId ?? 0,
            sessionVersion: payload?.sessionVersion ?? 0,
          },
          type: "calculateDataResult",
        },
      } as MessageEvent);
    };
    const completeDisplayWorkerWithEmptyResult = (record: WorkerRecord): void => {
      const payload = record.message.payload;
      record.worker.onmessage?.({
        data: {
          payload: {
            displayModel: null,
            fileId: payload?.fileId ?? "",
            plotType: payload?.plotType ?? "iv",
            requestId: payload?.requestId ?? 0,
            sessionVersion: payload?.sessionVersion ?? 0,
          },
          type: "calculateDisplayModelResult",
        },
      } as MessageEvent);
    };

    try {
      globalThis.Worker = TestWorker as unknown as typeof Worker;
      const snapshot = createSnapshot({
        "file-a": createFileRecord("file-a", "series-a", "A"),
      });
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));

      service.prefetchPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
        snapshot,
      }, "active");

      scheduledFrames.shift()?.(0);
      assert.deepEqual(
        workerRecords.map(record => `${record.message.type}:${record.message.payload?.fileId}`),
        ["calculateData:file-a"],
      );

      completeCalculatedWorkerWithEmptyResult(workerRecords[0]);
      await Promise.resolve();
      scheduledFrames.shift()?.(0);

      assert.deepEqual(
        workerRecords.map(record => `${record.message.type}:${record.message.payload?.fileId}`),
        [
          "calculateData:file-a",
          "calculateDisplayModel:file-a",
        ],
      );

      completeDisplayWorkerWithEmptyResult(workerRecords[1]);
      await Promise.resolve();

      assert.ok(service.getCachedPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
        snapshot,
      }));
      assert.equal(workerRecords.filter(record => record.message.type === "calculateData").length, 1);
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      globalThis.Worker = originalWorker;
    }
  });

  test("publishes targeted cache changes instead of plot state for file-scoped invalidation", () => {
    const onDidChangeSessionEmitter = new Emitter<SessionChangeEvent>();

    try {
      const snapshot = createSnapshot();
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot, onDidChangeSessionEmitter.event),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));
      let plotStateChanges = 0;
      const calculatedEvents: Array<{ fileId: string; plotType: string }> = [];
      const displayEvents: Array<{ fileId: string; plotType: string }> = [];
      store.add(service.onDidChangePlotState(() => {
        plotStateChanges += 1;
      }));
      store.add(service.onDidChangeCalculatedDataCache(event => {
        calculatedEvents.push(event);
      }));
      store.add(service.onDidChangePlotDisplayModelCache(event => {
        displayEvents.push(event);
      }));

      service.getPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
        snapshot,
      });
      calculatedEvents.length = 0;
      displayEvents.length = 0;

      onDidChangeSessionEmitter.fire(createSessionChangeEvent(
        "curvesChanged",
        2,
        { fileIds: ["file-a"] },
      ));

      assert.equal(plotStateChanges, 0);
      assert.deepEqual(calculatedEvents, [
        { fileId: "file-a", plotType: "iv" },
      ]);
      assert.deepEqual(displayEvents, [
        { fileId: "file-a", plotType: "iv" },
      ]);
      assert.equal(service.getCachedPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
        snapshot,
      }), null);
    } finally {
      onDidChangeSessionEmitter.dispose();
    }
  });

  test("reads cached calculated data without creating it", () => {
    const service = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));
    const snapshot = createSnapshot();

    assert.equal(service.getCachedCalculatedData({
      fileId: "file-a",
      plotType: "iv",
      snapshot,
    }), null);

    const calculated = service.getCalculatedData({
      fileId: "file-a",
      plotType: "iv",
      snapshot,
    });

    assert.ok(calculated);
    assert.equal(service.getCachedCalculatedData({
      fileId: "file-a",
      plotType: "iv",
      snapshot,
    }), calculated);
  });

  test("reads cached plot display models without creating display data", async () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const originalWorker = globalThis.Worker;
    let scheduledFrame: FrameRequestCallback | null = null;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      scheduledFrame = callback;
      return 1;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;
    globalThis.Worker = undefined as unknown as typeof Worker;

    const file = createFileRecord();
    const curvesByKey = file.curvesByKey;
    let curveReads = 0;
    Object.defineProperty(file, "curvesByKey", {
      configurable: true,
      get: () => {
        curveReads += 1;
        return curvesByKey;
      },
    });
    const snapshot = createSnapshot({ "file-a": file });
    const service = store.add(new PlotService(
      createSessionServiceStub(snapshot),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));

    try {
      assert.equal(service.getCachedPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
        snapshot,
      }), null);
      assert.equal(curveReads, 0);

      service.getCalculatedData({
        fileId: "file-a",
        plotType: "iv",
        snapshot,
      });

      assert.equal(service.getCachedPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
        snapshot,
      }), null);

      service.prefetchPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
        snapshot,
      }, "active");
      scheduledFrame?.(0);
      await Promise.resolve();

      assert.ok(service.getCachedPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
        snapshot,
      }));
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      globalThis.Worker = originalWorker;
    }
  });

  test("publishes chart display model before inspector display model", async () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const originalWorker = globalThis.Worker;
    const scheduledFrames: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;
    globalThis.Worker = undefined as unknown as typeof Worker;

    try {
      const snapshot = createSnapshot();
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));
      const events: Array<{ fileId: string; plotType: string }> = [];
      store.add(service.onDidChangePlotDisplayModelCache(event => {
        events.push(event);
      }));

      service.getCalculatedData({
        fileId: "file-a",
        plotType: "iv",
        snapshot,
      });
      service.prefetchPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
        snapshot,
      }, "active");

      scheduledFrames.shift()?.(0);
      await Promise.resolve();

      const chartOnly = service.getCachedPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
        snapshot,
      });
      assert.ok(chartOnly?.chart.model);
      assert.equal(chartOnly?.inspector, null);
      assert.deepEqual(events, [
        { fileId: "file-a", plotType: "iv" },
      ]);

      scheduledFrames.shift()?.(0);
      await Promise.resolve();

      const full = service.getCachedPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
        snapshot,
      });
      assert.ok(full?.inspector?.model);
      assert.deepEqual(events, [
        { fileId: "file-a", plotType: "iv" },
        { fileId: "file-a", plotType: "iv" },
      ]);
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      globalThis.Worker = originalWorker;
    }
  });

  test("fires calculated data cache change when data is first cached", () => {
    const service = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));
    const snapshot = createSnapshot();
    const events: Array<{ fileId: string; plotType: string }> = [];
    store.add(service.onDidChangeCalculatedDataCache(event => {
      events.push(event);
    }));

    service.getCalculatedData({
      fileId: "file-a",
      plotType: "iv",
      snapshot,
    });
    service.getCalculatedData({
      fileId: "file-a",
      plotType: "iv",
      snapshot,
    });

    assert.deepEqual(events, [
      { fileId: "file-a", plotType: "iv" },
    ]);
  });

  test("cancels queued calculated data prefetch when active plot type changes", () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    let scheduledFrame: FrameRequestCallback | null = null;
    let canceledFrame = false;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      scheduledFrame = callback;
      return 1;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((handle: number): void => {
      canceledFrame = handle === 1;
    }) as typeof cancelAnimationFrame;

    try {
      const file = createFileRecord();
      const curvesByKey = file.curvesByKey;
      let curveReads = 0;
      Object.defineProperty(file, "curvesByKey", {
        configurable: true,
        get: () => {
          curveReads += 1;
          return curvesByKey;
        },
      });
      const snapshot = createSnapshot({ "file-a": file });
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));

      service.prefetchCalculatedData(["file-a"], "visible", "iv");
      service.setActivePlotType("gm");

      assert.equal(canceledFrame, true);
      scheduledFrame?.(0);
      assert.equal(curveReads, 0);
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  test("cancels queued calculated data prefetch on plot-relevant session changes", () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const onDidChangeSessionEmitter = new Emitter<SessionChangeEvent>();
    let scheduledFrame: FrameRequestCallback | null = null;
    let canceledFrame = false;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      scheduledFrame = callback;
      return 1;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((handle: number): void => {
      canceledFrame = handle === 1;
    }) as typeof cancelAnimationFrame;

    try {
      const file = createFileRecord();
      const curvesByKey = file.curvesByKey;
      let curveReads = 0;
      Object.defineProperty(file, "curvesByKey", {
        configurable: true,
        get: () => {
          curveReads += 1;
          return curvesByKey;
        },
      });
      const snapshot = createSnapshot({ "file-a": file });
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot, onDidChangeSessionEmitter.event),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));

      service.prefetchCalculatedData(["file-a"], "visible", "iv");
      onDidChangeSessionEmitter.fire(createSessionChangeEvent(
        "curvesChanged",
        2,
        { fileIds: ["file-a"] },
      ));

      assert.equal(canceledFrame, true);
      scheduledFrame?.(0);
      assert.equal(curveReads, 0);
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      onDidChangeSessionEmitter.dispose();
    }
  });

  test("owns axis title overrides by plot context", () => {
    const service = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));
    const snapshot = createSnapshot();
    const initial = service.getPlotDisplayModel({ snapshot });
    assert.equal(initial?.chart.xAxisTitle, "Gate");

    service.setAxisTitleOverride(
      initial!.chart.xAxisTitleContext,
      "Custom X",
      initial!.chart.defaultXAxisTitle,
    );
    const edited = service.getPlotDisplayModel({ snapshot });
    assert.equal(edited?.chart.xAxisTitle, "Custom X");
    assert.equal(edited?.inspector.xAxisTitle, "Gate");

    service.setAxisTitleOverride(
      initial!.chart.xAxisTitleContext,
      initial!.chart.defaultXAxisTitle,
      initial!.chart.defaultXAxisTitle,
    );
    const restored = service.getPlotDisplayModel({ snapshot });
    assert.equal(restored?.chart.xAxisTitle, "Gate");
  });

  test("removes legend label override when label is reset", () => {
    const service = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));

    service.setLegendLabel("file-a", "series-a", "Edited");
    service.setLegendLabel("file-a", "series-a", null);

    assert.deepEqual(service.getLegendLabels("file-a"), {});
  });

  test("invalidates plot models only for plot-relevant session changes", () => {
    for (const reason of [
      "templateRunChanged",
      "curvesChanged",
      "metricsChanged",
      "filesRemoved",
      "sessionCleared",
    ] satisfies SessionChangeReason[]) {
      assert.equal(
        shouldInvalidatePlotModelsForSessionChange(createSessionChangeEvent(reason, 1)),
        true,
        reason,
      );
    }

    for (const reason of [
      "rawTablesChanged",
      "assessmentChanged",
      "metricInputsChanged",
      "fileMetadataChanged",
    ] satisfies SessionChangeReason[]) {
      assert.equal(
        shouldInvalidatePlotModelsForSessionChange(createSessionChangeEvent(reason, 1)),
        false,
        reason,
      );
    }
  });

  test("updates unit and scale storage through plot owner API", async () => {
    const storageService = store.add(new TestStorageService());
    storageService.store(
      "plot.xUnitByFileId",
      { "file-b": "V" },
      StorageScope.PROFILE,
      StorageTarget.USER,
    );
    const service = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub(),
      storageService,
    ));
    let changeCount = 0;
    store.add(service.onDidChangePlotState(() => {
      changeCount += 1;
    }));

    await service.setAxisUnit("file-a", "x", "mV");
    await service.setAxisUnit("file-a", "y", "uA");
    await service.setYScale("file-a", "log");
    await service.setYScale("file-a", "log");

    assert.deepEqual({
      xUnitByFileId: storageService.getObject("plot.xUnitByFileId", StorageScope.PROFILE),
      yUnitByFileId: storageService.getObject("plot.yUnitByFileId", StorageScope.PROFILE),
      yScaleByFileId: storageService.getObject("plot.yScaleByFileId", StorageScope.PROFILE),
    }, {
      xUnitByFileId: { "file-b": "V", "file-a": "mV" },
      yUnitByFileId: { "file-a": "uA" },
      yScaleByFileId: { "file-a": "log" },
    });
    assert.equal(changeCount, 3);
  });
});

class TestStorageService extends AbstractStorageService {
  private readonly values = new Map<string, string>();

  protected readValue(key: string, scope: StorageScope): string | undefined {
    return this.values.get(this.storageKey(key, scope));
  }

  protected writeValue(key: string, scope: StorageScope, value: string): void {
    this.values.set(this.storageKey(key, scope), value);
  }

  protected deleteValue(key: string, scope: StorageScope): void {
    this.values.delete(this.storageKey(key, scope));
  }

  protected readKeys(scope: StorageScope): string[] {
    const prefix = `${scope}:`;
    return [...this.values.keys()]
      .filter(key => key.startsWith(prefix))
      .map(key => key.slice(prefix.length));
  }

  private storageKey(key: string, scope: StorageScope): string {
    return `${scope}:${key}`;
  }
}

const createSessionServiceStub = (
  snapshot: SessionSnapshot = createSnapshot(),
  onDidChangeSession: Event<SessionChangeEvent> = Event.None as Event<SessionChangeEvent>,
): ISessionService => ({
  _serviceBrand: undefined,
  onDidChangeSession,
  clearMetricInput: () => undefined,
  clearSession: () => undefined,
  commitCurves: () => undefined,
  commitCurvesBatch: () => undefined,
  commitFileImport: () => ({
    importedFileIds: [],
    skippedDuplicateFileIds: [],
  }),
  commitMetrics: () => undefined,
  commitMetricsBatch: () => undefined,
  commitRawTableAssessment: () => undefined,
  commitRawTableAssessments: () => undefined,
  commitTemplateOutput: () => undefined,
  commitTemplateOutputs: () => undefined,
  commitTemplateRun: () => undefined,
  getSnapshot: () => snapshot,
  renameFile: () => false,
  removeFiles: () => undefined,
  setMetricInput: () => undefined,
});

const createSettingsServiceStub = (
  initialSettings: ConductorSettings | null = {
    xUnitByFileId: {},
    yScaleByFileId: {},
    yUnitByFileId: {},
  },
  updatesLog: unknown[] = [],
): ISettingsService => {
  let settings = initialSettings;
  return {
    _serviceBrand: undefined,
    getConductorSettings: () => settings,
    onDidChangeConductorSettings: Event.None,
    onDidChangeNumericDisplayMode: Event.None,
    onDidChangeSettingsViewInput: Event.None,
    updateSettings: async (updates: unknown) => {
      updatesLog.push(updates);
      settings = {
        ...(settings ?? {}),
        ...(updates && typeof updates === "object" ? updates : {}),
      };
      return settings;
    },
  } as ISettingsService;
};

const createSnapshot = (
  filesById: Record<string, FileRecord> = {
    "file-a": createFileRecord(),
  },
  fileOrder: string[] = ["file-a"],
): SessionSnapshot => ({
  fileOrder,
  filesById,
  schemaVersion: 1,
  sessionVersion: 1,
});

const createFileRecord = (
  fileId = "file-a",
  seriesA = "series-a",
  seriesAName = "A",
  yUnit = "A",
  xUnit = "V",
): FileRecord => {
  const curveAKey = `base:iv:transfer:${seriesA}` as BaseCurveKey;
  const curveBKey = "base:iv:transfer:series-b" as BaseCurveKey;

  return {
    assessmentsByRawTableId: {},
    curvesByKey: {
      [curveAKey]: {
        curveFamily: "iv",
        curveGeneration: "base",
        fileId,
        ivMode: "transfer",
        lineage: {
          baseFamily: "iv",
          baseSeries: { fileId, seriesId: seriesA },
          curveGeneration: "base",
          ivMode: "transfer",
        },
        points: [
          { x: 0, y: 0.001 },
          { x: 1, y: 0.002 },
        ],
        seriesId: seriesA,
        signature: "base-a",
      },
      [curveBKey]: {
        curveFamily: "iv",
        curveGeneration: "base",
        fileId,
        ivMode: "transfer",
        lineage: {
          baseFamily: "iv",
          baseSeries: { fileId, seriesId: "series-b" },
          curveGeneration: "base",
          ivMode: "transfer",
        },
        points: [
          { x: 0, y: 0.003 },
          { x: 1, y: 0.004 },
        ],
        seriesId: "series-b",
        signature: "base-b",
      },
    },
    id: fileId,
    kind: "unknown",
    latestTemplateRunId: "run-a",
    measurementBlockOrder: [],
    measurementBlocksById: {},
    metricsByKey: {},
    name: `${fileId}.csv`,
    raw: {
      fileId,
      fileName: `${fileId}.csv`,
      tableOrder: [],
      tablesById: {},
    },
    rawTableVersionsById: {},
    seriesById: {
      [seriesA]: {
        fileId,
        groupIndex: 0,
        id: seriesA,
        name: seriesAName,
        y: [0.001, 0.002],
      },
      "series-b": {
        fileId,
        groupIndex: 1,
        id: "series-b",
        name: "B",
        y: [0.003, 0.004],
      },
    },
    seriesOrder: [seriesA, "series-b"],
    templateRunsById: {
      "run-a": {
        appliedAt: 1,
        config: {
          bottomTitle: "Gate",
          leftTitle: "Drain current",
          stopOnError: false,
        xDataEnd: 1,
        xDataStart: 0,
        xSegmentationMode: "auto",
        xUnit,
        yColumns: [1, 2],
        yLegendTarget: "auto",
        yUnit,
      },
        configFingerprint: "config-a",
        errors: [],
        fileId,
        id: "run-a",
        mode: "auto",
        outputCurveKeys: [
          curveAKey,
          curveBKey,
        ],
        outputSeriesIds: [seriesA, "series-b"],
        selection: { kind: "auto" },
        sourceBlockIds: [],
        warnings: [],
      },
    },
  };
};
