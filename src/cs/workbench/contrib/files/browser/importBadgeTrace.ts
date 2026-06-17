/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { getPerfNow } from "src/cs/workbench/common/perf";

const TRACE_STORAGE_KEY = "conductor.importBadgeTrace";
const TRACE_QUERY_KEY = "conductorImportBadgeTrace";
const TRACE_CONSOLE_STORAGE_KEY = "conductor.importBadgeTrace.console";

export type ImportBadgeTraceMeta = Record<string, unknown>;

export type ImportBadgeTraceEvent = {
  readonly id: number;
  readonly meta: ImportBadgeTraceMeta;
  readonly stage: string;
  readonly timeOrigin: number;
  readonly timestamp: number;
  readonly wallTime: number;
};

type ImportBadgeTraceGlobal = {
  enabled: boolean;
  events: ImportBadgeTraceEvent[];
  mark: (stage: string, meta?: ImportBadgeTraceMeta) => ImportBadgeTraceEvent | null;
  reset: () => void;
};

type TraceGlobalTarget = typeof globalThis & {
  __conductorImportBadgeTrace?: ImportBadgeTraceGlobal;
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

export const isImportBadgeTraceEnabled = (): boolean =>
  isTruthyFlag(import.meta.env?.VITE_IMPORT_BADGE_TRACE) ||
  readQueryFlag() ||
  readStorageFlag(TRACE_STORAGE_KEY);

const shouldLogTraceToConsole = (): boolean =>
  readStorageFlag(TRACE_CONSOLE_STORAGE_KEY);

const getTimeOrigin = (): number => {
  const timeOrigin = Number(globalThis.performance?.timeOrigin);
  return Number.isFinite(timeOrigin) ? timeOrigin : Date.now() - getPerfNow();
};

const getTraceGlobal = (): ImportBadgeTraceGlobal => {
  const target = globalThis as TraceGlobalTarget;
  const existing = target.__conductorImportBadgeTrace;
  if (existing) {
    existing.enabled = isImportBadgeTraceEnabled();
    return existing;
  }

  let nextId = 1;
  const trace: ImportBadgeTraceGlobal = {
    enabled: isImportBadgeTraceEnabled(),
    events: [],
    mark: (stage, meta = {}) => {
      if (!trace.enabled) {
        return null;
      }

      const event: ImportBadgeTraceEvent = {
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
        console.info("[import-badge-trace]", stage, event.meta);
      }
      return event;
    },
    reset: () => {
      nextId = 1;
      trace.events.length = 0;
      trace.enabled = isImportBadgeTraceEnabled();
    },
  };
  target.__conductorImportBadgeTrace = trace;
  return trace;
};

export const markImportBadgeTrace = (
  stage: string,
  meta: ImportBadgeTraceMeta = {},
): ImportBadgeTraceEvent | null => getTraceGlobal().mark(stage, meta);

export const resetImportBadgeTrace = (): void => {
  getTraceGlobal().reset();
};

const readRendererMemorySnapshot = (): ImportBadgeTraceMeta => {
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
