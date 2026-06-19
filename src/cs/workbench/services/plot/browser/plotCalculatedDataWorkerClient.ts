/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { CalculatedData } from "src/cs/workbench/services/calculation/common/calculationReadModel";
import type {
  PlotDisplayModel,
  PlotCalculatedDataPrefetchPriority,
  PlotType,
} from "src/cs/workbench/services/plot/common/plot";
import type {
  PlotCalculatedDataWorkerMessage,
  PlotCalculatedDataWorkerRequest,
  PlotWorkerRequest,
  PlotDisplayModelWorkerRequest,
} from "src/cs/workbench/services/plot/browser/plotCalculatedDataWorker";
import type { FileAxisSettingsByFileId } from "src/cs/workbench/services/session/browser/fileSemanticsSync";
import type {
  FileId,
  FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import { getPerfNow, logPerf } from "src/cs/workbench/common/perf";

const PLOT_CALCULATED_DATA_WORKER_TIMEOUT_MS = 15_000;

type PlotWorkerLane = "background" | "interactive";
type PlotWorkerRequestKind = "calculateData" | "calculateDisplayModel";

export type PlotCalculatedDataWorkerInput = {
  readonly file: FileRecord;
  readonly plotType: PlotType;
  readonly priority?: PlotCalculatedDataPrefetchPriority;
  readonly requestId: number;
  readonly sessionVersion: number;
};

export type PlotCalculatedDataWorkerOutput = {
  readonly calculatedData: CalculatedData | null;
  readonly fileId: FileId;
  readonly plotType: PlotType;
  readonly requestId: number;
  readonly sessionVersion: number;
};

export type PlotDisplayModelWorkerInput = {
  readonly axisSettings?: FileAxisSettingsByFileId;
  readonly axisTitleOverridesByKey?: Readonly<Record<string, string>>;
  readonly calculatedData: CalculatedData;
  readonly fileId: FileId;
  readonly hiddenLegendKeys?: readonly string[];
  readonly includeInspector?: boolean;
  readonly legendLabels?: Readonly<Record<string, string>>;
  readonly plotType: PlotType;
  readonly priority?: PlotCalculatedDataPrefetchPriority;
  readonly requestId: number;
  readonly sessionVersion: number;
};

export type PlotDisplayModelWorkerOutput = {
  readonly displayModel: PlotDisplayModel | null;
  readonly fileId: FileId;
  readonly plotType: PlotType;
  readonly requestId: number;
  readonly sessionVersion: number;
};

export const calculatePlotDataInWorker = (
  input: PlotCalculatedDataWorkerInput,
): Promise<PlotCalculatedDataWorkerOutput | null> => {
  return requestPlotWorker({
    expectedResultType: "calculateDataResult",
    kind: "calculateData",
    lane: getPlotWorkerLane(input.priority),
    message: {
      payload: {
        file: createPlotWorkerFileRecord(input.file),
        fileId: input.file.id,
        plotType: input.plotType,
        requestId: input.requestId,
        sessionVersion: input.sessionVersion,
      },
      type: "calculateData",
    } satisfies PlotCalculatedDataWorkerRequest,
    requestId: input.requestId,
    sessionVersion: input.sessionVersion,
  });
};

const createPlotWorkerFileRecord = (file: FileRecord): FileRecord => {
  const latestTemplateRun = file.latestTemplateRunId
    ? file.templateRunsById[file.latestTemplateRunId]
    : undefined;
  const curvesByKey: FileRecord["curvesByKey"] = {};
  for (const [key, curve] of Object.entries(file.curvesByKey)) {
    if (curve.curveGeneration === "base") {
      curvesByKey[key] = curve;
    }
  }
  const curveSeriesIds = new Set(
    Object.values(curvesByKey).map(curve => curve.seriesId),
  );
  const seriesById: FileRecord["seriesById"] = {};
  for (const [seriesId, series] of Object.entries(file.seriesById)) {
    if (curveSeriesIds.has(seriesId)) {
      seriesById[seriesId] = series;
    }
  }

  const workerFile: FileRecord = {
    assessmentsByRawTableId: {},
    curvesByKey,
    id: file.id,
    kind: file.kind,
    measurementBlockOrder: [],
    measurementBlocksById: {},
    metricsByKey: {},
    name: file.name,
    raw: {
      fileId: file.raw.fileId,
      fileName: file.raw.fileName,
      tableOrder: [],
      tablesById: {},
    },
    rawTableVersionsById: {},
    seriesById,
    seriesOrder: file.seriesOrder.filter(seriesId => curveSeriesIds.has(seriesId)),
    templateRunsById: latestTemplateRun
      ? { [latestTemplateRun.id]: latestTemplateRun }
      : {},
  };
  if (latestTemplateRun) {
    workerFile.latestTemplateRunId = latestTemplateRun.id;
  }
  return workerFile;
};

export const calculatePlotDisplayModelInWorker = (
  input: PlotDisplayModelWorkerInput,
): Promise<PlotDisplayModelWorkerOutput | null> => {
  return requestPlotWorker({
    expectedResultType: "calculateDisplayModelResult",
    kind: "calculateDisplayModel",
    lane: getPlotWorkerLane(input.priority),
    message: {
      payload: {
        axisSettings: input.axisSettings,
        axisTitleOverridesByKey: input.axisTitleOverridesByKey,
        calculatedData: input.calculatedData,
        fileId: input.fileId,
        hiddenLegendKeys: input.hiddenLegendKeys,
        includeInspector: input.includeInspector,
        legendLabels: input.legendLabels,
        plotType: input.plotType,
        requestId: input.requestId,
        sessionVersion: input.sessionVersion,
      },
      type: "calculateDisplayModel",
    } satisfies PlotDisplayModelWorkerRequest,
    requestId: input.requestId,
    sessionVersion: input.sessionVersion,
  });
};

type ReusablePlotWorkerRequest = {
  readonly expectedResultType: "calculateDataResult" | "calculateDisplayModelResult";
  readonly kind: PlotWorkerRequestKind;
  readonly message: PlotWorkerRequest;
  readonly requestId: number;
  readonly resolve: (result: PlotCalculatedDataWorkerOutput | PlotDisplayModelWorkerOutput | null) => void;
  readonly sessionVersion: number;
};

const requestPlotWorker = <T extends PlotCalculatedDataWorkerOutput | PlotDisplayModelWorkerOutput>({
  expectedResultType,
  kind,
  lane,
  message,
  requestId,
  sessionVersion,
}: {
  readonly expectedResultType: ReusablePlotWorkerRequest["expectedResultType"];
  readonly kind: PlotWorkerRequestKind;
  readonly lane: PlotWorkerLane;
  readonly message: PlotWorkerRequest;
  readonly requestId: number;
  readonly sessionVersion: number;
}): Promise<T | null> => {
  if (typeof globalThis.Worker !== "function") {
    return Promise.resolve(null);
  }

  return new Promise<T | null>((resolve) => {
    plotWorkerLanes[lane].request({
      expectedResultType,
      kind,
      message,
      requestId,
      resolve: result => resolve(result as T | null),
      sessionVersion,
    });
  });
};

class ReusablePlotWorkerLane {
  private activeRequest: ReusablePlotWorkerRequest | null = null;
  private readonly queuedRequests: ReusablePlotWorkerRequest[] = [];
  private worker: Worker | null = null;
  private workerConstructor: typeof Worker | null = null;

  constructor(private readonly lane: PlotWorkerLane) {}

  public request(request: ReusablePlotWorkerRequest): void {
    const queueLengthBefore = this.queuedRequests.length;
    this.queuedRequests.push(request);
    logPerf("plotWorkerClient.enqueue", {
      kind: request.kind,
      lane: this.lane,
      queueLengthBefore,
      queueLengthAfter: this.queuedRequests.length,
    }, { silent: true });
    this.flush();
  }

  private flush(): void {
    if (this.activeRequest || !this.queuedRequests.length) {
      return;
    }

    const request = this.queuedRequests.shift()!;
    const worker = this.getOrCreateWorker();
    if (!worker) {
      request.resolve(null);
      this.flush();
      return;
    }

    const startedAt = getPerfNow();
    this.activeRequest = request;
    const timeout = globalThis.setTimeout(() => {
      this.finish(request, null, startedAt, "timeout");
      this.terminateWorker();
      this.flush();
    }, PLOT_CALCULATED_DATA_WORKER_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent<PlotCalculatedDataWorkerMessage>) => {
      const message = event.data;
      if (
        message?.payload?.requestId !== request.requestId ||
        message.payload.sessionVersion !== request.sessionVersion
      ) {
        return;
      }

      if (message.type === request.expectedResultType) {
        globalThis.clearTimeout(timeout);
        this.finish(request, message.payload, startedAt, "completed");
        this.flush();
        return;
      }

      if (message.type === "workerError") {
        globalThis.clearTimeout(timeout);
        this.finish(request, null, startedAt, "workerError");
        this.terminateWorker();
        this.flush();
      }
    };
    worker.onerror = () => {
      globalThis.clearTimeout(timeout);
      this.finish(request, null, startedAt, "error");
      this.terminateWorker();
      this.flush();
    };
    logPerf("plotWorkerClient.dispatch", {
      kind: request.kind,
      lane: this.lane,
      queueLength: this.queuedRequests.length,
    }, { silent: true });
    worker.postMessage(request.message);
  }

  private getOrCreateWorker(): Worker | null {
    const WorkerCtor = globalThis.Worker;
    if (this.worker && this.workerConstructor !== WorkerCtor) {
      this.terminateWorker();
    }
    if (this.worker) {
      return this.worker;
    }

    try {
      this.worker = new WorkerCtor(new URL("./plotCalculatedDataWorker.ts", import.meta.url), {
        type: "module",
      });
      this.workerConstructor = WorkerCtor;
      logPerf("plotWorkerClient.createWorker", {
        lane: this.lane,
      }, { silent: true });
      return this.worker;
    } catch {
      this.worker = null;
      this.workerConstructor = null;
      return null;
    }
  }

  private finish(
    request: ReusablePlotWorkerRequest,
    result: PlotCalculatedDataWorkerOutput | PlotDisplayModelWorkerOutput | null,
    startedAt: number,
    resultKind: string,
  ): void {
    if (this.activeRequest !== request) {
      return;
    }

    this.activeRequest = null;
    logPerf("plotWorkerClient.complete", {
      durationMs: getPerfNow() - startedAt,
      kind: request.kind,
      lane: this.lane,
      queueLength: this.queuedRequests.length,
      result: resultKind,
    }, { silent: true });
    request.resolve(result);
  }

  private terminateWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.workerConstructor = null;
  }
}

const plotWorkerLanes: Record<PlotWorkerLane, ReusablePlotWorkerLane> = {
  background: new ReusablePlotWorkerLane("background"),
  interactive: new ReusablePlotWorkerLane("interactive"),
};

const getPlotWorkerLane = (
  priority: PlotCalculatedDataPrefetchPriority | undefined,
): PlotWorkerLane =>
  priority === "active" || priority === "hover"
    ? "interactive"
    : "background";
