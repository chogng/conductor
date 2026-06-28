/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
  CalculationWorkerFile,
  CalculationRecordsWorkerMessage,
  CalculationRecordsWorkerRequest,
} from "src/cs/workbench/services/calculation/browser/calculationWorker";
import type { CalculationFileId } from "src/cs/workbench/services/calculation/common/calculation";
import type { SliceRun } from "src/cs/workbench/services/slice/common/slice";
import {
  type CurveRecord,
  type MetricInputRecord,
  type MetricRecord,
  type SeriesRecord,
} from "src/cs/workbench/services/session/common/sessionModel";

const CALCULATION_WORKER_TIMEOUT_MS = 30_000;

type CalculationWorkerSourceFile = {
  readonly curvesByKey: Readonly<Record<string, CurveRecord>>;
  readonly id: CalculationFileId;
  readonly kind: CalculationWorkerFile["kind"];
  readonly latestSliceRunId?: string;
  readonly metricInputsByKey?: Readonly<Record<string, MetricInputRecord>>;
  readonly name: string;
  readonly raw: {
    readonly fileId: CalculationFileId;
    readonly fileName: string;
  };
  readonly seriesById: Readonly<Record<string, SeriesRecord>>;
  readonly seriesOrder: readonly string[];
  readonly sliceRunsById?: Readonly<Record<string, SliceRun>>;
};

export type CalculationRecordsWorkerInput = {
  readonly file: CalculationWorkerSourceFile;
  readonly requestId: number;
  readonly sessionVersion: number;
};

export type CalculationRecordsWorkerOutput = {
  readonly curves: readonly CurveRecord[];
  readonly fileId: CalculationFileId;
  readonly metrics: readonly MetricRecord[];
  readonly requestId: number;
  readonly sessionVersion: number;
};

export const calculateRecordsInWorker = (
  input: CalculationRecordsWorkerInput,
): Promise<CalculationRecordsWorkerOutput | null> => {
  if (typeof globalThis.Worker !== "function") {
    return Promise.resolve(null);
  }

  let worker: Worker;
  try {
    worker = new Worker(new URL("./calculationWorker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return Promise.resolve(null);
  }

  return new Promise<CalculationRecordsWorkerOutput | null>((resolve) => {
    let settled = false;
    const timeout = globalThis.setTimeout(() => {
      finish(null);
    }, CALCULATION_WORKER_TIMEOUT_MS);

    const finish = (result: CalculationRecordsWorkerOutput | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timeout);
      worker.terminate();
      resolve(result);
    };

    worker.onmessage = (event: MessageEvent<CalculationRecordsWorkerMessage>) => {
      const message = event.data;
      if (
        message?.payload?.requestId !== input.requestId ||
        message.payload.sessionVersion !== input.sessionVersion
      ) {
        return;
      }

      if (message.type === "calculateRecordsResult") {
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
        file: createCalculationWorkerFile(input.file),
        fileId: input.file.id,
        requestId: input.requestId,
        sessionVersion: input.sessionVersion,
      },
      type: "calculateRecords",
    } satisfies CalculationRecordsWorkerRequest);
  });
};

const createCalculationWorkerFile = (
  file: CalculationWorkerSourceFile,
): CalculationWorkerFile => {
  const latestSliceRun = getLatestCalculationWorkerSliceRun(file);
  const curvesByKey: Record<string, CurveRecord> = {};
  for (const [key, curve] of Object.entries(file.curvesByKey)) {
    if (curve.curveGeneration === "base") {
      curvesByKey[key] = curve;
    }
  }
  const curveSeriesIds = new Set(
    Object.values(curvesByKey).map(curve => curve.seriesId),
  );
  const seriesById: Record<string, SeriesRecord> = {};
  for (const [seriesId, series] of Object.entries(file.seriesById)) {
    if (curveSeriesIds.has(seriesId)) {
      seriesById[seriesId] = series;
    }
  }

  const workerFile: CalculationWorkerFile = {
    curvesByKey,
    id: file.id,
    kind: file.kind,
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
  };
  if (file.metricInputsByKey) {
    workerFile.metricInputsByKey = file.metricInputsByKey;
  }
  if (latestSliceRun) {
    workerFile.latestSliceRunId = latestSliceRun.id;
    workerFile.sliceRunsById = {
      [latestSliceRun.id]: latestSliceRun,
    };
  }
  return workerFile;
};

const getLatestCalculationWorkerSliceRun = (
  file: Pick<CalculationWorkerSourceFile, "latestSliceRunId" | "sliceRunsById">,
): SliceRun | undefined => {
  const sliceRunId = file.latestSliceRunId;
  return sliceRunId ? file.sliceRunsById?.[sliceRunId] : undefined;
};
