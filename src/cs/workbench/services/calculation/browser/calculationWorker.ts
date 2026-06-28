/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  createCalculatedRecordsByFile,
} from "src/cs/workbench/services/calculation/common/calculationRecordBuilder";
import type { CalculationFileId } from "src/cs/workbench/services/calculation/common/calculation";
import type { SliceRun } from "src/cs/workbench/services/slice/common/slice";
import type {
  CurveRecord,
  MetricInputRecord,
  MetricRecord,
  SeriesRecord,
} from "src/cs/workbench/services/session/common/sessionModel";

type CalculationWorkerFileKind = "csv" | "excel" | "unknown";

export type CalculationWorkerFile = {
  readonly curvesByKey: Record<string, CurveRecord>;
  readonly id: CalculationFileId;
  readonly kind: CalculationWorkerFileKind;
  readonly latestSliceRunId?: string;
  readonly metricInputsByKey?: Record<string, MetricInputRecord>;
  readonly metricsByKey: Record<string, MetricRecord>;
  readonly name: string;
  readonly raw: {
    readonly fileId: CalculationFileId;
    readonly fileName: string;
    readonly tableOrder: string[];
    readonly tablesById: Record<string, never>;
  };
  readonly rawTableVersionsById: Record<string, number>;
  readonly seriesById: Record<string, SeriesRecord>;
  readonly seriesOrder: string[];
  readonly sliceRunsById?: Record<string, SliceRun>;
};

export type CalculationRecordsWorkerRequest = {
  readonly payload?: {
    readonly file?: CalculationWorkerFile;
    readonly fileId?: CalculationFileId;
    readonly requestId?: number;
    readonly sessionVersion?: number;
  };
  readonly type: "calculateRecords";
};

export type CalculationRecordsWorkerResult = {
  readonly payload: {
    readonly curves: readonly CurveRecord[];
    readonly fileId: CalculationFileId;
    readonly metrics: readonly MetricRecord[];
    readonly requestId: number;
    readonly sessionVersion: number;
  };
  readonly type: "calculateRecordsResult";
};

export type CalculationRecordsWorkerError = {
  readonly payload: {
    readonly fileId: CalculationFileId | null;
    readonly message: string;
    readonly requestId: number;
    readonly sessionVersion: number;
  };
  readonly type: "workerError";
};

export type CalculationRecordsWorkerMessage =
  | CalculationRecordsWorkerResult
  | CalculationRecordsWorkerError;

const toInteger = (value: unknown, fallback: number): number => {
  const numberValue = Math.floor(Number(value));
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const postError = (
  payload: CalculationRecordsWorkerRequest["payload"],
  error: unknown,
): void => {
  const message = error instanceof Error && error.message.trim()
    ? error.message
    : "Failed to calculate records.";

  self.postMessage({
    payload: {
      fileId: String(payload?.fileId ?? payload?.file?.id ?? "").trim() || null,
      message,
      requestId: toInteger(payload?.requestId, 0),
      sessionVersion: toInteger(payload?.sessionVersion, 0),
    },
    type: "workerError",
  } satisfies CalculationRecordsWorkerError);
};

self.onmessage = (event: MessageEvent<CalculationRecordsWorkerRequest>): void => {
  const message = event.data;
  if (message?.type !== "calculateRecords") {
    return;
  }

  const payload = message.payload;
  try {
    const file = payload?.file;
    const fileId = String(payload?.fileId ?? file?.id ?? "").trim();
    if (!file || !fileId) {
      throw new Error("Calculation worker request is missing file.");
    }

    const { curvesByFileId, metricsByFileId } = createCalculatedRecordsByFile(
      { [fileId]: file },
      [fileId],
    );
    self.postMessage({
      payload: {
        curves: curvesByFileId[fileId] ?? [],
        fileId,
        metrics: metricsByFileId[fileId] ?? [],
        requestId: toInteger(payload?.requestId, 0),
        sessionVersion: toInteger(payload?.sessionVersion, 0),
      },
      type: "calculateRecordsResult",
    } satisfies CalculationRecordsWorkerResult);
  } catch (error) {
    postError(payload, error);
  }
};
