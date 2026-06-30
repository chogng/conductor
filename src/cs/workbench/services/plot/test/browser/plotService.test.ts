/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";
import { Emitter, Event } from "src/cs/base/common/event";
import { URI } from "src/cs/base/common/uri";
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
  CurveKey,
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
import type {
  ISliceService,
  SliceResourceResult,
  SliceResourceTarget,
} from "src/cs/workbench/services/slice/common/slice";

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

  test("keeps cached inspector display models across active plot type switches", () => {
    const snapshot = createSnapshot();
    const service = store.add(new PlotService(
      createSessionServiceStub(snapshot),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));

    const ivModel = service.getPlotDisplayModel({
      fileId: "file-a",
      plotType: "iv",
    });
    assert.ok(ivModel?.chart);
    assert.ok(ivModel?.inspector);

    service.setActivePlotType("vth");

    const cachedIvModel = service.getCachedPlotDisplayModel({
      fileId: "file-a",
      plotType: "iv",
    });
    assert.strictEqual(cachedIvModel?.chart, ivModel?.chart);
    assert.strictEqual(cachedIvModel?.inspector, ivModel?.inspector);

    const vthModel = service.getPlotDisplayModel({
      fileId: "file-a",
      plotType: "vth",
    });
    assert.ok(vthModel?.chart);
    assert.ok(vthModel?.inspector);

    service.setActivePlotType("iv");

    const cachedVthModel = service.getCachedPlotDisplayModel({
      fileId: "file-a",
      plotType: "vth",
    });
    assert.strictEqual(cachedVthModel?.chart, vthModel?.chart);
    assert.strictEqual(cachedVthModel?.inspector, vthModel?.inspector);
  });

  test("does not enqueue inspector prefetch work for cached plot types after tab switches", () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const originalWorker = globalThis.Worker;
    const scheduledFrames: FrameRequestCallback[] = [];
    let workerMessageCount = 0;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      scheduledFrames.push(callback);
      return scheduledFrames.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;

    class TestWorker {
      public onerror: ((event: ErrorEvent) => void) | null = null;
      public onmessage: ((event: MessageEvent) => void) | null = null;

      public postMessage(): void {
        workerMessageCount += 1;
      }

      public terminate(): void {
        return;
      }
    }

    try {
      globalThis.Worker = TestWorker as unknown as typeof Worker;
      const snapshot = createSnapshot();
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));
      const cacheEvents: string[] = [];
      store.add(service.onDidChangePlotDisplayModelCache(event => {
        cacheEvents.push(`${event.plotType}:${event.pane ?? "all"}:${event.fileId ?? ""}`);
      }));

      const ivModel = service.getPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
      });
      const vthModel = service.getPlotDisplayModel({
        fileId: "file-a",
        plotType: "vth",
      });
      assert.ok(ivModel?.inspector);
      assert.ok(vthModel?.inspector);
      cacheEvents.length = 0;

      service.setActivePlotType("vth");
      service.prefetchPlotInspectorDisplayModel({
        fileId: "file-a",
        plotType: "vth",
      }, "active");
      service.setActivePlotType("iv");
      service.prefetchPlotInspectorDisplayModel({
        fileId: "file-a",
        plotType: "iv",
      }, "active");

      assert.deepEqual(cacheEvents, []);
      assert.equal(scheduledFrames.length, 0);
      assert.equal(workerMessageCount, 0);
      assert.strictEqual(service.getCachedPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
      })?.inspector, ivModel.inspector);
      assert.strictEqual(service.getCachedPlotDisplayModel({
        fileId: "file-a",
        plotType: "vth",
      })?.inspector, vthModel.inspector);
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      globalThis.Worker = originalWorker;
    }
  });

  test("does not synchronously create calculated data for files without base curves", () => {
    const file = createFileRecord();
	    file.curvesByKey = {};
	    file.seriesById = {};
	    file.seriesOrder = [];
    const snapshot = createSnapshot({ "file-a": file });
    const service = store.add(new PlotService(
      createSessionServiceStub(snapshot),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));

    assert.equal(service.getCalculatedData({ fileId: "file-a", plotType: "iv" }), null);
    assert.equal(service.getCachedCalculatedData({ fileId: "file-a", plotType: "iv" }), null);
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

  test("applies owned legend state when display requests omit legend overrides", () => {
    const snapshot = createSnapshot();
    const service = store.add(new PlotService(
      createSessionServiceStub(snapshot),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));

    service.setLegendLabel("file-a", "series-a", "Edited A");
    service.toggleHiddenLegendKey("file-a", "iv", "series-b", ["series-a", "series-b"]);

    const displayModel = service.getPlotDisplayModel({
      fileId: "file-a",
      plotType: "iv",
    });
    const cachedDisplayModel = service.getCachedPlotDisplayModel({
      fileId: "file-a",
      plotType: "iv",
    });

    assert.deepEqual(displayModel?.chart.model.seriesList.map(series => series.id), ["series-a"]);
    assert.equal(displayModel?.chart.model.seriesList[0]?.name, "Edited A");
    assert.deepEqual(cachedDisplayModel?.chart.model.seriesList.map(series => series.id), ["series-a"]);
    assert.equal(cachedDisplayModel?.chart.model.seriesList[0]?.name, "Edited A");

    const prefetchService = store.add(new PlotService(
      createSessionServiceStub(snapshot),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));
    prefetchService.setLegendLabel("file-a", "series-a", "Edited A");
    prefetchService.toggleHiddenLegendKey("file-a", "iv", "series-b", ["series-a", "series-b"]);
    prefetchService.prefetchPlotDisplayModel({
      fileId: "file-a",
      plotType: "iv",
    }, "active");

    const prefetchedDisplayModel = prefetchService.getCachedPlotDisplayModel({
      fileId: "file-a",
      plotType: "iv",
    });
    assert.deepEqual(prefetchedDisplayModel?.chart.model.seriesList.map(series => series.id), ["series-a"]);
    assert.equal(prefetchedDisplayModel?.chart.model.seriesList[0]?.name, "Edited A");
  });

  test("keeps inspector display model ready when legend visibility changes", () => {
    const snapshot = createSnapshot();
    const service = store.add(new PlotService(
      createSessionServiceStub(snapshot),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));

    const initial = service.getPlotDisplayModel({
      fileId: "file-a",
      plotType: "iv",
    });
    assert.ok(initial?.inspector);

    const events: Array<{ fileId?: string; pane?: string; plotType: string }> = [];
    store.add(service.onDidChangePlotDisplayModelCache(event => {
      events.push(event);
    }));

    service.toggleHiddenLegendKey("file-a", "iv", "series-b", ["series-a", "series-b"]);

    const cached = service.getCachedPlotDisplayModel({
      fileId: "file-a",
      plotType: "iv",
    });

    assert.deepEqual(cached?.chart.model.seriesList.map(series => series.id), ["series-a"]);
    assert.ok(cached?.inspector);
    assert.deepEqual(cached.inspector.model.seriesList.map(series => series.id), ["series-a:second-derivative"]);
    assert.deepEqual(events, [
      { fileId: "file-a", pane: "chart", plotType: "iv" },
      { fileId: "file-a", pane: "inspector", plotType: "iv" },
    ]);
  });

  test("keeps legend visibility updates chart-only when inspector cache is absent", () => {
    const snapshot = createSnapshot();
    const service = store.add(new PlotService(
      createSessionServiceStub(snapshot),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));

    service.getCalculatedData({
      fileId: "file-a",
      plotType: "iv",
    });
    service.prefetchPlotDisplayModel({
      fileId: "file-a",
      plotType: "iv",
    }, "active");

    const chartOnly = service.getCachedPlotDisplayModel({
      fileId: "file-a",
      plotType: "iv",
    });
    assert.equal(chartOnly?.inspector, null);

    const events: Array<{ fileId?: string; pane?: string; plotType: string }> = [];
    store.add(service.onDidChangePlotDisplayModelCache(event => {
      events.push(event);
    }));

    service.toggleHiddenLegendKey("file-a", "iv", "series-b", ["series-a", "series-b"]);

    const cached = service.getCachedPlotDisplayModel({
      fileId: "file-a",
      plotType: "iv",
    });

    assert.deepEqual(cached?.chart.model.seriesList.map(series => series.id), ["series-a"]);
    assert.equal(cached?.inspector, null);
    assert.deepEqual(events, [
      { fileId: "file-a", pane: "chart", plotType: "iv" },
    ]);
  });

  test("limits y unit controls to the current plot output family", () => {
    const currentSnapshot = createSnapshot({
      "file-a": createFileRecord("file-a", "series-a", "A", "A"),
    });
    const currentService = store.add(new PlotService(
      createSessionServiceStub(currentSnapshot),
      createSettingsServiceStub({
        xUnitByFileId: {},
        yScaleByFileId: {},
        yUnitByFileId: { "file-a": "F" },
      }),
      store.add(new TestStorageService()),
    ));
    const currentDisplayModel = currentService.getPlotDisplayModel({});

    assert.equal(currentDisplayModel?.chart.plotYUnitLabel, "A");
    assert.deepEqual(currentDisplayModel?.unitControl?.yUnitOptions, [
      "A",
      "mA",
      "uA",
      "nA",
      "pA",
    ]);

    const capacitanceSnapshot = createSnapshot({
      "file-a": createFileRecord("file-a", "series-a", "A", "F"),
    });
    const capacitanceService = store.add(new PlotService(
      createSessionServiceStub(capacitanceSnapshot),
      createSettingsServiceStub({
        xUnitByFileId: {},
        yScaleByFileId: {},
        yUnitByFileId: { "file-a": "pF" },
      }),
      store.add(new TestStorageService()),
    ));
    const capacitanceDisplayModel = capacitanceService.getPlotDisplayModel({});

    assert.equal(capacitanceDisplayModel?.chart.plotYUnitLabel, "pF");
    assert.deepEqual(capacitanceDisplayModel?.unitControl?.yUnitOptions, [
      "F",
      "mF",
      "uF",
      "nF",
      "pF",
    ]);

    const frequencySnapshot = createSnapshot({
      "file-a": createFileRecord("file-a", "series-a", "A", "F", "Hz"),
    });
    const frequencyService = store.add(new PlotService(
      createSessionServiceStub(frequencySnapshot),
      createSettingsServiceStub({
        xUnitByFileId: { "file-a": "kHz" },
        yScaleByFileId: {},
        yUnitByFileId: { "file-a": "pF" },
      }),
      store.add(new TestStorageService()),
    ));
    const frequencyDisplayModel = frequencyService.getPlotDisplayModel({});

    assert.equal(frequencyDisplayModel?.chart.plotXFactor, 1e-3);
    assert.equal(frequencyDisplayModel?.chart.plotXUnitLabel, "kHz");
    assert.equal(frequencyDisplayModel?.chart.plotYUnitLabel, "pF");
    assert.deepEqual(frequencyDisplayModel?.unitControl?.xUnitOptions, [
      "Hz",
      "kHz",
      "MHz",
      "GHz",
    ]);

    const invalidFrequencyService = store.add(new PlotService(
      createSessionServiceStub(createSnapshot({
        "file-a": createFileRecord("file-a", "series-a", "A", "F", "V"),
      })),
      createSettingsServiceStub({
        xUnitByFileId: { "file-a": "kHz" },
        yScaleByFileId: {},
        yUnitByFileId: { "file-a": "pF" },
      }),
      store.add(new TestStorageService()),
    ));
    const invalidFrequencyDisplayModel = invalidFrequencyService.getPlotDisplayModel({});
    assert.equal(invalidFrequencyDisplayModel?.chart.plotXUnitLabel, "V");
    assert.deepEqual(invalidFrequencyDisplayModel?.unitControl?.xUnitOptions, [
      "V",
      "mV",
      "uV",
      "kV",
    ]);

    const gmDisplayModel = currentService.getPlotDisplayModel({
      plotType: "gm",
    });

    assert.equal(gmDisplayModel?.chart.plotYUnitLabel, undefined);
    assert.equal(gmDisplayModel?.unitControl?.yUnit, null);
    assert.deepEqual(gmDisplayModel?.unitControl?.yUnitOptions, []);
  });

  test("creates display models for the requested file", () => {
    const snapshot = createSnapshot({
      "file-a": createFileRecord(),
      "file-b": createFileRecord("file-b", "series-c", "C"),
    }, ["file-a", "file-b"]);
    const service = store.add(new PlotService(
      createSessionServiceStub(snapshot),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));
    const displayModel = service.getPlotDisplayModel({
      fileId: "file-b",
    });

    assert.equal(displayModel?.fileId, "file-b");
    assert.equal(displayModel?.chart.model.seriesList[0]?.id, "series-c");
    assert.equal(displayModel?.chart.model.seriesList[0]?.name, "C");
  });

  test("caches calculated data per file record and plot type", () => {
    const snapshot = createSnapshot();
    const service = store.add(new PlotService(
      createSessionServiceStub(snapshot),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));

    const first = service.getCalculatedData({
      fileId: "file-a",
      plotType: "iv",
    });
    const second = service.getCalculatedData({
      fileId: "file-a",
      plotType: "iv",
    });
    const differentPlot = service.getCalculatedData({
      fileId: "file-a",
      plotType: "gm",
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
        service.getCalculatedData({ fileId: "file-a", plotType: "iv" }),
        service.getCalculatedData({ fileId: "file-a", plotType: "iv" }),
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
	      runScheduledFrame(scheduledFrame);
      await Promise.resolve();
      await Promise.resolve();

      assert.ok(workerFile);
      assert.notEqual(workerFile, file);
      assert.deepEqual(workerFile.raw.tablesById, {});
      assert.deepEqual(workerFile.raw.tableOrder, []);
      assert.deepEqual(Object.keys(workerFile.curvesByKey), Object.keys(file.curvesByKey));
      assert.equal(
        service.getCachedCalculatedData({ fileId: "file-a", plotType: "iv" })?.signature,
        "worker-result",
      );
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      globalThis.Worker = originalWorker;
    }
  });

  test("reuses the background plot worker across serial prefetch requests", async () => {
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
    let workerCreateCount = 0;
    class TestWorker {
      public onerror: ((event: ErrorEvent) => void) | null = null;
      public onmessage: ((event: MessageEvent) => void) | null = null;

      constructor() {
        workerCreateCount += 1;
      }

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
        "file-a": createFileRecord("file-a", "series-a", "A"),
        "file-b": createFileRecord("file-b", "series-b", "B"),
      }, ["file-a", "file-b"]);
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));

      service.prefetchCalculatedData(["file-a"], "visible", "iv");
      scheduledFrames.shift()?.(0);
      assert.equal(workerCreateCount, 1);
      assert.equal(workerRecords[0]?.message.payload?.file?.id, "file-a");

      completeWorker(workerRecords[0]);
      await Promise.resolve();

      service.prefetchCalculatedData(["file-b"], "visible", "iv");
      scheduledFrames.shift()?.(0);

      assert.equal(workerCreateCount, 1);
      assert.equal(workerRecords[1]?.message.payload?.file?.id, "file-b");
      assert.equal(workerRecords[1]?.worker, workerRecords[0]?.worker);

      completeWorker(workerRecords[1]);
      await Promise.resolve();
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

      service.prefetchPlotDisplayModel({ fileId: "file-a", plotType: "iv" }, "active");
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
      service.prefetchPlotDisplayModel({ fileId: "file-a", plotType: "iv" }, "active");
      service.prefetchCalculatedData(["file-a"], "active", "iv");
      while (scheduledFrames.length) {
        scheduledFrames.shift()?.(0);
      }

      assert.equal(workerRecords.length, 1);
      assert.equal(service.getCachedCalculatedData({ fileId: "file-a", plotType: "iv" }), null);
      assert.equal(service.getCachedPlotDisplayModel({ fileId: "file-a", plotType: "iv" }), null);
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
        if (event.fileId) {
          events.push(event.fileId);
        }
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

      service.getCalculatedData({ fileId: "file-visible", plotType: "iv" });
      service.getCalculatedData({ fileId: "file-active", plotType: "iv" });

      service.prefetchPlotDisplayModel({
        fileId: "file-visible",
        plotType: "iv",
      }, "visible");
      scheduledFrames.shift()?.(0);

      assert.deepEqual(
        workerRecords.map(record => `${record.message.type}:${record.message.payload?.fileId}`),
        ["calculateDisplayModel:file-visible"],
      );

      service.prefetchPlotDisplayModel({
        fileId: "file-active",
        plotType: "iv",
      }, "active");
      scheduledFrames.shift()?.(0);

      const activeCached = service.getCachedPlotDisplayModel({
        fileId: "file-active",
        plotType: "iv",
      });
      assert.equal(activeCached?.fileId, "file-active");
      assert.equal(activeCached?.inspector, null);
      assert.deepEqual(
        workerRecords.map(record => `${record.message.type}:${record.message.payload?.fileId}`),
        ["calculateDisplayModel:file-visible"],
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

  test("caches hover chart display model immediately when calculated data is warm", () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    let scheduledFrameCount = 0;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      scheduledFrameCount += 1;
      return scheduledFrameCount;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;

    try {
      const snapshot = createSnapshot({
        "file-hover": createFileRecord("file-hover", "series-hover", "Hover"),
      }, ["file-hover"]);
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));
      const events: string[] = [];
      store.add(service.onDidChangePlotDisplayModelCache(event => {
        events.push(`${event.plotType}:${event.fileId ?? ""}`);
      }));

      service.getCalculatedData({ fileId: "file-hover", plotType: "iv" });
      service.prefetchPlotDisplayModel({
        fileId: "file-hover",
        plotType: "iv",
      }, "hover");

      const cached = service.getCachedPlotDisplayModel({
        fileId: "file-hover",
        plotType: "iv",
      });
      assert.equal(cached?.fileId, "file-hover");
      assert.equal(cached?.inspector, null);
      assert.deepEqual(events, ["iv:file-hover"]);
      assert.equal(scheduledFrameCount, 0);

      service.prefetchPlotDisplayModel({
        fileId: "file-hover",
        plotType: "iv",
      }, "hover");
      assert.equal(service.getCachedPlotDisplayModel({
        fileId: "file-hover",
        plotType: "iv",
      })?.inspector, null);
      assert.equal(scheduledFrameCount, 0);
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  test("batch prefetch skips cached and duplicate chart display targets in PlotService", async () => {
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
          readonly includeInspector?: boolean;
          readonly plotType?: string;
          readonly requestId?: number;
          readonly sessionVersion?: number;
        };
        readonly type?: string;
      };
      readonly worker: Worker;
    };
    const workerRecords: WorkerRecord[] = [];
    class TestWorker {
      public onmessage: ((event: MessageEvent) => void) | null = null;
      public onerror: ((event: ErrorEvent) => void) | null = null;
      public postMessage(message: WorkerRecord["message"]): void {
        workerRecords.push({
          message,
          worker: this as unknown as Worker,
        });
      }
      public terminate(): void {
        // no-op
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
        "file-a": createFileRecord("file-a", "series-a", "A"),
        "file-b": createFileRecord("file-b", "series-b", "B"),
      }, ["file-a", "file-b"]);
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));

      service.getCalculatedData({ fileId: "file-a", plotType: "iv" });
      service.getCalculatedData({ fileId: "file-b", plotType: "iv" });
      service.prefetchPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
      }, "active");
      service.prefetchPlotDisplayModels([
        { fileId: "file-a", plotType: "iv" },
        { fileId: "file-b", plotType: "iv" },
        { fileId: "file-b", plotType: "iv" },
      ], "visible");

      scheduledFrames.shift()?.(0);

      assert.deepEqual(
        workerRecords.map(record =>
          `${record.message.type}:${record.message.payload?.fileId}:${record.message.payload?.includeInspector}`,
        ),
        ["calculateDisplayModel:file-b:false"],
      );

      completeDisplayWorker(workerRecords[0]);
      await Promise.resolve();
      assert.equal(service.getCachedPlotDisplayModel({
        fileId: "file-b",
        plotType: "iv",
      })?.fileId, "file-b");
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      globalThis.Worker = originalWorker;
    }
  });

  test("warms active chart display model immediately when calculated data cache is cold", () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    let scheduledFrameCount = 0;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      scheduledFrameCount += 1;
      return scheduledFrameCount;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;

    try {
      const snapshot = createSnapshot({
        "file-active": createFileRecord("file-active", "series-active", "Active"),
      }, ["file-active"]);
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));
      const calculatedEvents: string[] = [];
      const displayEvents: string[] = [];
      store.add(service.onDidChangeCalculatedDataCache(event => {
        calculatedEvents.push(`${event.plotType}:${event.fileId ?? ""}`);
      }));
      store.add(service.onDidChangePlotDisplayModelCache(event => {
        displayEvents.push(`${event.plotType}:${event.fileId ?? ""}`);
      }));

      service.prefetchPlotDisplayModel({
        fileId: "file-active",
        plotType: "iv",
      }, "active");

      const calculated = service.getCachedCalculatedData({
        fileId: "file-active",
        plotType: "iv",
      });
      const cached = service.getCachedPlotDisplayModel({
        fileId: "file-active",
        plotType: "iv",
      });
      assert.equal(calculated?.source.fileId, "file-active");
      assert.equal(cached?.fileId, "file-active");
      assert.equal(cached?.inspector, null);
      assert.deepEqual(calculatedEvents, ["iv:file-active"]);
      assert.deepEqual(displayEvents, ["iv:file-active"]);
      assert.equal(scheduledFrameCount, 0);
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  test("keeps inspector display model prefetch behind active chart data", async () => {
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
          readonly includeInspector?: boolean;
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
    const completeDataWorker = (record: WorkerRecord): void => {
      const payload = record.message.payload;
      record.worker.onmessage?.({
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
    };

    try {
      globalThis.Worker = TestWorker as unknown as typeof Worker;
      const snapshot = createSnapshot({
        "file-a": createFileRecord("file-a", "series-a", "A"),
        "file-b": createFileRecord("file-b", "series-b", "B"),
        "file-c": createFileRecord("file-c", "series-c", "C"),
      }, ["file-a", "file-b", "file-c"]);
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));

      service.getCalculatedData({ fileId: "file-a", plotType: "iv" });
      service.getCalculatedData({ fileId: "file-b", plotType: "iv" });
      service.prefetchPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
      }, "active");
      service.prefetchPlotDisplayModel({
        fileId: "file-b",
        plotType: "iv",
      }, "active");
      service.prefetchPlotInspectorDisplayModel({
        fileId: "file-a",
        plotType: "iv",
      }, "active");
      service.prefetchPlotInspectorDisplayModel({
        fileId: "file-b",
        plotType: "iv",
      }, "active");

      scheduledFrames.shift()?.(0);

      assert.deepEqual(
        workerRecords.map(record =>
          `${record.message.type}:${record.message.payload?.fileId}:${record.message.payload?.includeInspector}`,
        ),
        ["calculateDisplayModel:file-b:true"],
      );

      service.prefetchCalculatedData(["file-c"], "active", "iv");
      scheduledFrames.shift()?.(0);

      assert.deepEqual(
        workerRecords.map(record =>
          `${record.message.type}:${record.message.payload?.fileId ?? record.message.payload?.file?.id}`,
        ),
        [
          "calculateDisplayModel:file-b",
          "calculateData:file-c",
        ],
      );

      completeDisplayWorker(workerRecords[0]);
      completeDataWorker(workerRecords[1]);
      await Promise.resolve();
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      globalThis.Worker = originalWorker;
    }
  });

  test("does not starve active inspector prefetch behind visible display work", async () => {
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
          readonly includeInspector?: boolean;
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

      service.getCalculatedData({ fileId: "file-visible", plotType: "iv" });
      service.getCalculatedData({ fileId: "file-active", plotType: "iv" });
      service.prefetchPlotDisplayModel({
        fileId: "file-visible",
        plotType: "iv",
      }, "visible");

      scheduledFrames.shift()?.(0);
      assert.deepEqual(
        workerRecords.map(record =>
          `${record.message.type}:${record.message.payload?.fileId}:${record.message.payload?.includeInspector}`,
        ),
        ["calculateDisplayModel:file-visible:false"],
      );

      service.prefetchPlotDisplayModel({
        fileId: "file-active",
        plotType: "iv",
      }, "active");
      service.prefetchPlotInspectorDisplayModel({
        fileId: "file-active",
        plotType: "iv",
      }, "active");
      scheduledFrames.shift()?.(0);

      assert.deepEqual(
        workerRecords.map(record =>
          `${record.message.type}:${record.message.payload?.fileId}:${record.message.payload?.includeInspector}`,
        ),
        [
          "calculateDisplayModel:file-visible:false",
          "calculateDisplayModel:file-active:true",
        ],
      );

      completeDisplayWorker(workerRecords[1]);
      await Promise.resolve();
      assert.ok(service.getCachedPlotDisplayModel({
        fileId: "file-active",
        plotType: "iv",
      })?.inspector);

      completeDisplayWorker(workerRecords[0]);
      await Promise.resolve();
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      globalThis.Worker = originalWorker;
    }
  });

  test("cancels queued inspector display model prefetch work", () => {
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
          readonly includeInspector?: boolean;
        };
        readonly type?: string;
      };
    };
    const workerRecords: WorkerRecord[] = [];
    class TestWorker {
      public onerror: ((event: ErrorEvent) => void) | null = null;
      public onmessage: ((event: MessageEvent) => void) | null = null;

      public postMessage(message: WorkerRecord["message"]): void {
        workerRecords.push({ message });
      }

      public terminate(): void {
        return;
      }
    }

    try {
      globalThis.Worker = TestWorker as unknown as typeof Worker;
      const snapshot = createSnapshot({
        "file-active": createFileRecord("file-active", "series-active", "Active"),
      }, ["file-active"]);
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));

      service.getCalculatedData({ fileId: "file-active", plotType: "iv" });
      service.prefetchPlotInspectorDisplayModel({
        fileId: "file-active",
        plotType: "iv",
      }, "active");
      service.cancelQueuedPlotInspectorDisplayModelPrefetch();
      scheduledFrames.shift()?.(0);

      assert.deepEqual(workerRecords, []);
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
      });
      service.prefetchPlotDisplayModel({
        fileId: "file-active",
        plotType: "iv",
      }, "active");
      service.prefetchPlotInspectorDisplayModel({
        fileId: "file-active",
        plotType: "iv",
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
        "sliceRunChanged",
        2,
        { fileIds: ["file-other"] },
      ));

      assert.equal(plotStateChanges, 0);

      completeDisplayWorker(workerRecords[0]);
      await Promise.resolve();

      assert.ok(service.getCachedPlotDisplayModel({
        fileId: "file-active",
        plotType: "iv",
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
        service.getCachedCalculatedData({ fileId: "file-a", plotType: "iv" })?.signature,
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

      service.getCalculatedData({ fileId: "file-a", plotType: "iv" });
      service.prefetchPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
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

      service.getCalculatedData({ fileId: "file-a", plotType: "iv" });
      service.prefetchPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
      }, "visible");
      scheduledFrames.shift()?.(0);
      assert.deepEqual(
        workerRecords.map(record => `${record.message.type}:${record.message.payload?.sessionVersion}`),
        ["calculateDisplayModel:1"],
      );

      completeDisplayWorker(workerRecords[0]);
      await Promise.resolve();
      scheduledFrames.shift()?.(0);
      assert.deepEqual(
        workerRecords.map(record => `${record.message.type}:${record.message.payload?.sessionVersion}`),
        [
          "calculateDisplayModel:1",
          "calculateDisplayModel:2",
        ],
      );

      service.prefetchPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
      }, "visible");
      scheduledFrames.shift()?.(0);
      assert.equal(workerRecords.length, 2);

      completeDisplayWorker(workerRecords[1]);
      await Promise.resolve();
      assert.ok(service.getCachedPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
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
      }, "visible");

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
      const calculatedEvents: Array<{ fileId?: string; plotType: string }> = [];
      const displayEvents: Array<{ fileId?: string; plotType: string }> = [];
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
    }), null);

    const calculated = service.getCalculatedData({
      fileId: "file-a",
      plotType: "iv",
    });

    assert.ok(calculated);
    assert.equal(service.getCachedCalculatedData({
      fileId: "file-a",
      plotType: "iv",
    }), calculated);
  });

  test("reads resource slice calculated data by target without a synthetic file id", () => {
    const target: SliceResourceTarget = {
      resource: URI.file("/workspace/data/transfer.csv"),
      sheetId: "Sheet 1",
    };
    const result = createSliceResourceResult(target);
    const service = store.add(new PlotService(
      createSessionServiceStub(createSnapshot({}, [])),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
      createSliceServiceStub([result]),
    ));

    const calculated = service.getCalculatedData({
      plotType: "iv",
      target,
    });

    assert.ok(calculated);
    assert.equal(calculated.source.inputKind, "sliceUri");
    assert.equal(calculated.seriesList[0]?.name, "A");
    assert.equal(service.getCachedCalculatedData({
      plotType: "iv",
      target,
    }), calculated);
  });

  test("reads and prefetches resource slice targets without a session snapshot", () => {
    const target: SliceResourceTarget = {
      resource: URI.file("/workspace/data/transfer.csv"),
      sheetId: "Sheet 1",
    };
    let snapshotReads = 0;
    const service = store.add(new PlotService(
      {
        ...createSessionServiceStub(createSnapshot({}, [])),
        getSnapshot: () => {
          snapshotReads += 1;
          throw new Error("Resource plot target should not read Session.");
        },
      },
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
      createSliceServiceStub([createSliceResourceResult(target)]),
    ));

    const calculated = service.getCalculatedData({
      plotType: "iv",
      target,
    });
    const model = service.getPlotDisplayModel({
      plotType: "iv",
      target,
    });
    service.prefetchPlotDisplayModel({
      plotType: "iv",
      target,
    }, "active");
    service.prefetchPlotDisplayModels([{
      plotType: "iv",
      target,
    }], "visible");

    assert.ok(calculated);
    assert.ok(model);
    assert.ok(service.getCachedPlotDisplayModel({
      plotType: "iv",
      target,
    }));
    assert.equal(snapshotReads, 0);
  });

  test("preserves resource target on plot display contexts and state writes", async () => {
    const target: SliceResourceTarget = {
      resource: URI.file("/workspace/data/transfer.csv"),
      sheetId: "Sheet 1",
    };
    const service = store.add(new PlotService(
      createSessionServiceStub(createSnapshot({}, [])),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
      createSliceServiceStub([createSliceResourceResult(target)]),
    ));

    const model = service.getPlotDisplayModel({
      plotType: "iv",
      target,
    });
    const legend = service.getPlotLegendModel({
      plotType: "iv",
      target,
    });

    assert.ok(model);
    assert.ok(legend);
    assert.equal(model.target?.resource.toString(), target.resource.toString());
    assert.equal(model.target?.sheetId, target.sheetId);
    assert.equal(model.chart.xAxisTitleContext.target?.resource.toString(), target.resource.toString());
    assert.equal(model.chart.xAxisTitleContext.target?.sheetId, target.sheetId);
    assert.equal(legend.target?.resource.toString(), target.resource.toString());
    assert.equal(legend.target?.sheetId, target.sheetId);

    service.setAxisTitleOverride(model.chart.xAxisTitleContext, "Gate Bias", model.chart.defaultXAxisTitle);
    service.setLegendLabel({ target }, "series-a", "Renamed Series");
    await service.setAxisUnit({ target }, "x", "mV");
    await service.setYScale({ target }, "log");
    const updated = service.getPlotDisplayModel({
      plotType: "iv",
      target,
    });

    assert.equal(updated?.chart.xAxisTitle, "Gate Bias");
    assert.equal(updated?.chart.model.seriesList[0]?.name, "Renamed Series");
    assert.equal(updated?.unitControl?.xUnit, "mV");
    assert.equal(updated?.chart.yScaleMode, "log");

    service.toggleHiddenLegendKey({ target }, "iv", "series-a", ["series-a"]);
    assert.deepEqual(service.getHiddenLegendKeys({ target }, "iv", ["series-a"]), ["series-a"]);
  });

  test("session clears preserve resource target plot caches", () => {
    const sessionEvents = store.add(new Emitter<SessionChangeEvent>());
    const snapshot = createSnapshot();
    const target: SliceResourceTarget = {
      resource: URI.file("/workspace/data/transfer.csv"),
      sheetId: "Sheet 1",
    };
    const service = store.add(new PlotService(
      createSessionServiceStub(snapshot, sessionEvents.event),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
      createSliceServiceStub([createSliceResourceResult(target)]),
    ));
    let plotStateChanges = 0;
    const calculatedEvents: Array<{ readonly fileId?: string; readonly plotType: string }> = [];
    const displayEvents: Array<{ readonly fileId?: string; readonly plotType: string }> = [];
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
    });
    const uriModel = service.getPlotDisplayModel({
      plotType: "iv",
      target,
    });
    assert.ok(uriModel);
    calculatedEvents.length = 0;
    displayEvents.length = 0;

    sessionEvents.fire(createSessionChangeEvent("sessionCleared", 2));

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
    }), null);
    assert.strictEqual(service.getCachedPlotDisplayModel({
      plotType: "iv",
      target,
    })?.chart, uriModel.chart);
  });

  test("does not fall back to the first resource slice result without a target", () => {
    const target: SliceResourceTarget = {
      resource: URI.file("/workspace/data/transfer.csv"),
      sheetId: "Sheet 1",
    };
    const service = store.add(new PlotService(
      createSessionServiceStub(createSnapshot({}, [])),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
      createSliceServiceStub([createSliceResourceResult(target)]),
    ));

    assert.equal(service.getCalculatedData({ plotType: "iv" }), null);
    assert.equal(service.getCachedCalculatedData({ plotType: "iv" }), null);
    assert.equal(service.getCalculatedData({
      fileId: "/workspace/data/other.csv",
      plotType: "iv",
    }), null);
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
      }), null);
      assert.equal(curveReads, 0);

      service.getCalculatedData({
        fileId: "file-a",
        plotType: "iv",
      });

      assert.equal(service.getCachedPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
      }), null);

      service.prefetchPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
      }, "active");
      const immediatelyCached = service.getCachedPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
      });
      if (!immediatelyCached) {
        runScheduledFrame(scheduledFrame);
        await Promise.resolve();
      }

      assert.ok(immediatelyCached ?? service.getCachedPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
      }));
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      globalThis.Worker = originalWorker;
    }
  });

  test("bounds plot display model cache while keeping recently used targets", () => {
    const filesById: Record<string, FileRecord> = {};
    const fileOrder: string[] = [];
    for (let index = 0; index < 340; index += 1) {
      const fileId = `file-${index}`;
      filesById[fileId] = createFileRecord(fileId, `series-${index}`, `Series ${index}`);
      fileOrder.push(fileId);
    }

    const snapshot = createSnapshot(filesById, fileOrder);
    const service = store.add(new PlotService(
      createSessionServiceStub(snapshot),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));

    for (let index = 0; index < 320; index += 1) {
      assert.ok(service.getPlotDisplayModel({
        fileId: `file-${index}`,
        plotType: "iv",
      }));
    }

    assert.ok(service.getCachedPlotDisplayModel({
      fileId: "file-0",
      plotType: "iv",
    }));

    for (let index = 320; index < 340; index += 1) {
      assert.ok(service.getPlotDisplayModel({
        fileId: `file-${index}`,
        plotType: "iv",
      }));
    }

    assert.ok(service.getCachedPlotDisplayModel({
      fileId: "file-0",
      plotType: "iv",
    }));
    assert.equal(service.getCachedPlotDisplayModel({
      fileId: "file-1",
      plotType: "iv",
    }), null);
    assert.ok(service.getCachedPlotDisplayModel({
      fileId: "file-339",
      plotType: "iv",
    }));
  });

  test("evicts background display models before active hover visible and recent targets", async () => {
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

    const flushFrames = async (): Promise<void> => {
      let guard = 0;
      while (scheduledFrames.length && guard < 100) {
        guard += 1;
        scheduledFrames.shift()?.(0);
        await Promise.resolve();
      }
    };

    try {
      const filesById: Record<string, FileRecord> = {};
      const fileOrder: string[] = [];
      for (let index = 0; index < 242; index += 1) {
        const fileId = `file-${index}`;
        filesById[fileId] = createFileRecord(fileId, `series-${index}`, `Series ${index}`);
        fileOrder.push(fileId);
      }

      const snapshot = createSnapshot(filesById, fileOrder);
      const service = store.add(new PlotService(
        createSessionServiceStub(snapshot),
        createSettingsServiceStub(),
        store.add(new TestStorageService()),
      ));

      for (let index = 0; index < 236; index += 1) {
        assert.ok(service.getPlotDisplayModel({
          fileId: `file-${index}`,
          plotType: "iv",
        }));
      }

      service.getCalculatedData({ fileId: "file-236", plotType: "iv" });
      service.prefetchPlotDisplayModel({ fileId: "file-236", plotType: "iv" }, "visible");
      await flushFrames();

      service.getCalculatedData({ fileId: "file-237", plotType: "iv" });
      service.prefetchPlotDisplayModel({ fileId: "file-237", plotType: "iv" }, "recent");
      await flushFrames();

      for (const fileId of ["file-238", "file-239"]) {
        service.getCalculatedData({ fileId, plotType: "iv" });
        service.prefetchPlotDisplayModel({ fileId, plotType: "iv" }, "idle");
      }
      await flushFrames();

      service.prefetchPlotDisplayModel({ fileId: "file-240", plotType: "iv" }, "hover");

      service.getCalculatedData({ fileId: "file-241", plotType: "iv" });
      service.prefetchPlotDisplayModel({ fileId: "file-241", plotType: "iv" }, "idle");
      await flushFrames();

      assert.ok(service.getCachedPlotDisplayModel({ fileId: "file-0", plotType: "iv" }));
      assert.ok(service.getCachedPlotDisplayModel({ fileId: "file-236", plotType: "iv" }));
      assert.ok(service.getCachedPlotDisplayModel({ fileId: "file-237", plotType: "iv" }));
      assert.ok(service.getCachedPlotDisplayModel({ fileId: "file-240", plotType: "iv" }));
      assert.equal(service.getCachedPlotDisplayModel({ fileId: "file-238", plotType: "iv" }), null);
      assert.equal(service.getCachedPlotDisplayModel({ fileId: "file-239", plotType: "iv" }), null);
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      globalThis.Worker = originalWorker;
    }
  });

  test("publishes chart display model separately from inspector display model", async () => {
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
      const events: Array<{ fileId?: string; pane?: string; plotType: string }> = [];
      store.add(service.onDidChangePlotDisplayModelCache(event => {
        events.push(event);
      }));

      service.getCalculatedData({
        fileId: "file-a",
        plotType: "iv",
      });
      service.prefetchPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
      }, "active");

      const chartOnly = service.getCachedPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
      });
      assert.ok(chartOnly?.chart.model);
      assert.equal(chartOnly?.inspector, null);
      assert.deepEqual(events, [
        { fileId: "file-a", pane: "chart", plotType: "iv" },
      ]);

      service.prefetchPlotInspectorDisplayModel({
        fileId: "file-a",
        plotType: "iv",
      }, "active");
      scheduledFrames.shift()?.(0);
      await Promise.resolve();

      const full = service.getCachedPlotDisplayModel({
        fileId: "file-a",
        plotType: "iv",
      });
      assert.ok(full?.inspector?.model);
      assert.ok(service.getCachedPlotInspectorDisplayModel({
        fileId: "file-a",
        plotType: "iv",
      }));
      assert.deepEqual(events, [
        { fileId: "file-a", pane: "chart", plotType: "iv" },
        { fileId: "file-a", pane: "inspector", plotType: "iv" },
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
    const events: Array<{ fileId?: string; plotType: string }> = [];
    store.add(service.onDidChangeCalculatedDataCache(event => {
      events.push(event);
    }));

    service.getCalculatedData({
      fileId: "file-a",
      plotType: "iv",
    });
    service.getCalculatedData({
      fileId: "file-a",
      plotType: "iv",
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
	      runScheduledFrame(scheduledFrame);
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
	      runScheduledFrame(scheduledFrame);
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
    const initial = service.getPlotDisplayModel({});
    assert.equal(initial?.chart.xAxisTitle, "Gate");

    service.setAxisTitleOverride(
      initial!.chart.xAxisTitleContext,
      "Custom X",
      initial!.chart.defaultXAxisTitle,
    );
    const edited = service.getPlotDisplayModel({});
    assert.equal(edited?.chart.xAxisTitle, "Custom X");
    assert.ok(edited?.inspector);
    assert.equal(edited.inspector.xAxisTitle, "Gate");

    service.setAxisTitleOverride(
      initial!.chart.xAxisTitleContext,
      initial!.chart.defaultXAxisTitle,
      initial!.chart.defaultXAxisTitle,
    );
    const restored = service.getPlotDisplayModel({});
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

  test("owns legend visibility by file and plot type", () => {
    const service = store.add(new PlotService(
      createSessionServiceStub(),
      createSettingsServiceStub(),
      store.add(new TestStorageService()),
    ));

    service.toggleHiddenLegendKey("file-a", "iv", "series-b", ["series-a", "series-b"]);
    service.toggleHiddenLegendKey("file-a", "gm", "series-c", ["series-c"]);

    assert.deepEqual(service.getHiddenLegendKeys("file-a", "iv", ["series-a", "series-b"]), ["series-b"]);
    assert.deepEqual(service.getHiddenLegendKeys("file-a", "gm", ["series-c"]), ["series-c"]);
    assert.deepEqual(service.getHiddenLegendKeys("file-a", "iv", ["series-a"]), []);
    assert.deepEqual(service.getState().hiddenLegendKeysByPlotKey, {
      "file-a:gm": ["series-c"],
      "file-a:iv": ["series-b"],
    });

    service.toggleHiddenLegendKey("file-a", "iv", "series-b", ["series-a", "series-b"]);

    assert.deepEqual(service.getHiddenLegendKeys("file-a", "iv", ["series-a", "series-b"]), []);
    assert.deepEqual(service.getState().hiddenLegendKeysByPlotKey, {
      "file-a:gm": ["series-c"],
    });
  });

  test("invalidates plot models only for plot-relevant session changes", () => {
    for (const reason of [
      "sliceRunChanged",
      "curvesChanged",
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
      "calculatedRecordsChanged",
      "metricsChanged",
      "metricInputsChanged",
      "fileMetadataChanged",
    ] satisfies SessionChangeReason[]) {
      assert.equal(
        shouldInvalidatePlotModelsForSessionChange(createSessionChangeEvent(reason, 1)),
        false,
        reason,
      );
    }
    assert.equal(
      shouldInvalidatePlotModelsForSessionChange(createSessionChangeEvent("curvesChanged", 1, {
        curveKeys: ["derived:gm:default:series-a" as CurveKey],
      })),
      false,
    );
    assert.equal(
      shouldInvalidatePlotModelsForSessionChange(createSessionChangeEvent("curvesChanged", 1, {
        curveKeys: ["base:iv:transfer:series-a" as CurveKey],
      })),
      true,
    );
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

const runScheduledFrame = (callback: FrameRequestCallback | null): void => {
  assert.ok(callback);
  callback(0);
};

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
  commitCalculatedRecordsBatch: () => undefined,
  commitCurves: () => undefined,
  commitCurvesBatch: () => undefined,
  commitFileImport: () => ({
    importedFileIds: [],
    skippedDuplicateFileIds: [],
  }),
  commitMetrics: () => undefined,
  commitMetricsBatch: () => undefined,
  commitSliceRuns: () => undefined,
  getSnapshot: () => snapshot,
  renameFile: () => false,
  removeFiles: () => undefined,
  setMetricInput: () => undefined,
});

const createSliceServiceStub = (
  results: readonly SliceResourceResult[] = [],
): ISliceService => ({
  _serviceBrand: undefined,
  cancelResource: () => undefined,
  getState: () => ({
    queueLength: 0,
    templateSelections: [],
  }),
  getResourceResult: target => results.find(result =>
    result.target.resource.toString() === target.resource.toString() &&
    String(result.target.sheetId ?? "") === String(target.sheetId ?? "")
  ) ?? null,
  getResourceState: () => undefined,
  onDidChangeSliceState: Event.None as Event<void>,
  onDidChangeResourceSliceResult: Event.None as Event<SliceResourceTarget>,
  prioritizeResource: () => undefined,
  setTemplateSelection: () => undefined,
  submitResource: () => undefined,
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

const createSliceResourceResult = (
  target: SliceResourceTarget,
): SliceResourceResult => ({
  completedAt: 1,
  curves: [{
    curveFamily: "iv",
    curveGeneration: "base",
    ivMode: "transfer",
    lineage: {
      baseFamily: "iv",
      baseSeries: {
        resource: target.resource,
        sheetId: target.sheetId,
        seriesId: "series-a",
      },
      curveGeneration: "base",
      ivMode: "transfer",
    },
    points: [
      { x: 0, y: 0.001 },
      { x: 1, y: 0.002 },
    ],
    resource: target.resource,
    seriesId: "series-a",
    sheetId: target.sheetId,
    signature: "slice-curve-a",
  }],
  requestSignature: "request-a",
  run: {
    errors: [],
    id: "slice-uri-run-a",
    inputRanges: [{
      resource: target.resource,
      sheetId: target.sheetId,
      range: {
        endCol: 1,
        endRow: 1,
        startCol: 0,
        startRow: 0,
      },
    }],
    mode: "auto",
    outputCurveKeys: [],
    outputSeriesIds: ["series-a"],
    resource: target.resource,
    selection: { kind: "auto" },
    sheetId: target.sheetId,
    sourceContentSignature: "source-a",
    template: {
      blocks: [{
        legend: { target: "yColumn" },
        rowRange: { endRow: 1, startRow: 0 },
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
    resource: target.resource,
    sheetId: target.sheetId,
    y: [0.001, 0.002],
  }],
  sourceModelVersion: 1,
  sourceVersion: 1,
  target,
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
    latestSliceRunId: "run-a",
    sliceRunsById: {
      "run-a": {
        fileId,
        id: "run-a",
        mode: "auto",
        rawTableId: fileId,
        selection: { kind: "auto" },
        sourceRawTableVersion: 0,
        template: {
          schemaVersion: 1,
          name: "Template",
          version: 1,
          stopOnError: false,
          blocks: [{
            rowRange: { startRow: 0, endRow: 1 },
            x: { columns: [0], unit: xUnit },
            y: { columns: [1, 2], unit: yUnit },
            segmentation: { kind: "auto" },
            legend: { target: "auto" },
            titles: {
              bottom: "Gate",
              left: "Drain current",
            },
          }],
        },
        templateFingerprint: "config-a",
        inputRanges: [],
        outputCurveKeys: [
          curveAKey,
          curveBKey,
        ],
        outputSeriesIds: [seriesA, "series-b"],
        warnings: [],
        errors: [],
      },
    },
  };
};
