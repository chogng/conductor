/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  createCalculatedDataForFile,
  type CalculatedData,
} from "src/cs/workbench/services/calculation/common/calculationReadModel";
import {
  type PlotDisplayModel,
  type PlotFileAxisSettings,
  type PlotType,
} from "src/cs/workbench/services/plot/common/plot";
import { createPlotDisplayModelFromCalculatedData } from "src/cs/workbench/services/plot/browser/plotDisplayModel";
import type {
  FileId,
  FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import { hasFileRecordBaseCurves } from "src/cs/workbench/services/calculation/common/canonicalFileProjection";

export type PlotCalculatedDataWorkerRequest = {
  readonly payload?: {
    readonly file?: FileRecord;
    readonly fileId?: FileId;
    readonly plotType?: PlotType;
    readonly requestId?: number;
    readonly sessionVersion?: number;
  };
  readonly type: "calculateData";
};

export type PlotDisplayModelWorkerRequest = {
  readonly payload?: {
    readonly axisSettings?: PlotFileAxisSettings;
    readonly axisTitleOverridesByKey?: Readonly<Record<string, string>>;
    readonly calculatedData?: CalculatedData | null;
    readonly fileId?: FileId;
    readonly hiddenLegendKeys?: readonly string[];
    readonly includeInspector?: boolean;
    readonly legendLabels?: Readonly<Record<string, string>>;
    readonly plotType?: PlotType;
    readonly requestId?: number;
    readonly sessionVersion?: number;
  };
  readonly type: "calculateDisplayModel";
};

export type PlotWorkerRequest =
  | PlotCalculatedDataWorkerRequest
  | PlotDisplayModelWorkerRequest;

export type PlotCalculatedDataWorkerResult = {
  readonly payload: {
    readonly calculatedData: CalculatedData | null;
    readonly fileId: FileId;
    readonly plotType: PlotType;
    readonly requestId: number;
    readonly sessionVersion: number;
  };
  readonly type: "calculateDataResult";
};

export type PlotDisplayModelWorkerResult = {
  readonly payload: {
    readonly displayModel: PlotDisplayModel | null;
    readonly fileId: FileId;
    readonly plotType: PlotType;
    readonly requestId: number;
    readonly sessionVersion: number;
  };
  readonly type: "calculateDisplayModelResult";
};

export type PlotCalculatedDataWorkerError = {
  readonly payload: {
    readonly fileId: FileId | null;
    readonly message: string;
    readonly plotType: PlotType | null;
    readonly requestId: number;
    readonly sessionVersion: number;
  };
  readonly type: "workerError";
};

export type PlotCalculatedDataWorkerMessage =
  | PlotCalculatedDataWorkerResult
  | PlotDisplayModelWorkerResult
  | PlotCalculatedDataWorkerError;

const toInteger = (value: unknown, fallback: number): number => {
  const numberValue = Math.floor(Number(value));
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const postError = (
  payload: PlotWorkerRequest["payload"],
  error: unknown,
): void => {
  const message = error instanceof Error && error.message.trim()
    ? error.message
    : "Failed to calculate plot data.";

  self.postMessage({
    payload: {
      fileId: String(payload?.fileId ?? "").trim() || null,
      message,
      plotType: payload?.plotType ?? null,
      requestId: toInteger(payload?.requestId, 0),
      sessionVersion: toInteger(payload?.sessionVersion, 0),
    },
    type: "workerError",
  } satisfies PlotCalculatedDataWorkerError);
};

self.onmessage = (event: MessageEvent<PlotWorkerRequest>): void => {
  const message = event.data;
  if (message?.type !== "calculateData" && message?.type !== "calculateDisplayModel") {
    return;
  }

  const payload = message.payload;
  try {
    if (message.type === "calculateDisplayModel") {
      const displayPayload: PlotDisplayModelWorkerRequest["payload"] = message.payload;
      const calculatedData = displayPayload?.calculatedData ?? null;
      const fileId = String(displayPayload?.fileId ?? calculatedData?.source.fileId ?? "").trim();
      const plotType = displayPayload?.plotType ?? calculatedData?.kind;
      if (!fileId || !plotType) {
        throw new Error("Plot worker display request is missing file or plot type.");
      }

      self.postMessage({
        payload: {
          displayModel: createPlotDisplayModelFromCalculatedData({
            axisSettings: displayPayload?.axisSettings,
            axisTitleOverridesByKey: displayPayload?.axisTitleOverridesByKey,
            calculatedData,
            hiddenLegendKeys: displayPayload?.hiddenLegendKeys,
            includeInspector: displayPayload?.includeInspector,
            legendLabels: displayPayload?.legendLabels,
          }),
          fileId,
          plotType: plotType as PlotType,
          requestId: toInteger(displayPayload?.requestId, 0),
          sessionVersion: toInteger(displayPayload?.sessionVersion, 0),
        },
        type: "calculateDisplayModelResult",
      } satisfies PlotDisplayModelWorkerResult);
      return;
    }

    const calculatedPayload: PlotCalculatedDataWorkerRequest["payload"] = message.payload;
    const file = calculatedPayload?.file;
    const fileId = String(calculatedPayload?.fileId ?? file?.id ?? "").trim();
    const plotType = calculatedPayload?.plotType;
    if (!file || !fileId || !plotType) {
      throw new Error("Plot worker request is missing file or plot type.");
    }

    const calculatedData = hasFileRecordBaseCurves(file)
      ? createCalculatedDataForFile({ file, plotType })
      : null;

    self.postMessage({
      payload: {
        calculatedData,
        fileId,
        plotType,
        requestId: toInteger(calculatedPayload?.requestId, 0),
        sessionVersion: toInteger(calculatedPayload?.sessionVersion, 0),
      },
      type: "calculateDataResult",
    } satisfies PlotCalculatedDataWorkerResult);
  } catch (error) {
    postError(payload, error);
  }
};

const hasPlotWorkerBaseCurves = (file: FileRecord): boolean =>
  Object.values(file.curvesByKey).some(curve => curve.curveGeneration === "base");
