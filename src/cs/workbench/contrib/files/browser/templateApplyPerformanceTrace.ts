/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { getPerfNow } from "src/cs/workbench/common/perf";

const TRACE_STORAGE_KEY = "conductor.templateApplyPerformanceTrace";
const TRACE_QUERY_KEY = "conductorTemplateApplyPerformanceTrace";
const TRACE_CONSOLE_STORAGE_KEY = "conductor.templateApplyPerformanceTrace.console";

export type TemplateApplyPerformanceTraceMeta = Record<string, unknown>;

export type TemplateApplyPerformanceTraceEvent = {
  readonly id: number;
  readonly meta: TemplateApplyPerformanceTraceMeta;
  readonly stage: string;
  readonly timeOrigin: number;
  readonly timestamp: number;
  readonly wallTime: number;
};

export type TemplateApplyPerformanceTraceChartTarget = {
  readonly chartState: "none" | "queued" | "processing" | "ready" | "failed" | "skipped";
  readonly fileId: string;
  readonly fileName: string;
  readonly hasChartData: boolean;
  readonly index: number;
  readonly label: string;
  readonly rowIndex: number;
  readonly selected: boolean;
  readonly source: "trace-api";
};

export type TemplateApplyPerformanceTraceTargetApi = {
  readonly getChartTargets: () => readonly TemplateApplyPerformanceTraceChartTarget[];
  readonly getSelectedChartTargetFileId: () => string | null;
  readonly selectChartTarget: (fileId: string, reveal?: boolean | "force") => string | null;
  readonly setHoveredChartTarget: (fileId: string | null) => string | null;
};

type TemplateApplyPerformanceTraceGlobal = {
  enabled: boolean;
  events: TemplateApplyPerformanceTraceEvent[];
  mark: (stage: string, meta?: TemplateApplyPerformanceTraceMeta) => TemplateApplyPerformanceTraceEvent | null;
  reset: () => void;
  targetApi?: TemplateApplyPerformanceTraceTargetApi;
};

type TraceGlobalTarget = typeof globalThis & {
  __conductorTemplateApplyPerformanceTrace?: TemplateApplyPerformanceTraceGlobal;
};

const isTruthyFlag = (value: unknown): boolean => {
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
    return isTruthyFlag(new URLSearchParams(search).get(TRACE_QUERY_KEY));
  } catch {
    return false;
  }
};

export const isTemplateApplyPerformanceTraceEnabled = (): boolean =>
  isTruthyFlag(import.meta.env?.VITE_TEMPLATE_APPLY_PERFORMANCE_TRACE) ||
  readQueryFlag() ||
  readStorageFlag(TRACE_STORAGE_KEY);

const shouldLogTraceToConsole = (): boolean =>
  readStorageFlag(TRACE_CONSOLE_STORAGE_KEY);

const getTimeOrigin = (): number => {
  const timeOrigin = Number(globalThis.performance?.timeOrigin);
  return Number.isFinite(timeOrigin) ? timeOrigin : Date.now() - getPerfNow();
};

const getTraceGlobal = (): TemplateApplyPerformanceTraceGlobal => {
  const target = globalThis as TraceGlobalTarget;
  const existing = target.__conductorTemplateApplyPerformanceTrace;
  if (existing) {
    existing.enabled = isTemplateApplyPerformanceTraceEnabled();
    return existing;
  }

  let nextId = 1;
  const trace: TemplateApplyPerformanceTraceGlobal = {
    enabled: isTemplateApplyPerformanceTraceEnabled(),
    events: [],
    mark: (stage, meta = {}) => {
      if (!trace.enabled) {
        return null;
      }

      const event: TemplateApplyPerformanceTraceEvent = {
        id: nextId,
        meta: {
          ...readRendererMemorySnapshot(),
          ...meta,
        },
        stage,
        timeOrigin: getTimeOrigin(),
        timestamp: getPerfNow(),
        wallTime: Date.now(),
      };
      nextId += 1;
      trace.events.push(event);
      if (shouldLogTraceToConsole()) {
        console.info("[template-apply-performance-trace]", stage, event.meta);
      }
      return event;
    },
    reset: () => {
      nextId = 1;
      trace.events.length = 0;
      trace.enabled = isTemplateApplyPerformanceTraceEnabled();
    },
  };
  target.__conductorTemplateApplyPerformanceTrace = trace;
  return trace;
};

export const markTemplateApplyPerformanceTrace = (
  stage: string,
  meta: TemplateApplyPerformanceTraceMeta = {},
): TemplateApplyPerformanceTraceEvent | null => getTraceGlobal().mark(stage, meta);

export const resetTemplateApplyPerformanceTrace = (): void => {
  getTraceGlobal().reset();
};

export const registerTemplateApplyPerformanceTraceTargetApi = (
  api: TemplateApplyPerformanceTraceTargetApi,
): (() => void) => {
  const trace = getTraceGlobal();
  trace.targetApi = api;
  return () => {
    if (trace.targetApi === api) {
      delete trace.targetApi;
    }
  };
};

const readRendererMemorySnapshot = (): TemplateApplyPerformanceTraceMeta => {
  const memory = (globalThis.performance as Performance & {
    memory?: {
      jsHeapSizeLimit?: number;
      totalJSHeapSize?: number;
      usedJSHeapSize?: number;
    };
  } | undefined)?.memory;
  if (!memory) {
    return {};
  }

  return {
    jsHeapSizeLimit: Number(memory.jsHeapSizeLimit) || null,
    totalJSHeapSize: Number(memory.totalJSHeapSize) || null,
    usedJSHeapSize: Number(memory.usedJSHeapSize) || null,
  };
};
