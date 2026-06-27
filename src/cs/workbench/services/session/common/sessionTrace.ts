/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { isPerfEnabled, logPerf } from "src/cs/workbench/common/perf";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import {
  getLatestSliceRunRecord,
  type CurveRecord,
  type FileId,
  type FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";

export type SessionSnapshotTraceSummary = {
  readonly baseCurveCount: number;
  readonly curveCount: number;
  readonly derivedCurveCount: number;
  readonly fileCount: number;
  readonly fileOrderCount: number;
  readonly metricCount: number;
  readonly pointCount: number;
  readonly processedFileCount: number;
  readonly rawTableCount: number;
  readonly sampleFiles: readonly SessionSnapshotTraceFileSummary[];
  readonly schemaVersion: number;
  readonly seriesCount: number;
  readonly sessionVersion: number;
  readonly sliceRunCount: number;
};

export type SessionSnapshotTraceFileSummary = {
  readonly baseCurveCount: number;
  readonly curveCount: number;
  readonly fileId: FileId;
  readonly fileName: string;
  readonly latestSliceRunCurveCount: number;
  readonly latestSliceRunId: string | null;
  readonly pointCount: number;
  readonly rawTableCount: number;
  readonly seriesCount: number;
};

type SessionSnapshotTraceOptions = {
  readonly fileIds?: readonly unknown[];
  readonly force?: boolean;
  readonly sampleSize?: number;
};

const DEFAULT_SAMPLE_SIZE = 3;

type SessionSnapshotTraceAggregate = Omit<SessionSnapshotTraceSummary, "sampleFiles">;

type CachedSessionSnapshotTrace = {
  readonly aggregate: SessionSnapshotTraceAggregate;
  readonly fileSummariesById: ReadonlyMap<FileId, SessionSnapshotTraceFileSummary>;
};

// TODO(conductor-architecture): Legacy session trace.
// New table/file diagnostics should follow URI/resource-backed owners rather than expanding Session snapshot traces.
let cachedTraceSnapshot: SessionSnapshot | null = null;
let cachedTraceSummary: CachedSessionSnapshotTrace | null = null;

export const logSessionSnapshotTrace = (
  traceStage: string,
  snapshot: SessionSnapshot,
  meta: Record<string, unknown> = {},
  options: SessionSnapshotTraceOptions = {},
): SessionSnapshotTraceSummary | null => {
  if (!options.force && !isPerfEnabled()) {
    return null;
  }

  const summary = createSessionSnapshotTraceSummary(snapshot, options);
  logPerf(
    "session:snapshot",
    {
      ...meta,
      ...summary,
      traceStage,
    },
    { force: true },
  );
  return summary;
};

export const createSessionSnapshotTraceSummary = (
  snapshot: SessionSnapshot,
  options: SessionSnapshotTraceOptions = {},
): SessionSnapshotTraceSummary => {
  const cachedSummary = getCachedSessionSnapshotTrace(snapshot);
  return {
    ...cachedSummary.aggregate,
    sampleFiles: getSampleFileIds(snapshot, options)
      .map(fileId => cachedSummary.fileSummariesById.get(fileId))
      .filter((file): file is SessionSnapshotTraceFileSummary => Boolean(file)),
  };
};

const getCachedSessionSnapshotTrace = (
  snapshot: SessionSnapshot,
): CachedSessionSnapshotTrace => {
  if (cachedTraceSnapshot === snapshot && cachedTraceSummary) {
    return cachedTraceSummary;
  }

  const files = getOrderedFiles(snapshot);
  const fileSummariesById = new Map<FileId, SessionSnapshotTraceFileSummary>();
  let rawTableCount = 0;
  let seriesCount = 0;
  let curveCount = 0;
  let baseCurveCount = 0;
  let derivedCurveCount = 0;
  let pointCount = 0;
  let processedFileCount = 0;
  let metricCount = 0;
  let sliceRunCount = 0;

  for (const file of files) {
    const fileSummary = summarizeFileRecord(file);
    fileSummariesById.set(file.id, fileSummary);
    rawTableCount += fileSummary.rawTableCount;
    seriesCount += fileSummary.seriesCount;
    curveCount += fileSummary.curveCount;
    baseCurveCount += fileSummary.baseCurveCount;
    derivedCurveCount += fileSummary.curveCount - fileSummary.baseCurveCount;
    pointCount += fileSummary.pointCount;
    metricCount += Object.keys(file.metricsByKey).length;
    sliceRunCount += Object.keys(file.sliceRunsById ?? {}).length;
    if (fileSummary.baseCurveCount > 0) {
      processedFileCount += 1;
    }
  }

  const summary: CachedSessionSnapshotTrace = {
    aggregate: {
      baseCurveCount,
      curveCount,
      derivedCurveCount,
      fileCount: Object.keys(snapshot.filesById).length,
      fileOrderCount: snapshot.fileOrder.length,
      metricCount,
      pointCount,
      processedFileCount,
      rawTableCount,
      schemaVersion: snapshot.schemaVersion,
      seriesCount,
      sessionVersion: snapshot.sessionVersion,
      sliceRunCount,
    },
    fileSummariesById,
  };
  cachedTraceSnapshot = snapshot;
  cachedTraceSummary = summary;
  return summary;
};

const getOrderedFiles = (snapshot: SessionSnapshot): FileRecord[] =>
  uniqueStrings([
    ...snapshot.fileOrder,
    ...Object.keys(snapshot.filesById),
  ])
    .map(fileId => snapshot.filesById[fileId])
    .filter((file): file is FileRecord => Boolean(file));

const getSampleFileIds = (
  snapshot: SessionSnapshot,
  options: SessionSnapshotTraceOptions,
): FileId[] => {
  const sampleSize = normalizeSampleSize(options.sampleSize);
  const preferredFileIds = uniqueStrings((options.fileIds ?? []).map(normalizeId));
  return uniqueStrings([
    ...preferredFileIds,
    ...snapshot.fileOrder,
    ...Object.keys(snapshot.filesById),
  ]).slice(0, sampleSize);
};

const summarizeFileRecord = (file: FileRecord): SessionSnapshotTraceFileSummary => {
  const curves = Object.values(file.curvesByKey);
  const baseCurves = curves.filter(isBaseCurve);
  const latestSliceRun = getLatestSliceRunRecord(file);
  return {
    baseCurveCount: baseCurves.length,
    curveCount: curves.length,
    fileId: file.id,
    fileName: file.name || file.raw.fileName,
    latestSliceRunCurveCount: latestSliceRun?.outputCurveKeys.length ?? 0,
    latestSliceRunId: latestSliceRun?.id ?? null,
    pointCount: curves.reduce((count, curve) => count + curve.points.length, 0),
    rawTableCount: uniqueStrings([
      ...file.raw.tableOrder,
      ...Object.keys(file.raw.tablesById),
    ]).length,
    seriesCount: Object.keys(file.seriesById).length,
  };
};

const isBaseCurve = (curve: CurveRecord): boolean =>
  curve.curveGeneration === "base";

const normalizeSampleSize = (value: unknown): number => {
  const size = Number(value);
  return Number.isInteger(size) && size > 0 ? size : DEFAULT_SAMPLE_SIZE;
};

const normalizeId = (value: unknown): string => String(value ?? "").trim();

const uniqueStrings = (values: readonly string[]): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
};
