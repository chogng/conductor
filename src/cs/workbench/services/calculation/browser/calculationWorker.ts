/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  createCalculatedRecordsByFile,
} from "src/cs/workbench/services/calculation/common/calculationRecordBuilder";
import type {
  CurveRecord,
  FileId,
  FileRecord,
  MetricRecord,
} from "src/cs/workbench/services/session/common/sessionModel";

export type CalculationRecordsWorkerRequest = {
  readonly payload?: {
    readonly file?: FileRecord;
    readonly fileId?: FileId;
    readonly requestId?: number;
    readonly sessionVersion?: number;
  };
  readonly type: "calculateRecords";
};

export type CalculationRecordsWorkerResult = {
  readonly payload: {
    readonly curves: readonly CurveRecord[];
    readonly fileId: FileId;
    readonly metrics: readonly MetricRecord[];
    readonly requestId: number;
    readonly sessionVersion: number;
  };
  readonly type: "calculateRecordsResult";
};

export type CalculationRecordsWorkerError = {
  readonly payload: {
    readonly fileId: FileId | null;
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
    const fileId = String(payload?.fileId ?? file?.id ?? "").trim() as FileId;
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
