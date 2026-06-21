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

export const getPerformanceNow = (): number => {
  const perf = globalThis.performance;
  return perf && typeof perf.now === "function" ? perf.now() : Date.now();
};

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
