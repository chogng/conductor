/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { CalculatedData } from "src/cs/workbench/services/calculation/common/calculationReadModel";
import type {
  PlotDisplayModel,
  PlotType,
} from "src/cs/workbench/services/plot/common/plot";
import type {
  PlotCalculatedDataWorkerMessage,
  PlotCalculatedDataWorkerRequest,
  PlotDisplayModelWorkerRequest,
} from "src/cs/workbench/services/plot/browser/plotCalculatedDataWorker";
import type { FileAxisSettingsByFileId } from "src/cs/workbench/services/session/browser/fileSemanticsSync";
import type {
  FileId,
  FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";

const PLOT_CALCULATED_DATA_WORKER_TIMEOUT_MS = 15_000;

export type PlotCalculatedDataWorkerInput = {
  readonly file: FileRecord;
  readonly plotType: PlotType;
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
  if (typeof globalThis.Worker !== "function") {
    return Promise.resolve(null);
  }

  let worker: Worker;
  try {
    worker = new Worker(new URL("./plotCalculatedDataWorker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return Promise.resolve(null);
  }

  return new Promise<PlotCalculatedDataWorkerOutput | null>((resolve) => {
    let settled = false;
    const timeout = globalThis.setTimeout(() => {
      finish(null);
    }, PLOT_CALCULATED_DATA_WORKER_TIMEOUT_MS);

    const finish = (result: PlotCalculatedDataWorkerOutput | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timeout);
      worker.terminate();
      resolve(result);
    };

    worker.onmessage = (event: MessageEvent<PlotCalculatedDataWorkerMessage>) => {
      const message = event.data;
      if (
        message?.payload?.requestId !== input.requestId ||
        message.payload.sessionVersion !== input.sessionVersion
      ) {
        return;
      }

      if (message.type === "calculateDataResult") {
        finish(message.payload);
        return;
      }

      if (message.type === "workerError") {
        finish(null);
      }
    };
    worker.onerror = () => finish(null);
    worker.postMessage({
      payload: {
        file: input.file,
        fileId: input.file.id,
        plotType: input.plotType,
        requestId: input.requestId,
        sessionVersion: input.sessionVersion,
      },
      type: "calculateData",
    } satisfies PlotCalculatedDataWorkerRequest);
  });
};

export const calculatePlotDisplayModelInWorker = (
  input: PlotDisplayModelWorkerInput,
): Promise<PlotDisplayModelWorkerOutput | null> => {
  if (typeof globalThis.Worker !== "function") {
    return Promise.resolve(null);
  }

  let worker: Worker;
  try {
    worker = new Worker(new URL("./plotCalculatedDataWorker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return Promise.resolve(null);
  }

  return new Promise<PlotDisplayModelWorkerOutput | null>((resolve) => {
    let settled = false;
    const timeout = globalThis.setTimeout(() => {
      finish(null);
    }, PLOT_CALCULATED_DATA_WORKER_TIMEOUT_MS);

    const finish = (result: PlotDisplayModelWorkerOutput | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timeout);
      worker.terminate();
      resolve(result);
    };

    worker.onmessage = (event: MessageEvent<PlotCalculatedDataWorkerMessage>) => {
      const message = event.data;
      if (
        message?.payload?.requestId !== input.requestId ||
        message.payload.sessionVersion !== input.sessionVersion
      ) {
        return;
      }

      if (message.type === "calculateDisplayModelResult") {
        finish(message.payload);
        return;
      }

      if (message.type === "workerError") {
        finish(null);
      }
    };
    worker.onerror = () => finish(null);
    worker.postMessage({
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
    } satisfies PlotDisplayModelWorkerRequest);
  });
};
