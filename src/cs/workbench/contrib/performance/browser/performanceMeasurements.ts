/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  createPerformanceStageRecorder as createBasePerformanceStageRecorder,
  getPerformanceNow,
  type PerformanceMeta,
  type PerformanceMetaValue,
  type PerformanceStageContext,
  type PerformanceStageContextReader,
  type PerformanceStageRecord,
  type PerformanceStageRecorder,
} from "src/cs/base/common/performance";

export type {
  PerformanceStageContext,
  PerformanceStageContextReader,
  PerformanceStageEnd,
  PerformanceStageRecorder,
  PerformanceStageState,
} from "src/cs/base/common/performance";

const TRACE_STORAGE_KEY = "conductor.performanceTrace";
const TRACE_QUERY_KEY = "conductorPerformanceTrace";
const TRACE_CONSOLE_STORAGE_KEY = "conductor.performanceTrace.console";
const TRACE_ENTRY_LIMIT = 5_000;
const MEASUREMENT_SLOW_DURATION_MS = 16;

export type PerformanceMeasurementMetaValue = PerformanceMetaValue;
export type PerformanceMeasurementMeta = PerformanceMeta;

export type PerformanceTraceEvent = {
  readonly id: number;
  readonly meta: PerformanceMeasurementMeta;
  readonly stage: string;
  readonly timeOrigin: number;
  readonly timestamp: number;
  readonly wallTime: number;
};

export type PerformanceTraceReport = {
  readonly events: readonly PerformanceTraceEvent[];
  readonly generatedAt: number;
  readonly stages: Record<string, {
    readonly count: number;
    readonly maxDurationMs: number | null;
    readonly totalDurationMs: number;
  }>;
};

export type PerformanceStageMeasurement = {
  readonly averageDurationMs: number;
  readonly bodyCellRenderCount: number;
  readonly count: number;
  readonly fullRowsSyncCount: number;
  readonly gridChangedCount: number;
  readonly headerCellRenderCount: number;
  readonly ignoredRowsSyncCount: number;
  readonly maxDurationMs: number;
  readonly maxVisibleColumns: number;
  readonly maxVisibleRows: number;
  readonly patchedRowsSyncCount: number;
  readonly renderedTableCount: number;
  readonly secondLayoutCount: number;
  readonly slowCount: number;
  readonly totalDurationMs: number;
  readonly touchedCellCount: number;
};

export type PerformanceMeasurements = {
  readonly generatedAt: number;
  readonly sampleCount: number;
  readonly stages: Record<string, PerformanceStageMeasurement>;
};

type MutablePerformanceStageMeasurement = {
  bodyCellRenderCount: number;
  count: number;
  fullRowsSyncCount: number;
  gridChangedCount: number;
  headerCellRenderCount: number;
  ignoredRowsSyncCount: number;
  maxDurationMs: number;
  maxVisibleColumns: number;
  maxVisibleRows: number;
  patchedRowsSyncCount: number;
  renderedTableCount: number;
  secondLayoutCount: number;
  slowCount: number;
  totalDurationMs: number;
  touchedCellCount: number;
};

type PerformanceTraceGlobal = {
  enabled: boolean;
  events: PerformanceTraceEvent[];
  getReport: () => PerformanceTraceReport;
  mark: (stage: string, meta?: PerformanceMeasurementMeta) => PerformanceTraceEvent | null;
  reset: () => void;
};

type TraceGlobalTarget = typeof globalThis & {
  __conductorPerformanceTrace?: PerformanceTraceGlobal;
};

let measurementEnabled = false;
let measurementSampleCount = 0;
const stageMeasurements = new Map<string, MutablePerformanceStageMeasurement>();

const isTruthyFlag = (value: boolean | number | string | null | undefined): boolean => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on";
};

const readStorageFlag = (key: string): boolean => {
  try {
    return isTruthyFlag(globalThis.localStorage?.getItem(key));
  } catch {
    return false;
  }
};

const readQueryFlag = (): boolean => {
  try {
    const search = globalThis.location?.search ?? "";
    const params = new URLSearchParams(search);
    return isTruthyFlag(params.get(TRACE_QUERY_KEY));
  } catch {
    return false;
  }
};

export const isPerformanceTraceEnabled = (): boolean =>
  isTruthyFlag(import.meta.env?.VITE_PERFORMANCE_TRACE) ||
  readQueryFlag() ||
  readStorageFlag(TRACE_STORAGE_KEY);

export const isPerformanceMeasurementEnabled = (): boolean =>
  measurementEnabled;

export const isPerformanceInstrumentationEnabled = (): boolean =>
  isPerformanceTraceEnabled() || isPerformanceMeasurementEnabled();

export const setPerformanceMeasurementEnabled = (enabled: boolean): void => {
  measurementEnabled = enabled;
  if (!enabled) {
    clearPerformanceMeasurements();
  }
};

const shouldLogTraceToConsole = (): boolean =>
  readStorageFlag(TRACE_CONSOLE_STORAGE_KEY);

const getTimeOrigin = (): number => {
  const timeOrigin = Number(globalThis.performance?.timeOrigin);
  return Number.isFinite(timeOrigin) ? timeOrigin : Date.now() - getPerformanceNow();
};

const getTraceGlobal = (): PerformanceTraceGlobal => {
  const target = globalThis as TraceGlobalTarget;
  const existing = target.__conductorPerformanceTrace;
  if (existing) {
    existing.enabled = isPerformanceTraceEnabled();
    return existing;
  }

  let nextId = 1;
  const trace: PerformanceTraceGlobal = {
    enabled: isPerformanceTraceEnabled(),
    events: [],
    getReport: () => createReport(trace.events),
    mark: (stage, meta = {}) => {
      if (!trace.enabled) {
        return null;
      }

      const event: PerformanceTraceEvent = {
        id: nextId,
        meta: { ...meta },
        stage,
        timeOrigin: getTimeOrigin(),
        timestamp: getPerformanceNow(),
        wallTime: Date.now(),
      };
      nextId += 1;
      trace.events.push(event);
      if (trace.events.length > TRACE_ENTRY_LIMIT) {
        trace.events.splice(0, trace.events.length - TRACE_ENTRY_LIMIT);
      }
      if (shouldLogTraceToConsole()) {
        console.info("[performance-trace]", stage, event.meta);
      }
      return event;
    },
    reset: () => {
      nextId = 1;
      trace.events.length = 0;
      trace.enabled = isPerformanceTraceEnabled();
    },
  };
  target.__conductorPerformanceTrace = trace;
  return trace;
};

export const markPerformanceTrace = (
  stage: string,
  meta: PerformanceMeasurementMeta = {},
): PerformanceTraceEvent | null => getTraceGlobal().mark(stage, meta);

export const resetPerformanceTrace = (): void => {
  getTraceGlobal().reset();
};

export const getPerformanceTraceReport = (): PerformanceTraceReport =>
  getTraceGlobal().getReport();

export const startPerformanceMeasurement = (
  stage: string,
  traceMeta: PerformanceMeasurementMeta = {},
  measurementMeta: PerformanceMeasurementMeta = traceMeta,
): ((
  traceEndMeta?: PerformanceMeasurementMeta,
  measurementEndMeta?: PerformanceMeasurementMeta,
) => void) => {
  const shouldTrace = isPerformanceTraceEnabled();
  const shouldMeasure = isPerformanceMeasurementEnabled();
  if (!shouldTrace && !shouldMeasure) {
    return () => undefined;
  }

  const startedAt = getPerformanceNow();
  let ended = false;
  return (
    traceEndMeta: PerformanceMeasurementMeta = {},
    measurementEndMeta: PerformanceMeasurementMeta = traceEndMeta,
  ) => {
    if (ended) {
      return;
    }

    ended = true;
    const durationMs = getPerformanceNow() - startedAt;
    if (shouldMeasure) {
      recordPerformanceMeasurement(stage, {
        ...measurementMeta,
        ...measurementEndMeta,
        durationMs,
      });
    }
    if (shouldTrace) {
      markPerformanceTrace(stage, {
        ...traceMeta,
        ...traceEndMeta,
        durationMs,
      });
    }
  };
};

export const createPerformanceStageRecorder = (
  readContext: PerformanceStageContextReader,
): PerformanceStageRecorder => createBasePerformanceStageRecorder({
  readContext,
  readState: () => ({
    measure: isPerformanceMeasurementEnabled(),
    trace: isPerformanceTraceEnabled(),
  }),
  record: recordPerformanceStage,
});

export const getAndClearPerformanceMeasurements = (): PerformanceMeasurements | undefined => {
  if (measurementSampleCount === 0) {
    return undefined;
  }

  const stages: Record<string, PerformanceStageMeasurement> = {};
  for (const [stage, measurement] of stageMeasurements) {
    stages[stage] = {
      averageDurationMs: measurement.totalDurationMs / measurement.count,
      bodyCellRenderCount: measurement.bodyCellRenderCount,
      count: measurement.count,
      fullRowsSyncCount: measurement.fullRowsSyncCount,
      gridChangedCount: measurement.gridChangedCount,
      headerCellRenderCount: measurement.headerCellRenderCount,
      ignoredRowsSyncCount: measurement.ignoredRowsSyncCount,
      maxDurationMs: measurement.maxDurationMs,
      maxVisibleColumns: measurement.maxVisibleColumns,
      maxVisibleRows: measurement.maxVisibleRows,
      patchedRowsSyncCount: measurement.patchedRowsSyncCount,
      renderedTableCount: measurement.renderedTableCount,
      secondLayoutCount: measurement.secondLayoutCount,
      slowCount: measurement.slowCount,
      totalDurationMs: measurement.totalDurationMs,
      touchedCellCount: measurement.touchedCellCount,
    };
  }

  const result: PerformanceMeasurements = {
    generatedAt: Date.now(),
    sampleCount: measurementSampleCount,
    stages,
  };
  clearPerformanceMeasurements();
  return result;
};

const createReport = (
  events: readonly PerformanceTraceEvent[],
): PerformanceTraceReport => {
  const stages: PerformanceTraceReport["stages"] = {};
  for (const event of events) {
    const durationMs = Number(event.meta.durationMs);
    const current = stages[event.stage] ?? {
      count: 0,
      maxDurationMs: null,
      totalDurationMs: 0,
    };
    stages[event.stage] = {
      count: current.count + 1,
      maxDurationMs: Number.isFinite(durationMs)
        ? Math.max(current.maxDurationMs ?? 0, durationMs)
        : current.maxDurationMs,
      totalDurationMs: Number.isFinite(durationMs)
        ? current.totalDurationMs + durationMs
        : current.totalDurationMs,
    };
  }

  return {
    events: events.map(event => ({
      ...event,
      meta: { ...event.meta },
    })),
    generatedAt: Date.now(),
    stages,
  };
};

const clearPerformanceMeasurements = (): void => {
  measurementSampleCount = 0;
  stageMeasurements.clear();
};

const recordPerformanceMeasurement = (
  stage: string,
  meta: PerformanceMeasurementMeta,
): void => {
  const measurementMeta = toPerformanceMeasurementMeta(meta);
  const durationMs = readNonNegativeNumber(measurementMeta.durationMs);
  if (durationMs === null) {
    return;
  }

  const measurement = getStageMeasurement(stage);
  measurement.count += 1;
  measurement.totalDurationMs += durationMs;
  measurement.maxDurationMs = Math.max(measurement.maxDurationMs, durationMs);
  if (durationMs >= MEASUREMENT_SLOW_DURATION_MS) {
    measurement.slowCount += 1;
  }

  measurement.bodyCellRenderCount += readNonNegativeInteger(measurementMeta.bodyCellRenderCount);
  measurement.headerCellRenderCount += readNonNegativeInteger(measurementMeta.headerCellRenderCount);
  measurement.touchedCellCount += readNonNegativeInteger(measurementMeta.touchedCellCount);
  measurement.maxVisibleRows = Math.max(
    measurement.maxVisibleRows,
    readNonNegativeInteger(measurementMeta.visibleRows),
  );
  measurement.maxVisibleColumns = Math.max(
    measurement.maxVisibleColumns,
    readNonNegativeInteger(measurementMeta.visibleColumns),
  );

  if (measurementMeta.gridChanged === true) {
    measurement.gridChangedCount += 1;
  }
  if (measurementMeta.renderedTable === true) {
    measurement.renderedTableCount += 1;
  }
  if (measurementMeta.secondLayout === true) {
    measurement.secondLayoutCount += 1;
  }

  switch (measurementMeta.patchResult) {
    case "full":
      measurement.fullRowsSyncCount += 1;
      break;
    case "ignored":
      measurement.ignoredRowsSyncCount += 1;
      break;
    case "patched":
      measurement.patchedRowsSyncCount += 1;
      break;
  }

  measurementSampleCount += 1;
};

const recordPerformanceStage = (
  record: PerformanceStageRecord,
): void => {
  if (record.state.measure) {
    recordPerformanceMeasurement(record.stage, record.measurementMeta);
  }
  if (record.state.trace) {
    markPerformanceTrace(record.stage, record.traceMeta);
  }
};

const getStageMeasurement = (stage: string): MutablePerformanceStageMeasurement => {
  const existing = stageMeasurements.get(stage);
  if (existing) {
    return existing;
  }

  const measurement: MutablePerformanceStageMeasurement = {
    bodyCellRenderCount: 0,
    count: 0,
    fullRowsSyncCount: 0,
    gridChangedCount: 0,
    headerCellRenderCount: 0,
    ignoredRowsSyncCount: 0,
    maxDurationMs: 0,
    maxVisibleColumns: 0,
    maxVisibleRows: 0,
    patchedRowsSyncCount: 0,
    renderedTableCount: 0,
    secondLayoutCount: 0,
    slowCount: 0,
    totalDurationMs: 0,
    touchedCellCount: 0,
  };
  stageMeasurements.set(stage, measurement);
  return measurement;
};

const toPerformanceMeasurementMeta = (
  meta: PerformanceMeasurementMeta,
): PerformanceMeasurementMeta => {
  const measurementMeta: PerformanceMeasurementMeta = {};
  copyNumberMeta(meta, measurementMeta, "bodyCellRenderCount");
  copyNumberMeta(meta, measurementMeta, "durationMs");
  copyNumberMeta(meta, measurementMeta, "headerCellRenderCount");
  copyNumberMeta(meta, measurementMeta, "touchedCellCount");
  copyNumberMeta(meta, measurementMeta, "visibleColumns");
  copyNumberMeta(meta, measurementMeta, "visibleRows");
  copyBooleanMeta(meta, measurementMeta, "gridChanged");
  copyBooleanMeta(meta, measurementMeta, "renderedTable");
  copyBooleanMeta(meta, measurementMeta, "secondLayout");
  if (
    meta.patchResult === "full" ||
    meta.patchResult === "ignored" ||
    meta.patchResult === "patched"
  ) {
    measurementMeta.patchResult = meta.patchResult;
  }
  return measurementMeta;
};

const copyNumberMeta = (
  source: PerformanceMeasurementMeta,
  target: PerformanceMeasurementMeta,
  key: string,
): void => {
  if (readNonNegativeNumber(source[key]) !== null) {
    target[key] = source[key];
  }
};

const copyBooleanMeta = (
  source: PerformanceMeasurementMeta,
  target: PerformanceMeasurementMeta,
  key: string,
): void => {
  if (typeof source[key] === "boolean") {
    target[key] = source[key];
  }
};

const readNonNegativeNumber = (
  value: PerformanceMeasurementMetaValue,
): number | null => {
  if (value === null || value === undefined || typeof value === "boolean") {
    return null;
  }
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  return Math.max(0, number);
};

const readNonNegativeInteger = (
  value: PerformanceMeasurementMetaValue,
): number => {
  const number = readNonNegativeNumber(value);
  return number === null ? 0 : Math.round(number);
};
