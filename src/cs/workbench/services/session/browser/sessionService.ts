/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Browser implementation of the session data table. This is the only mutable
// owner for canonical imported files, table model, slice runs, curves, and metrics.
import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { startPerf } from "src/cs/workbench/common/perf";
import {
  createEmptySessionModel,
  type CurveGeneration,
  type CurveKey as SessionCurveKey,
  type CurveRecord,
  type FileId,
  type FileRecord,
  type MetricInputRecord,
  type MetricKey,
  type MetricRecord,
  type RawTableRef,
  type RawRecord,
  type RawTableRecord,
  type SeriesRecord,
  type TableRecord,
  type TableRowStoreRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  ISessionService,
  type CommitCalculatedRecordsBatchInput,
  type CommitFileImportResult,
  type CommitCurvesBatchInput,
  type CommitCurvesInput,
  type CommitMetricsBatchInput,
  type CommitMetricsInput,
  type FileImportResult,
  type ImportedFileRecord,
  type SessionSnapshot,
  type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";
import type {
  SliceCommit,
  SliceRun,
} from "src/cs/workbench/services/slice/common/slice";
import type {
  TemplateSelection,
} from "src/cs/workbench/services/slice/common/templateSelection";
import {
  createSessionChangeEvent,
  type SessionAffectedRecords,
  type SessionChangeEvent,
  type SessionChangeReason,
} from "src/cs/workbench/services/session/common/sessionEvents";
export class SessionService extends Disposable implements ISessionServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeSessionEmitter = this._register(new Emitter<SessionChangeEvent>());
  public readonly onDidChangeSession = this.onDidChangeSessionEmitter.event;

  private snapshot: SessionSnapshot = createEmptySessionModel();

  readonly setMetricInput = (input: MetricInputRecord): void => {
    const normalized = normalizeMetricInput(input);
    if (!normalized) {
      return;
    }

    const file = this.snapshot.filesById[normalized.fileId];
    if (!file) {
      return;
    }

    const current = file.metricInputsByKey?.[normalized.metricKey];
    if (isSameMetricInput(current, normalized)) {
      return;
    }

    this.replaceSnapshot({
      ...this.snapshot,
      filesById: {
        ...this.snapshot.filesById,
        [normalized.fileId]: {
          ...file,
          metricInputsByKey: {
            ...file.metricInputsByKey,
            [normalized.metricKey]: normalized,
          },
        },
      },
    }, "metricInputsChanged", {
      fileIds: [normalized.fileId],
      metricKeys: [normalized.metricKey],
      seriesIds: [normalized.seriesId],
    });
  };
  readonly clearMetricInput = (fileId: string, metricKey: MetricKey): void => {
    const normalizedFileId = normalizeId(fileId);
    const normalizedMetricKey = normalizeMetricKey(metricKey);
    const file = normalizedFileId ? this.snapshot.filesById[normalizedFileId] : undefined;
    if (!file || !normalizedMetricKey || !file.metricInputsByKey?.[normalizedMetricKey]) {
      return;
    }

    const metricInputsByKey = { ...file.metricInputsByKey };
    delete metricInputsByKey[normalizedMetricKey];
    this.replaceSnapshot({
      ...this.snapshot,
      filesById: {
        ...this.snapshot.filesById,
        [normalizedFileId]: {
          ...file,
          metricInputsByKey: Object.keys(metricInputsByKey).length
            ? metricInputsByKey
            : undefined,
        },
      },
    }, "metricInputsChanged", {
      fileIds: [normalizedFileId],
      metricKeys: [normalizedMetricKey],
    });
  };
  public getSnapshot = (): SessionSnapshot => {
    return this.snapshot;
  };

  public commitFileImport = (
    result: FileImportResult,
  ): CommitFileImportResult => {
    const importedRecords = result.files
      .map(createFileRecordFromImportedFile)
      .filter((record): record is FileRecord => Boolean(record));
    if (!importedRecords.length) {
      return EMPTY_FILE_IMPORT_COMMIT_RESULT;
    }

    const sourceFileIdsByKey = createSourceFileIdsByKey(this.snapshot.filesById, this.snapshot.fileOrder);
    const nextFilesById: Record<FileId, FileRecord> = { ...this.snapshot.filesById };
    let nextFileOrder = this.snapshot.fileOrder.filter(fileId => Boolean(nextFilesById[fileId]));
    const committedRecords: FileRecord[] = [];
    const skippedDuplicateFileIds: FileId[] = [];
    for (const record of importedRecords) {
      const rawIdentityKey = getRawSourceIdentityKey(record.raw);
      const duplicateFileId = rawIdentityKey ? sourceFileIdsByKey.get(rawIdentityKey) : undefined;
      if (duplicateFileId && duplicateFileId !== record.id) {
        skippedDuplicateFileIds.push(record.id);
        continue;
      }

      nextFilesById[record.id] = preserveRawTableVersionContinuity(
        record,
        nextFilesById[record.id],
      );
      if (!nextFileOrder.includes(record.id)) {
        nextFileOrder = [...nextFileOrder, record.id];
      }
      if (rawIdentityKey) {
        sourceFileIdsByKey.set(rawIdentityKey, record.id);
      }
      committedRecords.push(record);
    }

    if (!committedRecords.length) {
      return {
        importedFileIds: [],
        skippedDuplicateFileIds: uniqueStrings(skippedDuplicateFileIds),
      };
    }
    const rawTableRefs = createRawTableRefs(committedRecords);
    this.replaceSnapshot({
      ...this.snapshot,
      filesById: nextFilesById,
      fileOrder: nextFileOrder,
    }, "rawTablesChanged", {
      fileIds: committedRecords.map(record => record.id),
      rawTableIds: committedRecords.flatMap(record => record.raw.tableOrder),
      rawTableRefs,
    });

    return {
      importedFileIds: uniqueStrings(committedRecords.map(record => record.id)),
      skippedDuplicateFileIds: uniqueStrings(skippedDuplicateFileIds),
    };
  };

  public renameFile(fileId: FileId, name: string): boolean {
    const normalizedFileId = normalizeId(fileId);
    const nextName = normalizeOptionalText(name);
    const file = normalizedFileId ? this.snapshot.filesById[normalizedFileId] : undefined;
    if (!file || !nextName || file.name === nextName) {
      return false;
    }

    this.replaceSnapshot({
      ...this.snapshot,
      filesById: {
        ...this.snapshot.filesById,
        [normalizedFileId]: {
          ...file,
          name: nextName,
        },
      },
    }, "fileMetadataChanged", {
      fileIds: [normalizedFileId],
    });
    return true;
  }

  public commitSliceRuns = (inputs: readonly SliceCommit[]): void => {
    let nextFilesById = this.snapshot.filesById;
    const committedFileIds: FileId[] = [];
    const committedCurveKeys: SessionCurveKey[] = [];
    const committedSeriesIds: string[] = [];

    for (const input of Array.isArray(inputs) ? inputs : []) {
      const run = normalizeSliceRunRecord(input.run);
      const file = run ? nextFilesById[run.fileId] : undefined;
      if (!run || !file || !file.raw.tablesById[run.rawTableId]) {
        continue;
      }

      const commit = createSliceRunFileCommit(file, input, run);
      if (!commit) {
        continue;
      }

      if (nextFilesById === this.snapshot.filesById) {
        nextFilesById = { ...nextFilesById };
      }
      nextFilesById[run.fileId] = commit.file;
      committedFileIds.push(run.fileId);
      committedCurveKeys.push(...run.outputCurveKeys, ...commit.curveKeys);
      committedSeriesIds.push(...run.outputSeriesIds, ...commit.seriesIds);
    }

    if (nextFilesById === this.snapshot.filesById) {
      return;
    }

    this.replaceSnapshot({
      ...this.snapshot,
      filesById: nextFilesById,
    }, "sliceRunChanged", {
      curveKeys: uniqueStrings(committedCurveKeys),
      fileIds: uniqueStrings(committedFileIds),
      seriesIds: uniqueStrings(committedSeriesIds),
    });
  };

  public commitCurves = (input: CommitCurvesInput): void => {
    this.commitCurvesBatch([input]);
  };

  public commitCurvesBatch = (inputs: CommitCurvesBatchInput): void => {
    let nextFilesById = this.snapshot.filesById;
    const committedFileIds: FileId[] = [];
    const committedCurveKeys: SessionCurveKey[] = [];
    const committedSeriesIds: string[] = [];

    for (const input of Array.isArray(inputs) ? inputs : []) {
      const fileId = normalizeId(input.fileId);
      const file = fileId ? nextFilesById[fileId] : undefined;
      if (!file) {
        continue;
      }

      const commit = createCurvesFileCommit(file, input, fileId);
      if (!commit) {
        continue;
      }

      if (nextFilesById === this.snapshot.filesById) {
        nextFilesById = { ...nextFilesById };
      }
      nextFilesById[fileId] = commit.file;
      committedFileIds.push(fileId);
      committedCurveKeys.push(...commit.curveKeys);
      committedSeriesIds.push(...commit.seriesIds);
    }

    if (nextFilesById === this.snapshot.filesById) {
      return;
    }

    this.replaceSnapshot({
      ...this.snapshot,
      filesById: nextFilesById,
    }, "curvesChanged", {
      curveKeys: uniqueStrings(committedCurveKeys),
      fileIds: uniqueStrings(committedFileIds),
      seriesIds: uniqueStrings(committedSeriesIds),
    });
  };

  public commitMetrics = (input: CommitMetricsInput): void => {
    this.commitMetricsBatch([input]);
  };

  public commitMetricsBatch = (inputs: CommitMetricsBatchInput): void => {
    let nextFilesById = this.snapshot.filesById;
    const committedFileIds: FileId[] = [];
    const committedMetricKeys: MetricKey[] = [];
    const committedSeriesIds: string[] = [];

    for (const input of Array.isArray(inputs) ? inputs : []) {
      const fileId = normalizeId(input.fileId);
      const file = fileId ? nextFilesById[fileId] : undefined;
      if (!file) {
        continue;
      }

      const commit = createMetricsFileCommit(file, input, fileId);
      if (!commit) {
        continue;
      }

      if (nextFilesById === this.snapshot.filesById) {
        nextFilesById = { ...nextFilesById };
      }
      nextFilesById[fileId] = commit.file;
      committedFileIds.push(fileId);
      committedMetricKeys.push(...commit.metricKeys);
      committedSeriesIds.push(...commit.seriesIds);
    }

    if (nextFilesById === this.snapshot.filesById) {
      return;
    }

    this.replaceSnapshot({
      ...this.snapshot,
      filesById: nextFilesById,
    }, "metricsChanged", {
      fileIds: uniqueStrings(committedFileIds),
      metricKeys: uniqueStrings(committedMetricKeys),
      seriesIds: uniqueStrings(committedSeriesIds),
    });
  };

  public commitCalculatedRecordsBatch = (inputs: CommitCalculatedRecordsBatchInput): void => {
    const inputList = Array.isArray(inputs) ? inputs : [];
    const inputFileIds = inputList.flatMap(input => {
      const fileId = normalizeId(input.fileId);
      return fileId ? [fileId] : [];
    });
    const endPerf = startPerf("sessionService.commitCalculatedRecordsBatch", {
      batchSize: inputList.length,
      fileIds: inputFileIds,
      sessionVersion: this.snapshot.sessionVersion,
    });
    let nextFilesById = this.snapshot.filesById;
    const committedFileIds: FileId[] = [];
    const committedCurveKeys: SessionCurveKey[] = [];
    const committedMetricKeys: MetricKey[] = [];
    const committedSeriesIds: string[] = [];

    for (const input of inputList) {
      const fileId = normalizeId(input.fileId);
      let file = fileId ? nextFilesById[fileId] : undefined;
      if (!file) {
        continue;
      }

      const curvesCommit = createCurvesFileCommit(file, {
        curves: input.curves,
        fileId,
        replaceGenerations: input.replaceCurveGenerations,
      }, fileId);
      if (curvesCommit) {
        file = curvesCommit.file;
        committedCurveKeys.push(...curvesCommit.curveKeys);
        committedSeriesIds.push(...curvesCommit.seriesIds);
      }

      const metricsCommit = createMetricsFileCommit(file, {
        fileId,
        metrics: input.metrics,
        replace: input.replaceMetrics,
      }, fileId);
      if (metricsCommit) {
        file = metricsCommit.file;
        committedMetricKeys.push(...metricsCommit.metricKeys);
        committedSeriesIds.push(...metricsCommit.seriesIds);
      }

      if (!curvesCommit && !metricsCommit) {
        continue;
      }

      if (nextFilesById === this.snapshot.filesById) {
        nextFilesById = { ...nextFilesById };
      }
      nextFilesById[fileId] = file;
      committedFileIds.push(fileId);
    }

    if (nextFilesById === this.snapshot.filesById) {
      endPerf({
        committed: false,
        fileIds: inputFileIds,
      });
      return;
    }

    this.replaceSnapshot({
      ...this.snapshot,
      filesById: nextFilesById,
    }, "calculatedRecordsChanged", {
      curveKeys: uniqueStrings(committedCurveKeys),
      fileIds: uniqueStrings(committedFileIds),
      metricKeys: uniqueStrings(committedMetricKeys),
      seriesIds: uniqueStrings(committedSeriesIds),
    });
    endPerf({
      committed: true,
      committedCurveCount: uniqueStrings(committedCurveKeys).length,
      committedFileCount: uniqueStrings(committedFileIds).length,
      committedFileIds: uniqueStrings(committedFileIds),
      committedMetricCount: uniqueStrings(committedMetricKeys).length,
      committedSeriesCount: uniqueStrings(committedSeriesIds).length,
      fileIds: inputFileIds,
      nextSessionVersion: this.snapshot.sessionVersion,
    });
  };

  public removeFiles = (fileIds: readonly string[]): void => {
    const removedFileIds = normalizeFileIdSet(fileIds);
    if (!removedFileIds.size) {
      return;
    }
    const existingRemovedFileIds = [...removedFileIds].filter(fileId =>
      Boolean(this.snapshot.filesById[fileId]) ||
      this.snapshot.fileOrder.includes(fileId)
    );
    if (!existingRemovedFileIds.length) {
      return;
    }
    const existingRemovedFileIdSet = new Set(existingRemovedFileIds);

    const nextFilesById = filterRecord(
      this.snapshot.filesById,
      (fileId) => !existingRemovedFileIdSet.has(fileId),
    );
    const nextFileOrder = this.snapshot.fileOrder.filter((fileId) =>
      !existingRemovedFileIdSet.has(fileId)
    );
    if (
      nextFilesById === this.snapshot.filesById &&
      areStringArraysEqual(nextFileOrder, this.snapshot.fileOrder)
    ) {
      return;
    }

    this.replaceSnapshot({
      ...this.snapshot,
      filesById: nextFilesById,
      fileOrder: nextFileOrder,
    }, "filesRemoved", {
      fileIds: existingRemovedFileIds,
    });
  };

  public clearSession = (): void => {
    if (
      Object.keys(this.snapshot.filesById).length === 0 &&
      this.snapshot.fileOrder.length === 0
    ) {
      return;
    }

    this.replaceSnapshot({
      ...this.snapshot,
      filesById: {},
      fileOrder: [],
    }, "sessionCleared", {
      fileIds: getSnapshotFileIds(this.snapshot),
    });
  };

  private replaceSnapshot(
    snapshot: SessionSnapshot,
    reason: SessionChangeReason,
    affected: SessionAffectedRecords = {},
  ): void {
    const nextSnapshot: SessionSnapshot = {
      ...snapshot,
      schemaVersion: 1,
      sessionVersion: this.snapshot.sessionVersion + 1,
    };
    this.snapshot = nextSnapshot;
    this.queueChange(createSessionChangeEvent(
      reason,
      nextSnapshot.sessionVersion,
      affected,
    ));
  }

  private queueChange(event: SessionChangeEvent): void {
    this.onDidChangeSessionEmitter.fire(event);
  }

}

const EMPTY_FILE_IMPORT_COMMIT_RESULT: CommitFileImportResult = {
  importedFileIds: [],
  skippedDuplicateFileIds: [],
};

const createSourceFileIdsByKey = (
  filesById: Readonly<Record<FileId, FileRecord>>,
  fileOrder: readonly FileId[],
): Map<string, FileId> => {
  const result = new Map<string, FileId>();
  for (const fileId of uniqueStrings([
    ...fileOrder,
    ...Object.keys(filesById),
  ])) {
    const file = filesById[fileId];
    const rawIdentityKey = file ? getRawSourceIdentityKey(file.raw) : null;
    if (rawIdentityKey) {
      result.set(rawIdentityKey, fileId);
    }
  }

  return result;
};

const getRawSourceIdentityKey = (
  raw: Pick<RawRecord, "fileName" | "lastModified" | "rawKey" | "relativePath" | "size">,
): string | null => normalizeOptionalText(raw.rawKey) ??
  createRawSourceFingerprint(raw);

const createRawSourceFingerprint = (
  raw: Pick<RawRecord, "fileName" | "lastModified" | "relativePath" | "size">,
): string | null => {
  if (
    !normalizeOptionalText(raw.fileName) ||
    !Number.isFinite(Number(raw.size)) ||
    !Number.isFinite(Number(raw.lastModified))
  ) {
    return null;
  }

  return normalizeOptionalText(buildFileSourceIdentityKey(
    raw.fileName,
    raw.size,
    raw.lastModified,
    raw.relativePath,
  )) ?? null;
};

const buildFileSourceIdentityKey = (
  fileName: unknown,
  size: unknown,
  lastModified: unknown,
  relativePath?: string | null,
): string => {
  const name = String(fileName ?? "").trim();
  if (!name) {
    return "";
  }

  const path = relativePath?.trim();
  return `${path || name}::${Number(size) || 0}::${Number(lastModified) || 0}`;
};

const createFileRecordFromImportedFile = (
  importedFile: ImportedFileRecord,
): FileRecord | null => {
  const fileId = normalizeId(importedFile.id || importedFile.raw.fileId);
  if (!fileId) {
    return null;
  }

  const raw = createRawRecordFromImportedFile(fileId, importedFile);
  if (!raw.tableOrder.length) {
    return null;
  }

  return {
    id: fileId,
    kind: importedFile.kind,
    name: normalizeOptionalText(importedFile.name) ??
      normalizeOptionalText(importedFile.raw.fileName) ??
      fileId,
    raw,
    rawTableVersionsById: createInitialRawTableVersions(raw.tableOrder),
    seriesById: {},
    seriesOrder: [],
    curvesByKey: {},
    metricsByKey: {},
  };
};

const createRawRecordFromImportedFile = (
  fileId: string,
  importedFile: ImportedFileRecord,
): RawRecord => {
  const tablesById: Record<string, TableRecord> = {};
  const tableOrder: string[] = [];
  const pushRawTable = (rawTableId: string): void => {
    const normalizedRawTableId = normalizeId(rawTableId);
    if (!normalizedRawTableId || tablesById[normalizedRawTableId]) {
      return;
    }

    const rawTable = importedFile.raw.rawTablesById[normalizedRawTableId];
    if (!rawTable) {
      return;
    }

    const table = createTableRecordFromRawTable(fileId, rawTable);
    if (!table) {
      return;
    }

    tablesById[table.sheetId] = table;
    tableOrder.push(table.sheetId);
  };

  for (const rawTableId of importedFile.raw.rawTableOrder) {
    pushRawTable(rawTableId);
  }
  for (const rawTableId of Object.keys(importedFile.raw.rawTablesById)) {
    pushRawTable(rawTableId);
  }

  return {
    fileId,
    fileName: normalizeOptionalText(importedFile.raw.fileName) ??
      normalizeOptionalText(importedFile.name) ??
      fileId,
    file: importedFile.raw.rawFile ?? undefined,
    size: importedFile.raw.size,
    lastModified: importedFile.raw.lastModified,
    rawKey: normalizeOptionalText(importedFile.raw.rawKey),
    relativePath: importedFile.raw.relativePath ?? null,
    filePath: importedFile.raw.filePath ?? null,
    normalizedCsvPath: getSingleNormalizedCsvPath(
      tableOrder.map(rawTableId => importedFile.raw.rawTablesById[rawTableId]),
    ),
    tablesById,
    tableOrder,
  };
};

const createTableRecordFromRawTable = (
  fileId: string,
  rawTable: RawTableRecord,
): TableRecord | null => {
  const rawTableId = normalizeId(rawTable.rawTableId);
  if (!rawTableId) {
    return null;
  }

  return {
    fileId,
    sheetId: rawTableId,
    sheetName: rawTable.source.kind === "excelSheet"
      ? rawTable.source.sheetName ?? null
      : null,
    tableKey: rawTableId,
    rowStore: createTableRowStore(rawTable),
    rowCount: Math.max(0, Math.floor(rawTable.rowCount)),
    columnCount: Math.max(0, Math.floor(rawTable.columnCount)),
    maxCellLengths: [...rawTable.maxCellLengths ?? []],
    health: rawTable.health,
    templateEligibility: rawTable.templateEligibility,
  };
};

const createTableRowStore = (
  rawTable: RawTableRecord,
): TableRowStoreRecord | undefined => {
  if (rawTable.rows.kind === "unavailable") {
    return undefined;
  }

  return rawTable.rows.kind === "normalizedCsv"
    ? {
      kind: "external",
      normalizedCsvPath: rawTable.rows.normalizedCsvPath,
      tableKey: rawTable.rawTableId,
    }
    : {
      kind: "memory",
      rows: rawTable.rows.values,
    };
};

const createInitialRawTableVersions = (
  rawTableOrder: readonly string[],
): Record<string, number> => {
  const versions: Record<string, number> = {};
  for (const rawTableId of rawTableOrder) {
    versions[rawTableId] = 1;
  }

  return versions;
};

const createRawTableRefs = (
  records: readonly FileRecord[],
): RawTableRef[] => {
  const refs: RawTableRef[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    for (const rawTableId of record.raw.tableOrder) {
      const key = `${record.id}\u0000${rawTableId}`;
      if (!rawTableId || seen.has(key)) {
        continue;
      }

      seen.add(key);
      refs.push({
        fileId: record.id,
        rawTableId,
      });
    }
  }

  return refs;
};

const uniqueRawTableRefs = (
  refs: readonly RawTableRef[],
): RawTableRef[] => {
  const result: RawTableRef[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const fileId = normalizeId(ref.fileId);
    const rawTableId = normalizeId(ref.rawTableId);
    const key = `${fileId}\u0000${rawTableId}`;
    if (!fileId || !rawTableId || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({ fileId, rawTableId });
  }

  return result;
};

const preserveRawTableVersionContinuity = (
  record: FileRecord,
  previous: FileRecord | undefined,
): FileRecord => {
  if (!previous) {
    return record;
  }

  const rawTableVersionsById: Record<string, number> = {};
  for (const rawTableId of record.raw.tableOrder) {
    const previousVersion = Math.max(
      0,
      Math.floor(Number(previous.rawTableVersionsById?.[rawTableId]) || 0),
    );
    rawTableVersionsById[rawTableId] = previousVersion + 1;
  }

  return {
    ...record,
    rawTableVersionsById,
  };
};

const getUniqueIds = (ids: readonly string[]): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    result.push(id);
  }

  return result;
};

const getSingleNormalizedCsvPath = (
  rawTables: readonly (RawTableRecord | undefined)[],
): string | null => {
  const paths = rawTables
    .map(rawTable => rawTable?.rows.kind === "normalizedCsv"
      ? rawTable.rows.normalizedCsvPath
      : null)
    .filter((path): path is string => Boolean(path));

  return paths.length === 1 ? paths[0] : null;
};

const getSnapshotFileIds = (
  snapshot: SessionSnapshot,
): readonly FileId[] => uniqueStrings([
  ...snapshot.fileOrder,
  ...Object.keys(snapshot.filesById),
]);

const uniqueStrings = <T extends string>(values: readonly T[]): T[] => {
  const result: T[] = [];
  const seen = new Set<T>();
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
};

const normalizeFileIdSet = (fileIds: readonly string[]): Set<string> =>
  new Set(
    (Array.isArray(fileIds) ? fileIds : [])
      .map(normalizeId)
      .filter((fileId) => fileId.length > 0),
  );

const createSliceRunFileCommit = (
  file: FileRecord,
  input: SliceCommit,
  run: SliceRun,
): {
  readonly file: FileRecord;
  readonly curveKeys: readonly SessionCurveKey[];
  readonly seriesIds: readonly string[];
} | null => {
  const seriesRecords = normalizeSliceSeriesRecords(input.series, run.fileId);
  const seriesById: Record<string, SeriesRecord> = {};
  const seriesOrder: string[] = [];
  for (const series of seriesRecords) {
    seriesById[series.id] = series;
    if (!seriesOrder.includes(series.id)) {
      seriesOrder.push(series.id);
    }
  }

  const fileWithRun: FileRecord = {
    ...file,
    sliceRunsById: {
      ...file.sliceRunsById,
      [run.id]: run,
    },
    latestSliceRunId: run.id,
    seriesById,
    seriesOrder,
  };
  const curvesCommit = createCurvesFileCommit(fileWithRun, {
    fileId: run.fileId,
    curves: input.curves,
    replaceGenerations: ["base"],
  }, run.fileId);

  return {
    curveKeys: curvesCommit?.curveKeys ?? [],
    file: curvesCommit?.file ?? fileWithRun,
    seriesIds: seriesOrder,
  };
};

const normalizeSliceRunRecord = (
  input: SliceRun,
): SliceRun | null => {
  const id = normalizeId(input?.id);
  const fileId = normalizeId(input?.fileId);
  const rawTableId = normalizeId(input?.rawTableId);
  if (!id || !fileId || !rawTableId) {
    return null;
  }

  return {
    ...input,
    id,
    fileId,
    rawTableId,
    selection: normalizeTemplateSelection(input.selection),
    sourceRawTableVersion: normalizeNonNegativeInteger(input.sourceRawTableVersion),
    sourceContentSignature: normalizeOptionalText(
      input.sourceContentSignature,
    ),
    inputRanges: normalizeSliceInputRanges(input.inputRanges, fileId, rawTableId),
    outputSeriesIds: uniqueStrings(
      (Array.isArray(input.outputSeriesIds) ? input.outputSeriesIds : [])
        .map(normalizeId),
    ),
    outputCurveKeys: uniqueStrings(
      (Array.isArray(input.outputCurveKeys) ? input.outputCurveKeys : [])
        .map(normalizeId),
    ) as SessionCurveKey[],
    warnings: readTextArray(input.warnings),
    errors: readTextArray(input.errors),
  };
};

const normalizeSliceSeriesRecords = (
  series: readonly SeriesRecord[],
  fileId: string,
): SeriesRecord[] => {
  const records: SeriesRecord[] = [];
  for (const entry of Array.isArray(series) ? series : []) {
    const id = normalizeId(entry.id);
    if (entry.fileId !== fileId || !id) {
      continue;
    }

    records.push({
      ...entry,
      id,
      fileId,
    });
  }
  return records;
};

const normalizeSliceInputRanges = (
  ranges: SliceRun["inputRanges"],
  fileId: string,
  rawTableId: string,
): SliceRun["inputRanges"] => {
  const result: Array<SliceRun["inputRanges"][number]> = [];
  for (const entry of Array.isArray(ranges) ? ranges : []) {
    const range = normalizeSliceRange(entry.range);
    if (range) {
      result.push({
        fileId,
        rawTableId,
        range,
      });
    }
  }
  return result;
};

const normalizeSliceRange = (
  range: SliceRun["inputRanges"][number]["range"] | undefined,
): SliceRun["inputRanges"][number]["range"] | null => {
  const startRow = normalizeNonNegativeInteger(range?.startRow);
  const endRow = normalizeNonNegativeInteger(range?.endRow);
  const startCol = normalizeNonNegativeInteger(range?.startCol);
  const endCol = normalizeNonNegativeInteger(range?.endCol);
  if (endRow < startRow || endCol < startCol) {
    return null;
  }

  return {
    startRow,
    endRow,
    startCol,
    endCol,
  };
};

const normalizeNonNegativeInteger = (value: unknown): number => {
  const numberValue = Math.floor(Number(value));
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
};

const normalizeTemplateSelection = (
  selection: TemplateSelection,
): TemplateSelection => {
  if (selection?.kind === "inline" && selection.template) {
    return selection;
  }
  if (selection?.kind === "saved") {
    const templateId = normalizeId(selection.templateId);
    return templateId ? { kind: "saved", templateId } : { kind: "auto" };
  }

  return { kind: "auto" };
};

const normalizeMetricInput = (
  input: MetricInputRecord,
): MetricInputRecord | null => {
  const fileId = normalizeId(input.fileId);
  const seriesId = normalizeId(input.seriesId);
  const metricKey = normalizeMetricKey(input.metricKey);
  const source = input.source === "auto" || input.source === "manual"
    ? input.source
    : null;
  if (!fileId || !seriesId || !metricKey || !source) {
    return null;
  }

  const range = normalizeMetricInputRange(input.range);
  const targets = normalizeMetricInputTargets(input.targets);
  const configSignature = normalizeOptionalText(input.configSignature);
  return {
    metricKey,
    fileId,
    seriesId,
    source,
    ...(range ? { range } : {}),
    ...(targets ? { targets } : {}),
    ...(configSignature ? { configSignature } : {}),
  };
};

const normalizeMetricKey = (value: unknown): MetricKey | null => {
  const key = normalizeId(value);
  return key ? key as MetricKey : null;
};

const createCurveRecordKey = (curve: CurveRecord): SessionCurveKey => {
  switch (curve.curveGeneration) {
    case "base": {
      const mode = curve.curveFamily === "iv"
        ? curve.ivMode ?? "default"
        : curve.curveFamily === "it"
          ? curve.itMode ?? "default"
          : "default";
      return `base:${curve.curveFamily}:${mode}:${curve.seriesId}` as SessionCurveKey;
    }
    case "derived":
      return `derived:${curve.curveFamily}:default:${curve.seriesId}` as SessionCurveKey;
    case "secondDerived":
      return `secondDerived:${curve.curveFamily}:default:${curve.seriesId}` as SessionCurveKey;
  }
};

const cloneMetricsBySeriesId = (
  metricsBySeriesId: Record<string, MetricKey[]> | undefined,
): Record<string, MetricKey[]> => {
  const next: Record<string, MetricKey[]> = {};
  for (const [seriesId, keys] of Object.entries(metricsBySeriesId ?? {})) {
    next[seriesId] = [...keys];
  }
  return next;
};

const appendMetricKey = (
  metricsBySeriesId: Record<string, MetricKey[]>,
  seriesId: string,
  metricKey: MetricKey,
): void => {
  const normalizedSeriesId = normalizeId(seriesId);
  if (!normalizedSeriesId) {
    return;
  }

  const keys = metricsBySeriesId[normalizedSeriesId] ?? [];
  if (!keys.includes(metricKey)) {
    metricsBySeriesId[normalizedSeriesId] = [...keys, metricKey];
  }
};

const createCurvesFileCommit = (
  file: FileRecord,
  input: CommitCurvesInput,
  fileId: FileId,
): {
  readonly file: FileRecord;
  readonly curveKeys: readonly SessionCurveKey[];
  readonly seriesIds: readonly string[];
} | null => {
  const replaceGenerations = new Set<CurveGeneration>(
    Array.isArray(input.replaceGenerations) ? input.replaceGenerations : [],
  );
  let changed = Boolean(input.replace);
  const curvesByKey: Record<SessionCurveKey, CurveRecord> = {};
  if (!input.replace) {
    for (const [curveKey, curve] of Object.entries(file.curvesByKey) as Array<[SessionCurveKey, CurveRecord]>) {
      if (replaceGenerations.has(curve.curveGeneration)) {
        changed = true;
        continue;
      }
      curvesByKey[curveKey] = curve;
    }
  }
  const committedCurveKeys: SessionCurveKey[] = [];
  const committedSeriesIds: string[] = [];
  for (const curve of Array.isArray(input.curves) ? input.curves : []) {
    if (curve.fileId !== fileId) {
      continue;
    }

    const curveKey = createCurveRecordKey(curve);
    changed ||= curvesByKey[curveKey] !== curve;
    curvesByKey[curveKey] = curve;
    committedCurveKeys.push(curveKey);
    committedSeriesIds.push(curve.seriesId);
  }
  if (!changed) {
    return null;
  }

  return {
    curveKeys: committedCurveKeys,
    file: {
      ...file,
      curvesByKey,
    },
    seriesIds: committedSeriesIds,
  };
};

const createMetricsFileCommit = (
  file: FileRecord,
  input: CommitMetricsInput,
  fileId: FileId,
): {
  readonly file: FileRecord;
  readonly metricKeys: readonly MetricKey[];
  readonly seriesIds: readonly string[];
} | null => {
  let changed = Boolean(
    input.replace &&
      (Object.keys(file.metricsByKey).length > 0 || file.metricsBySeriesId),
  );
  const metricsByKey = input.replace ? {} : { ...file.metricsByKey };
  const metricsBySeriesId = input.replace ? {} : cloneMetricsBySeriesId(file.metricsBySeriesId);
  const committedMetricKeys: MetricKey[] = [];
  const committedSeriesIds: string[] = [];
  for (const metric of Array.isArray(input.metrics) ? input.metrics : []) {
    if (metric.fileId !== fileId || !normalizeMetricKey(metric.key)) {
      continue;
    }

    changed ||= metricsByKey[metric.key] !== metric;
    metricsByKey[metric.key] = metric;
    appendMetricKey(metricsBySeriesId, metric.seriesId, metric.key);
    committedMetricKeys.push(metric.key);
    committedSeriesIds.push(metric.seriesId);
  }
  if (!changed) {
    return null;
  }

  return {
    file: {
      ...file,
      metricsByKey,
      metricsBySeriesId: Object.keys(metricsBySeriesId).length
        ? metricsBySeriesId
        : undefined,
    },
    metricKeys: committedMetricKeys,
    seriesIds: committedSeriesIds,
  };
};

const normalizeMetricInputRange = (
  range: MetricInputRecord["range"],
): MetricInputRecord["range"] | undefined =>
  range
    ? {
        x1: parseMetricInputNumber(range.x1),
        x2: parseMetricInputNumber(range.x2),
      }
    : undefined;

const normalizeMetricInputTargets = (
  targets: MetricInputRecord["targets"],
): MetricInputRecord["targets"] | undefined => {
  if (!targets) {
    return undefined;
  }

  const normalized: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(targets)) {
    const normalizedKey = normalizeId(key);
    if (normalizedKey) {
      normalized[normalizedKey] = parseMetricInputNumber(value);
    }
  }
  return Object.keys(normalized).length ? normalized : undefined;
};

const parseMetricInputNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const readTextArray = (value: readonly string[] | undefined): string[] =>
  (Array.isArray(value) ? value : [])
    .map(normalizeOptionalText)
    .filter((item): item is string => Boolean(item));

const isSameMetricInput = (
  current: MetricInputRecord | undefined,
  next: MetricInputRecord,
): boolean =>
  Boolean(current) &&
  current?.metricKey === next.metricKey &&
  current?.fileId === next.fileId &&
  current?.seriesId === next.seriesId &&
  current?.source === next.source &&
  current?.configSignature === next.configSignature &&
  current?.range?.x1 === next.range?.x1 &&
  current?.range?.x2 === next.range?.x2 &&
  isSameNumberRecord(current?.targets, next.targets);

const isSameNumberRecord = (
  current: Record<string, number | null> | undefined,
  next: Record<string, number | null> | undefined,
): boolean => {
  const currentKeys = Object.keys(current ?? {});
  const nextKeys = Object.keys(next ?? {});
  if (currentKeys.length !== nextKeys.length) {
    return false;
  }

  return nextKeys.every((key) => current?.[key] === next?.[key]);
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeId = (value: unknown): string => String(value ?? "").trim();

const normalizeOptionalText = (value: unknown): string | undefined => {
  const text = String(value ?? "").trim();
  return text || undefined;
};

const areStringArraysEqual = (
  first: readonly string[],
  second: readonly string[],
): boolean => {
  if (first.length !== second.length) {
    return false;
  }

  return first.every((value, index) => value === second[index]);
};

const filterRecord = <T,>(
  record: Record<string, T>,
  predicate: (key: string, value: T) => boolean,
  mapValue?: (key: string, value: T) => T,
): Record<string, T> => {
  let changed = false;
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    if (predicate(key, value)) {
      const nextValue = mapValue ? mapValue(key, value) : value;
      next[key] = nextValue;
      changed ||= nextValue !== value;
    } else {
      changed = true;
    }
  }
  return changed ? next : record;
};

registerSingleton(ISessionService, SessionService, InstantiationType.Delayed);
