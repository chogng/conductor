/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  createParametersViewState,
  type ParametersFileRecord,
  type ParametersViewState,
} from "src/cs/workbench/services/parameters/common/parameterModel";
import { localize } from "src/cs/nls";
import { createCalculatedRecordsByFile } from "src/cs/workbench/services/calculation/common/calculationRecordBuilder";
import {
  IParametersService,
  type ParametersViewStateInput,
} from "src/cs/workbench/services/parameters/common/parameters";
import { ISessionService } from "src/cs/workbench/services/session/common/session";
import {
  ISliceService,
  type SliceResourceResult,
} from "src/cs/workbench/services/slice/common/slice";
import type {
  BaseCurveKey,
  BaseCurveRecord,
  FileRecord,
  MetricKey,
  MetricRecord,
  SeriesRecord,
} from "src/cs/workbench/services/session/common/sessionModel";

type ResolvedParametersViewStateInput = {
  readonly fileId: string | null;
  readonly fileRecord: ParametersFileRecord | null;
  readonly resource: URI | null;
  readonly resourceVersionKey: string | null;
  readonly sessionVersion: number | null;
  readonly sheetId: string | null;
};

export class ParametersService extends Disposable implements IParametersService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeParametersViewStateEmitter = this._register(new Emitter<ParametersViewState>());
  public readonly onDidChangeParametersViewState = this.onDidChangeParametersViewStateEmitter.event;

  private viewStateInputKey: string | null = null;
  private viewState: ParametersViewState = createDefaultParametersViewState();

  constructor(
    @ISessionService private readonly sessionService: ISessionService,
    @ISliceService private readonly sliceService: ISliceService,
  ) {
    super();
  }

  public getViewState(): ParametersViewState {
    return this.viewState;
  }

  public createViewState(input: ParametersViewStateInput): ParametersViewState {
    return this.createViewStateForResolvedInput(this.resolveViewStateInput(input));
  }

  public updateViewState(input: ParametersViewStateInput): ParametersViewState {
    const resolvedInput = this.resolveViewStateInput(input);
    const inputKey = createParametersViewStateInputKey(resolvedInput);
    if (this.viewStateInputKey === inputKey) {
      return this.viewState;
    }

    const viewState = this.createViewStateForResolvedInput(resolvedInput);
    this.viewStateInputKey = inputKey;
    this.viewState = viewState;
    this.onDidChangeParametersViewStateEmitter.fire(viewState);
    return viewState;
  }

  private resolveViewStateInput(input: ParametersViewStateInput): ResolvedParametersViewStateInput {
    const fileId = normalizeParametersFileId(input.fileId);
    const resource = input.resource ?? null;
    const sheetId = normalizeParametersSheetId(input.sheetId);
    if (resource) {
      const result = this.sliceService.getResourceResult(resource, sheetId);
      return {
        fileId,
        fileRecord: result ? createParametersFileRecordFromSliceResourceResult(result) : null,
        resource,
        resourceVersionKey: result ? createSliceResourceResultVersionKey(result) : null,
        sessionVersion: null,
        sheetId,
      };
    }

    const snapshot = this.sessionService.getSnapshot();
    return {
      fileId,
      fileRecord: fileId ? snapshot.filesById[fileId] ?? null : null,
      resource: null,
      resourceVersionKey: null,
      sessionVersion: snapshot.sessionVersion,
      sheetId: null,
    };
  }

  private createViewStateForResolvedInput(
    input: ResolvedParametersViewStateInput,
  ): ParametersViewState {
    return createParametersViewState(
      null,
      input.fileRecord,
    );
  }

}

const createDefaultParametersViewState = (): ParametersViewState => ({
  kind: "empty",
  message: localize("parameters.empty.noData", "No parameter data."),
});

const normalizeParametersFileId = (fileId: string | null | undefined): string | null => {
  const normalized = String(fileId ?? "").trim();
  return normalized || null;
};

const normalizeParametersSheetId = (sheetId: string | null | undefined): string | null => {
  const normalized = String(sheetId ?? "").trim();
  return normalized || null;
};

const createParametersViewStateInputKey = (input: ResolvedParametersViewStateInput): string => {
  const resourceKey = input.resource ? createResourceKey(input.resource) : "";
  if (resourceKey) {
    return [
      "resource",
      resourceKey,
      input.sheetId ?? "",
      input.resourceVersionKey ?? "",
    ].join("\0");
  }

  return [
    "session",
    String(input.fileId ?? ""),
    input.fileId ? String(input.sessionVersion ?? "") : "",
  ].join("\0");
};

const createParametersFileRecordFromSliceResourceResult = (
  result: SliceResourceResult,
): ParametersFileRecord => {
  const file = createSliceResourceParametersFileRecord(result);
  const calculatedRecords = createCalculatedRecordsByFile({ [file.id]: file }, [file.id]);
  const metrics = calculatedRecords.metricsByFileId[file.id] ?? [];
  const metricsByKey = Object.fromEntries(
    metrics.map(metric => [metric.key, metric]),
  ) as Record<string, MetricRecord>;
  const metricsBySeriesId = createMetricsBySeriesId(metrics);
  return {
    ...file,
    metricsByKey,
    metricsBySeriesId: Object.keys(metricsBySeriesId).length ? metricsBySeriesId : undefined,
  };
};

const createSliceResourceParametersFileRecord = (
  result: SliceResourceResult,
): FileRecord => {
  const fileId = createSliceResourceFileId(result.resource, result.sheetId);
  const seriesById = Object.fromEntries(
    result.series.map(series => [
      series.id,
      {
        fileId,
        groupIndex: series.groupIndex,
        id: series.id,
        labelOverride: series.labelOverride,
        legendValue: series.legendValue,
        name: series.name,
        sheetId: result.sheetId ?? undefined,
        y: series.y,
        yCol: series.yCol,
      } satisfies SeriesRecord,
    ]),
  );
  const curvesByKey = Object.fromEntries(
    result.curves.map(curve => {
      const key = createSliceResourceBaseCurveKey(curve);
      const record: BaseCurveRecord = {
        channels: curve.channels,
        curveFamily: curve.curveFamily,
        curveGeneration: "base",
        domain: curve.domain,
        fileId,
        itMode: curve.itMode ?? null,
        ivMode: curve.ivMode ?? null,
        lineage: {
          baseFamily: curve.curveFamily,
          baseSeries: {
            fileId,
            seriesId: curve.seriesId,
          },
          curveGeneration: "base",
          itMode: curve.itMode ?? null,
          ivMode: curve.ivMode ?? null,
        },
        points: curve.points,
        seriesId: curve.seriesId,
        signature: curve.signature,
      };
      return [key, record];
    }),
  );

  return {
    calculationCache: undefined,
    curvesByKey,
    id: fileId,
    kind: "unknown",
    metricInputsByKey: undefined,
    metricsByKey: {},
    name: getResourceFileName(result.resource) ?? fileId,
    raw: {
      fileId,
      fileName: getResourceFileName(result.resource) ?? fileId,
      tableOrder: [],
      tablesById: {},
    },
    rawTableVersionsById: {},
    seriesById,
    seriesOrder: result.series.map(series => series.id),
  };
};

const createMetricsBySeriesId = (
  metrics: readonly MetricRecord[],
): Record<string, MetricKey[]> => {
  const metricsBySeriesId: Record<string, MetricKey[]> = {};
  for (const metric of metrics) {
    metricsBySeriesId[metric.seriesId] = [
      ...(metricsBySeriesId[metric.seriesId] ?? []),
      metric.key,
    ];
  }
  return metricsBySeriesId;
};

const createSliceResourceBaseCurveKey = (
  curve: SliceResourceResult["curves"][number],
): BaseCurveKey => {
  const mode = curve.curveFamily === "iv"
    ? curve.ivMode ?? "default"
    : curve.curveFamily === "it"
      ? curve.itMode ?? "default"
      : "default";
  return `base:${curve.curveFamily}:${mode}:${curve.seriesId}` as BaseCurveKey;
};

const createSliceResourceResultVersionKey = (
  result: SliceResourceResult,
): string => [
  result.requestSignature,
  String(result.sourceModelVersion),
  String(result.sourceVersion),
  String(result.completedAt),
].join("\0");

const createSliceResourceFileId = (
  resource: URI,
  sheetId?: string | null,
): string => {
  const resourceKey = createResourceKey(resource);
  const normalizedSheetId = normalizeParametersSheetId(sheetId);
  return normalizedSheetId ? `${resourceKey}\0${normalizedSheetId}` : resourceKey;
};

const createResourceKey = (resource: URI): string =>
  resource.toString().replace(/\\/g, "/");

const getResourceFileName = (resource: URI): string | null => {
  const name = String(resource.path ?? "")
    .split(/[\\/]/)
    .filter(Boolean)
    .pop();
  return name ? name : null;
};

registerSingleton(IParametersService, ParametersService, InstantiationType.Delayed);
