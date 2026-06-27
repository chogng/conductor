/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type PerformanceMetaValue = boolean | number | string | null | undefined;
export type PerformanceMeta = Record<string, PerformanceMetaValue>;

export type PerformanceStageContext = {
  readonly measurement?: PerformanceMeta;
  readonly trace?: PerformanceMeta;
};

export type PerformanceStageState = {
  readonly measure: boolean;
  readonly trace: boolean;
};

export type PerformanceStageRecord = {
  readonly durationMs: number;
  readonly measurementMeta: PerformanceMeta;
  readonly stage: string;
  readonly state: PerformanceStageState;
  readonly traceMeta: PerformanceMeta;
};

export type PerformanceStageContextReader = (
  state: PerformanceStageState,
) => PerformanceStageContext;

export type PerformanceStageRecorderOptions = {
  readonly now?: () => number;
  readonly readContext: PerformanceStageContextReader;
  readonly readState: () => PerformanceStageState;
  readonly record: (record: PerformanceStageRecord) => void;
};

export type PerformanceStageEnd = (meta?: PerformanceMeta) => void;

export type PerformanceStageRecorder = {
  readonly start: (stage: string, meta?: PerformanceMeta) => PerformanceStageEnd;
};

export type PerformanceMark = {
  readonly name: string;
  readonly startTime: number;
};

type PerformanceMarkStore = {
  clearMarks(name?: string): void;
  getMarks(): readonly PerformanceMark[];
  mark(name: string, markOptions?: { readonly startTime?: number }): void;
};

type PerformanceMarkGlobal = typeof globalThis & {
  __conductorPerformanceMarks?: PerformanceMarkStore;
};

export const getPerformanceNow = (): number => {
  const perf = globalThis.performance;
  return perf && typeof perf.now === "function" ? perf.now() : Date.now();
};

export const mark = (
  name: string,
  markOptions?: { readonly startTime?: number },
): void => getPerformanceMarkStore().mark(name, markOptions);

export const clearMarks = (
  name?: string,
): void => getPerformanceMarkStore().clearMarks(name);

export const getMarks = (): readonly PerformanceMark[] =>
  getPerformanceMarkStore().getMarks();

export const createPerformanceStageRecorder = (
  options: PerformanceStageRecorderOptions,
): PerformanceStageRecorder => ({
  start: (
    stage: string,
    meta: PerformanceMeta = {},
  ): PerformanceStageEnd => startPerformanceStage(stage, meta, options),
});

const startPerformanceStage = (
  stage: string,
  meta: PerformanceMeta,
  options: PerformanceStageRecorderOptions,
): PerformanceStageEnd => {
  const state = options.readState();
  if (!state.measure && !state.trace) {
    return () => undefined;
  }

  const now = options.now ?? getPerformanceNow;
  const startedAt = now();
  const startContext = options.readContext(state);
  let ended = false;

  return (endMeta: PerformanceMeta = {}) => {
    if (ended) {
      return;
    }

    ended = true;
    const durationMs = now() - startedAt;
    const endContext = options.readContext(state);
    options.record({
      durationMs,
      measurementMeta: createMeasurementMeta(startContext, meta, endContext, endMeta, durationMs),
      stage,
      state,
      traceMeta: createTraceMeta(startContext, meta, endContext, endMeta, durationMs),
    });
  };
};

const createTraceMeta = (
  startContext: PerformanceStageContext,
  meta: PerformanceMeta,
  endContext: PerformanceStageContext,
  endMeta: PerformanceMeta,
  durationMs: number,
): PerformanceMeta => ({
  ...(startContext.trace ?? {}),
  ...meta,
  ...(endContext.trace ?? {}),
  ...endMeta,
  durationMs,
});

const createMeasurementMeta = (
  startContext: PerformanceStageContext,
  meta: PerformanceMeta,
  endContext: PerformanceStageContext,
  endMeta: PerformanceMeta,
  durationMs: number,
): PerformanceMeta => ({
  ...(startContext.measurement ?? {}),
  ...meta,
  ...(endContext.measurement ?? {}),
  ...endMeta,
  durationMs,
});

const getPerformanceMarkStore = (): PerformanceMarkStore => {
  const target = globalThis as PerformanceMarkGlobal;
  target.__conductorPerformanceMarks ??= createPerformanceMarkStore();
  return target.__conductorPerformanceMarks;
};

const createPerformanceMarkStore = (): PerformanceMarkStore => {
  const marks: PerformanceMark[] = [];
  return {
    clearMarks: (name?: string) => {
      clearNativePerformanceMarks(name);
      if (typeof name === "undefined") {
        marks.length = 0;
        return;
      }

      for (let index = marks.length - 1; index >= 0; index -= 1) {
        if (marks[index]?.name === name) {
          marks.splice(index, 1);
        }
      }
    },
    getMarks: () => marks.map(entry => ({ ...entry })),
    mark: (name, markOptions) => {
      markNativePerformance(name, markOptions);
      marks.push({
        name,
        startTime: normalizeMarkStartTime(markOptions?.startTime),
      });
    },
  };
};

const normalizeMarkStartTime = (startTime: number | undefined): number => {
  const normalized = Number(startTime);
  return Number.isFinite(normalized)
    ? normalized
    : getPerformanceNow();
};

const markNativePerformance = (
  name: string,
  markOptions?: { readonly startTime?: number },
): void => {
  const perf = globalThis.performance;
  if (!perf || typeof perf.mark !== "function") {
    return;
  }

  try {
    perf.mark(name, markOptions);
  } catch {
    // Performance marks are diagnostic-only and must never affect product flow.
  }
};

const clearNativePerformanceMarks = (name?: string): void => {
  const perf = globalThis.performance;
  if (!perf || typeof perf.clearMarks !== "function") {
    return;
  }

  try {
    perf.clearMarks(name);
  } catch {
    // Performance marks are diagnostic-only and must never affect product flow.
  }
};
