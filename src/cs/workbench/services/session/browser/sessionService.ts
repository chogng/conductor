/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Browser implementation of the session data table. This is the only mutable
// owner for canonical imported files, assessments, template runs, curves, and metrics.
import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
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
  type TableRecord,
  type TableRowStoreRecord,
  type TemplateRunRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  resetProcessedRecords,
} from "src/cs/workbench/services/session/common/sessionModelAdapter";
import {
  ISessionService,
  type CommitFileImportResult,
  type CommitCurvesInput,
  type CommitMetricsInput,
  type CommitTemplateRunInput,
  type SessionSnapshot,
  type ISessionService as ISessionServiceType,
} from "src/cs/workbench/services/session/common/session";
import {
  createSessionChangeEvent,
  type SessionAffectedRecords,
  type SessionChangeEvent,
  type SessionChangeReason,
} from "src/cs/workbench/services/session/common/sessionEvents";
import {
  buildFileSourceIdentityKey,
  type FileImportResult,
  type ImportedFileRecord,
} from "src/cs/workbench/services/files/common/files";
import type {
  RawTableRecord,
} from "src/cs/workbench/services/files/common/rawTable";
import type {
  RawTableAssessmentRecord,
} from "src/cs/workbench/services/assessment/common/assessment";
import type {
  MeasurementBlockRecord,
} from "src/cs/workbench/services/assessment/common/measurement";

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

  public commitFileImport = (result: FileImportResult): CommitFileImportResult => {
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
      const sourceKey = getRawSourceIdentityKey(record.raw);
      const duplicateFileId = sourceKey ? sourceFileIdsByKey.get(sourceKey) : undefined;
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
      if (sourceKey) {
        sourceFileIdsByKey.set(sourceKey, record.id);
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

  public commitRawTableAssessment = (assessment: RawTableAssessmentRecord): void => {
    const fileId = normalizeId(assessment.fileId);
    const rawTableId = normalizeId(assessment.rawTableId);
    const file = fileId ? this.snapshot.filesById[fileId] : undefined;
    if (!file || !rawTableId || !file.raw.tablesById[rawTableId]) {
      return;
    }

    const rawTableVersion = file.rawTableVersionsById?.[rawTableId] ?? 0;
    if (rawTableVersion !== assessment.sourceRawTableVersion) {
      return;
    }

    const measurementBlocksById = removeMeasurementBlocksForRawTable(
      file.measurementBlocksById ?? {},
      rawTableId,
    );
    const measurementBlockOrder = file.measurementBlockOrder.filter(blockId =>
      Boolean(measurementBlocksById[blockId])
    );
    const committedBlocks: MeasurementBlockRecord[] = [];
    for (const block of assessment.blocks) {
      const normalizedBlock = normalizeMeasurementBlock(block, fileId, rawTableId);
      if (!normalizedBlock) {
        continue;
      }

      measurementBlocksById[normalizedBlock.id] = normalizedBlock;
      committedBlocks.push(normalizedBlock);
    }
    const committedBlockIds = getUniqueIds(committedBlocks.map(block => block.id));
    const committedAssessment: RawTableAssessmentRecord = {
      ...assessment,
      fileId,
      rawTableId,
      blocks: committedBlocks,
    };

    this.replaceSnapshot({
      ...this.snapshot,
      filesById: {
        ...this.snapshot.filesById,
        [fileId]: {
          ...file,
          assessmentsByRawTableId: {
            ...(file.assessmentsByRawTableId ?? {}),
            [rawTableId]: committedAssessment,
          },
          measurementBlocksById,
          measurementBlockOrder: [...measurementBlockOrder, ...committedBlockIds],
        },
      },
    }, "assessmentChanged", {
      fileIds: [fileId],
      rawTableIds: [rawTableId],
      rawTableRefs: [{ fileId, rawTableId }],
    });
  };

  public commitTemplateRun = (input: CommitTemplateRunInput): void => {
    if (isClearTemplateOutputCommitInput(input)) {
      this.clearTemplateOutput(input.fileIds);
      return;
    }

    const templateRunInput = getTemplateRunFromCommitInput(input);
    const templateRun = templateRunInput ? normalizeTemplateRunRecord(templateRunInput) : null;
    const file = templateRun ? this.snapshot.filesById[templateRun.fileId] : undefined;
    if (!templateRun || !file) {
      return;
    }
    const payload = getTemplateRunCommitPayload(input);

    const current = file.templateRunsById[templateRun.id];
    if (
      current === templateRun &&
      file.latestTemplateRunId === templateRun.id &&
      !payload
    ) {
      return;
    }
    const fileName = payload?.fileName ? normalizeId(payload.fileName) : null;
    const nextFile: FileRecord = {
      ...file,
      ...(payload && "calculationCache" in payload ? { calculationCache: payload.calculationCache } : {}),
      ...(payload?.seriesById ? { seriesById: { ...payload.seriesById } } : {}),
      ...(payload?.seriesOrder ? { seriesOrder: [...payload.seriesOrder] } : {}),
      ...(fileName
        ? {
            name: fileName,
            raw: {
              ...file.raw,
              fileName,
            },
          }
        : {}),
      templateRunsById: {
        ...file.templateRunsById,
        [templateRun.id]: templateRun,
      },
      latestTemplateRunId: templateRun.id,
    };

    this.replaceSnapshot({
      ...this.snapshot,
      filesById: {
        ...this.snapshot.filesById,
        [templateRun.fileId]: nextFile,
      },
    }, "templateRunChanged", {
      curveKeys: templateRun.outputCurveKeys,
      fileIds: [templateRun.fileId],
      seriesIds: templateRun.outputSeriesIds,
    });
  };

  public commitCurves = (input: CommitCurvesInput): void => {
    const fileId = normalizeId(input.fileId);
    const file = fileId ? this.snapshot.filesById[fileId] : undefined;
    if (!file) {
      return;
    }

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
      return;
    }

    this.replaceSnapshot({
      ...this.snapshot,
      filesById: {
        ...this.snapshot.filesById,
        [fileId]: {
          ...file,
          curvesByKey,
        },
      },
    }, "curvesChanged", {
      curveKeys: uniqueStrings(committedCurveKeys),
      fileIds: [fileId],
      seriesIds: uniqueStrings(committedSeriesIds),
    });
  };

  public commitMetrics = (input: CommitMetricsInput): void => {
    const fileId = normalizeId(input.fileId);
    const file = fileId ? this.snapshot.filesById[fileId] : undefined;
    if (!file) {
      return;
    }

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
      return;
    }

    this.replaceSnapshot({
      ...this.snapshot,
      filesById: {
        ...this.snapshot.filesById,
        [fileId]: {
          ...file,
          metricsByKey,
          metricsBySeriesId: Object.keys(metricsBySeriesId).length
            ? metricsBySeriesId
            : undefined,
        },
      },
    }, "metricsChanged", {
      fileIds: [fileId],
      metricKeys: uniqueStrings(committedMetricKeys),
      seriesIds: uniqueStrings(committedSeriesIds),
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

  private clearTemplateOutput(fileIds?: readonly string[]): void {
    const nextRecords = resetProcessedRecords(
      this.snapshot.filesById,
      this.snapshot.fileOrder,
      fileIds,
    );
    if (nextRecords.filesById === this.snapshot.filesById) {
      return;
    }

    this.replaceSnapshot({
      ...this.snapshot,
      ...nextRecords,
    }, "templateRunChanged", {
      fileIds: fileIds ? uniqueStrings(fileIds.map(normalizeId)) : getSnapshotFileIds(this.snapshot),
    });
  }

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
    const sourceKey = file ? getRawSourceIdentityKey(file.raw) : null;
    if (sourceKey) {
      result.set(sourceKey, fileId);
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
    assessmentsByRawTableId: {},
    measurementBlocksById: {},
    measurementBlockOrder: [],
    templateRunsById: {},
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
  };
};

const createTableRowStore = (
  rawTable: RawTableRecord,
): TableRowStoreRecord => rawTable.rows.kind === "normalizedCsv"
  ? {
      kind: "external",
      normalizedCsvPath: rawTable.rows.normalizedCsvPath,
      tableKey: rawTable.rawTableId,
    }
  : {
      kind: "memory",
      rows: rawTable.rows.values,
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

const removeMeasurementBlocksForRawTable = (
  measurementBlocksById: Readonly<Record<string, MeasurementBlockRecord>>,
  rawTableId: string,
): Record<string, MeasurementBlockRecord> => {
  const next: Record<string, MeasurementBlockRecord> = {};
  for (const [blockId, block] of Object.entries(measurementBlocksById)) {
    if (block.rawTableId !== rawTableId) {
      next[blockId] = block;
    }
  }

  return next;
};

const normalizeMeasurementBlock = (
  block: MeasurementBlockRecord,
  fileId: string,
  rawTableId: string,
): MeasurementBlockRecord | null => {
  const blockId = normalizeId(block.id);
  if (!blockId) {
    return null;
  }

  return {
    ...block,
    id: blockId,
    fileId,
    rawTableId,
  };
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

type TemplateRunCommitPayload = Extract<CommitTemplateRunInput, { readonly run: TemplateRunRecord }>;

const getTemplateRunFromCommitInput = (
  input: CommitTemplateRunInput,
): TemplateRunRecord | null =>
  isClearTemplateOutputCommitInput(input)
    ? null
    : isTemplateRunCommitPayload(input)
      ? input.run
      : input;

const getTemplateRunCommitPayload = (
  input: CommitTemplateRunInput,
): TemplateRunCommitPayload | null =>
  isClearTemplateOutputCommitInput(input)
    ? null
    : isTemplateRunCommitPayload(input)
      ? input
      : null;

const isTemplateRunCommitPayload = (
  input: CommitTemplateRunInput,
): input is TemplateRunCommitPayload =>
  Boolean(input && typeof input === "object" && "run" in input);

const isClearTemplateOutputCommitInput = (
  input: CommitTemplateRunInput,
): input is Extract<CommitTemplateRunInput, { readonly kind: "clearTemplateOutput" }> =>
  Boolean(input && typeof input === "object" && "kind" in input && input.kind === "clearTemplateOutput");

const normalizeTemplateRunRecord = (
  input: TemplateRunRecord,
): TemplateRunRecord | null => {
  const id = normalizeId(input.id);
  const fileId = normalizeId(input.fileId);
  if (!id || !fileId) {
    return null;
  }

  return {
    ...input,
    id,
    fileId,
    sourceBlockIds: uniqueStrings(
      (Array.isArray(input.sourceBlockIds) ? input.sourceBlockIds : [])
        .map(normalizeId),
    ),
    outputSeriesIds: uniqueStrings(
      (Array.isArray(input.outputSeriesIds) ? input.outputSeriesIds : [])
        .map(normalizeId),
    ),
    outputCurveKeys: uniqueStrings(
      (Array.isArray(input.outputCurveKeys) ? input.outputCurveKeys : [])
        .map(normalizeId),
    ) as SessionCurveKey[],
    appliedAt: Number.isFinite(Number(input.appliedAt)) ? Number(input.appliedAt) : 0,
    warnings: readTextArray(input.warnings),
    errors: readTextArray(input.errors),
  };
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
