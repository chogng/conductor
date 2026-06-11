/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
  CalculatedData,
  CalculatedPlotsByKey,
  CalculatedSeries,
} from "src/cs/workbench/services/calculation/common/calculatedData";
import {
  createParameterRows,
  type CalculatedParameterRowData,
} from "src/cs/workbench/services/calculation/common/calculatedParameters";
import type {
  CurveData,
  CurveKey as LegacyCurveKey,
  FileSemantics,
} from "src/cs/workbench/services/session/common/fileSemantics";
import type {
  ProcessedEntry,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type {
  CommitCurvesInput,
  CommitMetricsInput,
  CommitTemplateRunInput,
  SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import {
  createEmptyTemplateConfig,
  type TemplateConfig,
} from "src/cs/workbench/services/template/common/templateConfigUtils";
import type {
  BaseCurveFamily,
  CacheKey,
  CalculationCacheEntry,
  CurrentWindowRecord,
  CurveChannelsRecord,
  CurveKey as SessionCurveKey,
  CurveRef,
  CurveRecord,
  DerivedCurveFamily,
  DomainRecord,
  FileId,
  FileRecord,
  ItCurveMode,
  IvCurveMode,
  MetricKey,
  MetricRecord,
  RawRecord,
  SeriesRecord,
  SeriesId,
  TemplateConfigRecord,
  TemplateRunId,
  TemplateRunRecord,
  TemplateSelectionRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import { getLatestTemplateRunRecord } from "src/cs/workbench/services/session/common/sessionModel";
import {
  getFileRecordCurveType,
} from "src/cs/workbench/services/session/common/sessionRecordProjection";

const CALCULATION_CACHE_PAYLOAD_VERSION = 2;

type MergeProcessedFileOptions = {
  readonly appliedTemplateConfig?: unknown;
  readonly appliedTemplateSelection?: TemplateSelectionRecord;
};

type ProcessedCalculationCachePayload = {
  fileId: string;
  cache: unknown;
  touchedAt?: number;
};

export type ProcessedFileSessionCommit = {
  readonly templateRun: CommitTemplateRunInput;
  readonly curves: CommitCurvesInput;
  readonly metrics: CommitMetricsInput;
};

const createEmptyFileRecord = (fileId: string, fileName: string): FileRecord => {
  const raw = createRawRecord(fileId, fileName);
  return {
    id: fileId,
    kind: inferFileKindFromFileName(fileName),
    name: fileName,
    raw,
    rawTableVersionsById: createRawTableVersions(raw.tableOrder),
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

const createRawRecord = (fileId: string, fileName: string): RawRecord => {
  const sheetId = fileId;
  return {
    fileId,
    fileName,
    tablesById: {
      [sheetId]: {
        fileId,
        sheetId,
        sheetName: null,
        tableKey: fileId,
        rowCount: 0,
        columnCount: 0,
        maxCellLengths: [],
      },
    },
    tableOrder: [sheetId],
  };
};

const mergeSourceFileRecord = (
  record: FileRecord,
  sourceFile: SessionFile,
): FileRecord => {
  const fileId = readRecordString(sourceFile, "fileId") ?? record.id;
  const fileName = readRecordString(sourceFile, "fileName") ?? record.raw.fileName;
  const sheetId = resolveSourceSheetId(sourceFile, fileId);
  const nextNormalizedCsvPath = readRecordString(sourceFile, "normalizedCsvPath") ??
    record.raw.normalizedCsvPath;
  const tableRecord = {
    fileId,
    sheetId,
    sheetName: readRecordString(sourceFile, "sheetName") ??
      readRecordString(sourceFile, "worksheetName"),
    tableKey: readRecordString(sourceFile, "sourceKey") ??
      (sheetId === fileId ? fileId : `${fileId}:${sheetId}`),
    rowCount: readInteger(sourceFile, "rowCount") ?? 0,
    columnCount: readInteger(sourceFile, "columnCount") ?? 0,
    maxCellLengths: readNumberArray(sourceFile.maxCellLengths),
  };
  const shouldDropDefaultTable =
    sheetId !== fileId &&
    isEmptyDefaultTable(record.raw.tablesById[fileId], fileId);
  const tablesById = { ...record.raw.tablesById };
  if (shouldDropDefaultTable) {
    delete tablesById[fileId];
  }
  tablesById[sheetId] = tableRecord;
  const tableOrderBase = shouldDropDefaultTable
    ? record.raw.tableOrder.filter((tableId) => tableId !== fileId)
    : record.raw.tableOrder;
  const tableOrder = tableOrderBase.includes(sheetId)
    ? tableOrderBase
    : [...tableOrderBase, sheetId];
  const changedRawTableIds = new Set<string>();
  const previousTable = record.raw.tablesById[sheetId];
  if (
    !areTableRecordsEqual(previousTable, tableRecord) ||
    record.raw.normalizedCsvPath !== nextNormalizedCsvPath
  ) {
    changedRawTableIds.add(sheetId);
  }
  if (shouldDropDefaultTable) {
    changedRawTableIds.add(fileId);
  }
  const rawTableVersionsById = createRawTableVersions(
    tableOrder,
    record.rawTableVersionsById,
    changedRawTableIds,
  );
  const retainedAssessmentRecords = retainRawTableAssessmentRecords(
    record,
    new Set(tableOrder),
    changedRawTableIds,
  );

  return {
    ...record,
    kind: inferFileKindFromFileName(fileName),
    name: fileName,
    raw: {
      ...record.raw,
      fileId,
      fileName,
      file: sourceFile.file,
      size: readNestedNumber(sourceFile.file, "size") ?? record.raw.size,
      lastModified: readNestedNumber(sourceFile.file, "lastModified") ??
        record.raw.lastModified,
      rawKey: readRecordString(sourceFile, "rawKey") ?? record.raw.rawKey,
      relativePath: readRecordString(sourceFile, "relativePath") ??
        record.raw.relativePath,
      filePath: readRecordString(sourceFile, "sourcePath") ?? record.raw.filePath,
      normalizedCsvPath: nextNormalizedCsvPath,
      tablesById,
      tableOrder,
    },
    rawTableVersionsById,
    ...retainedAssessmentRecords,
  };
};

const isEmptyDefaultTable = (
  table: RawRecord["tablesById"][string] | undefined,
  fileId: string,
): boolean =>
  table !== undefined &&
  table.fileId === fileId &&
  table.sheetId === fileId &&
  table.tableKey === fileId &&
  table.sheetName == null &&
  table.rowCount === 0 &&
  table.columnCount === 0 &&
  table.maxCellLengths.length === 0;

const createRawTableVersions = (
  rawTableOrder: readonly string[],
  previousVersions: Readonly<Record<string, number>> = {},
  changedRawTableIds: ReadonlySet<string> = new Set<string>(),
): Record<string, number> => {
  const versions: Record<string, number> = {};
  for (const rawTableId of rawTableOrder) {
    const previousVersion = Math.max(0, Math.floor(previousVersions[rawTableId] ?? 0));
    versions[rawTableId] = changedRawTableIds.has(rawTableId)
      ? previousVersion + 1
      : previousVersion;
  }

  return versions;
};

const areTableRecordsEqual = (
  current: RawRecord["tablesById"][string] | undefined,
  next: RawRecord["tablesById"][string],
): boolean =>
  current !== undefined &&
  current.fileId === next.fileId &&
  current.sheetId === next.sheetId &&
  current.sheetName === next.sheetName &&
  current.tableKey === next.tableKey &&
  current.rowCount === next.rowCount &&
  current.columnCount === next.columnCount &&
  areNumberArraysEqual(current.maxCellLengths, next.maxCellLengths);

const retainRawTableAssessmentRecords = (
  record: FileRecord,
  liveRawTableIds: ReadonlySet<string>,
  changedRawTableIds: ReadonlySet<string>,
): Pick<FileRecord, "assessmentsByRawTableId" | "measurementBlocksById" | "measurementBlockOrder"> => {
  const assessmentsByRawTableId = filterRecord(
    record.assessmentsByRawTableId ?? {},
    rawTableId => liveRawTableIds.has(rawTableId) && !changedRawTableIds.has(rawTableId),
  );
  const measurementBlocksById = filterRecord(
    record.measurementBlocksById ?? {},
    (_blockId, block) =>
      liveRawTableIds.has(block.rawTableId) &&
      !changedRawTableIds.has(block.rawTableId),
  );

  return {
    assessmentsByRawTableId,
    measurementBlocksById,
    measurementBlockOrder: (record.measurementBlockOrder ?? []).filter(blockId =>
      Boolean(measurementBlocksById[blockId])
    ),
  };
};

const areNumberArraysEqual = (
  current: readonly number[],
  next: readonly number[],
): boolean => {
  if (current.length !== next.length) {
    return false;
  }

  for (let index = 0; index < current.length; index += 1) {
    if (current[index] !== next[index]) {
      return false;
    }
  }

  return true;
};

const filterRecord = <T>(
  record: Readonly<Record<string, T>>,
  predicate: (key: string, value: T) => boolean,
): Record<string, T> => {
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    if (predicate(key, value)) {
      next[key] = value;
    }
  }

  return next;
};

export const mergeRawFilesIntoRecords = (
  filesById: Readonly<Record<FileId, FileRecord>>,
  fileOrder: readonly FileId[],
  rawFiles: readonly SessionFile[],
): Pick<SessionSnapshot, "filesById" | "fileOrder"> => {
  const nextFilesById: Record<FileId, FileRecord> = { ...filesById };
  const nextFileOrder: FileId[] = [];
  const seen = new Set<FileId>();
  const pushFileId = (fileId: string): void => {
    const normalizedFileId = normalizeId(fileId);
    if (!normalizedFileId || seen.has(normalizedFileId)) {
      return;
    }

    seen.add(normalizedFileId);
    nextFileOrder.push(normalizedFileId);
  };

  for (const fileId of fileOrder) {
    if (nextFilesById[fileId]) {
      pushFileId(fileId);
    }
  }
  for (const fileId of Object.keys(nextFilesById)) {
    pushFileId(fileId);
  }

  for (const rawFile of rawFiles) {
    const fileId = readRecordString(rawFile, "fileId");
    if (!fileId) {
      continue;
    }

    const current = nextFilesById[fileId] ??
      createEmptyFileRecord(
        fileId,
        readRecordString(rawFile, "fileName") ?? fileId,
      );
    nextFilesById[fileId] = mergeSourceFileRecord(current, rawFile);
    pushFileId(fileId);
  }

  return {
    filesById: nextFilesById,
    fileOrder: nextFileOrder,
  };
};

export const createRawFilesFromRecords = (
  filesById: Readonly<Record<FileId, FileRecord>>,
  fileOrder: readonly FileId[],
): SessionFile[] => {
  const rawFiles: SessionFile[] = [];
  for (const file of getOrderedFileRecords(filesById, fileOrder)) {
    const baseFile: SessionFile = {
      file: file.raw.file,
      fileId: file.id,
      fileName: file.raw.fileName,
      normalizedCsvPath: file.raw.normalizedCsvPath ?? null,
      rawKey: file.raw.rawKey,
      relativePath: file.raw.relativePath ?? null,
      sourcePath: file.raw.filePath ?? null,
      curveType: getFileRecordCurveType(file) ?? null,
    };
    const pushedTableIds = new Set<string>();
    const pushTable = (tableId: string): void => {
      if (pushedTableIds.has(tableId)) {
        return;
      }
      pushedTableIds.add(tableId);

      const table = file.raw.tablesById[tableId];
      if (!table) {
        return;
      }

      rawFiles.push({
        ...baseFile,
        ...createRawFileAssessmentSummary(file, tableId),
        sheetId: table.sheetId,
        sheetName: table.sheetName ?? null,
        sourceKey: table.tableKey,
        sourceVersion: file.rawTableVersionsById?.[tableId] ?? 0,
        rowCount: table.rowCount,
        columnCount: table.columnCount,
        maxCellLengths: table.maxCellLengths,
      });
    };

    for (const tableId of file.raw.tableOrder) {
      pushTable(tableId);
    }
    for (const tableId of Object.keys(file.raw.tablesById)) {
      pushTable(tableId);
    }
    if (!pushedTableIds.size) {
      rawFiles.push({
        ...baseFile,
        ...createRawFileAssessmentSummary(file),
      });
    }
  }

  return rawFiles;
};

type RawFileAssessmentSummary = Pick<
  SessionFile,
  | "curveType"
  | "curveTypeConfidence"
  | "curveTypeNeedsTemplate"
  | "curveTypeReasons"
  | "xAxisRole"
  | "xAxisRoleSource"
>;

const createRawFileAssessmentSummary = (
  file: FileRecord,
  rawTableId?: string,
): RawFileAssessmentSummary => {
  const rawAssessment = rawTableId
    ? file.assessmentsByRawTableId?.[rawTableId]
    : undefined;
  const block = rawAssessment?.blocks.find((candidate) => candidate.family !== "unknown") ??
    rawAssessment?.blocks[0] ??
    (rawTableId
      ? undefined
      : file.measurementBlockOrder
          .map((blockId) => file.measurementBlocksById[blockId])
          .find(Boolean));
  const xAxisRole = createXAxisRoleFromMeasurementBlock(block);
  const curveType = createCurveTypeFromMeasurementBlock(block, xAxisRole) ??
    getFileRecordCurveType(file);
  const reasons = rawAssessment?.diagnostics
    ?.map((diagnostic) => normalizeOptionalText(diagnostic.message))
    .filter((message): message is string => Boolean(message));

  return {
    curveType: curveType ?? null,
    curveTypeConfidence: normalizeBlockConfidence(block?.confidence),
    curveTypeNeedsTemplate: block ? block.family === "unknown" : undefined,
    curveTypeReasons: reasons?.length ? reasons : undefined,
    xAxisRole,
    xAxisRoleSource: xAxisRole ? "metadata" : null,
  };
};

const createCurveTypeFromMeasurementBlock = (
  block: FileRecord["measurementBlocksById"][string] | undefined,
  xAxisRole: SessionFile["xAxisRole"],
): string | null => {
  if (!block || block.family === "unknown") {
    return null;
  }
  if (block.family === "iv") {
    if (block.ivMode === "transfer") {
      return xAxisRole === "vg" ? "transfer (vg)" : "transfer";
    }
    if (block.ivMode === "output") {
      return xAxisRole === "vd" ? "output (vd)" : "output";
    }
    return "iv";
  }
  return block.family;
};

const createXAxisRoleFromMeasurementBlock = (
  block: FileRecord["measurementBlocksById"][string] | undefined,
): SessionFile["xAxisRole"] => {
  if (!block || block.family !== "iv") {
    return null;
  }
  if (block.ivMode === "transfer") {
    return "vg";
  }
  if (block.ivMode === "output") {
    return "vd";
  }
  return null;
};

const normalizeBlockConfidence = (
  value: number | undefined,
): SessionFile["curveTypeConfidence"] | undefined => {
  if (!Number.isFinite(value)) {
    return undefined;
  }
  const confidence = Number(value);
  if (confidence >= 0.8) {
    return "high";
  }
  if (confidence >= 0.5) {
    return "medium";
  }
  return "low";
};

export const mergeProcessedFileIntoRecords = (
  filesById: Readonly<Record<FileId, FileRecord>>,
  fileOrder: readonly FileId[],
  file: ProcessedEntry,
  _snapshot: SessionSnapshot,
  options: MergeProcessedFileOptions = {},
): Pick<SessionSnapshot, "filesById" | "fileOrder"> => {
  const fileId = readRecordString(file, "fileId");
  if (!fileId) {
    return {
      filesById: { ...filesById },
      fileOrder: [...fileOrder],
    };
  }

  const current = filesById[fileId] ??
    createEmptyFileRecord(
      fileId,
      readRecordString(file, "fileName") ?? fileId,
    );
  let record = mergeProcessedFileRecord(
    stripProcessedFileRecord(current),
    file,
    options,
  );
  const cachePayload = getProcessedCalculationCachePayload(file);
  if (cachePayload) {
    record = mergeCalculationCacheRecord(record, cachePayload);
  }

  return {
    filesById: {
      ...filesById,
      [fileId]: record,
    },
    fileOrder: appendOrderedId(fileOrder, Object.keys(filesById), fileId),
  };
};

export const createProcessedFileSessionCommit = (
  snapshot: SessionSnapshot,
  file: ProcessedEntry | null | undefined,
  options: MergeProcessedFileOptions = {},
): ProcessedFileSessionCommit | null => {
  if (!file || typeof file !== "object") {
    return null;
  }

  const fileId = readRecordString(file, "fileId");
  if (!fileId) {
    return null;
  }

  const current = snapshot.filesById[fileId] ??
    createEmptyFileRecord(
      fileId,
      readRecordString(file, "fileName") ?? fileId,
    );
  let record = mergeProcessedFileRecord(
    stripProcessedFileRecord(current),
    file,
    options,
  );
  const cachePayload = getProcessedCalculationCachePayload(file);
  if (cachePayload) {
    record = mergeCalculationCacheRecord(record, cachePayload);
  }

  const templateRun = getLatestTemplateRunRecord(record);
  if (!templateRun) {
    return null;
  }

  return {
    templateRun: {
      run: templateRun,
      calculationCache: record.calculationCache,
      fileName: record.raw.fileName,
      seriesById: record.seriesById,
      seriesOrder: record.seriesOrder,
    },
    curves: {
      fileId,
      curves: Object.values(record.curvesByKey).filter((curve) =>
        curve.curveGeneration === "base"
      ),
      replaceGenerations: ["base"],
    },
    metrics: {
      fileId,
      metrics: Object.values(record.metricsByKey),
      replace: true,
    },
  };
};

export const resetProcessedRecords = (
  filesById: Readonly<Record<FileId, FileRecord>>,
  fileOrder: readonly FileId[],
  fileIds?: readonly FileId[],
): Pick<SessionSnapshot, "filesById" | "fileOrder"> => {
  const targetFileIds = fileIds
    ? new Set(fileIds.map(normalizeId).filter(Boolean))
    : null;
  const nextFilesById: Record<FileId, FileRecord> = {};
  let changed = false;
  for (const [fileId, file] of Object.entries(filesById)) {
    if (targetFileIds && !targetFileIds.has(fileId)) {
      nextFilesById[fileId] = file;
      continue;
    }

    if (hasProcessedFileRecord(file)) {
      nextFilesById[fileId] = stripProcessedFileRecord(file);
      changed = true;
      continue;
    }

    nextFilesById[fileId] = file;
  }

  return {
    filesById: changed ? nextFilesById : filesById as Record<FileId, FileRecord>,
    fileOrder: [...fileOrder],
  };
};

export const replaceCalculatedCurvesInRecords = (
  filesById: Readonly<Record<FileId, FileRecord>>,
  fileOrder: readonly FileId[],
  nextPlotsByKey: CalculatedPlotsByKey,
): Pick<SessionSnapshot, "filesById" | "fileOrder"> => {
  const nextFilesById: Record<FileId, FileRecord> = {};
  for (const [fileId, file] of Object.entries(filesById)) {
    nextFilesById[fileId] = {
      ...file,
      curvesByKey: filterCurveRecords(file.curvesByKey, (_key, curve) =>
        curve.curveGeneration === "base"
      ),
    };
  }
  const nextFileOrder = appendCalculatedFileOrder(fileOrder, nextPlotsByKey);

  for (const calculatedData of Object.values(nextPlotsByKey)) {
    const fileId = normalizeId(calculatedData.source.fileId ?? calculatedData.activeFile?.fileId);
    if (!fileId) {
      continue;
    }

    let record = nextFilesById[fileId] ??
      createEmptyFileRecord(fileId, calculatedData.activeFile?.fileName ?? fileId);
    for (const curve of createCalculatedCurveRecords(calculatedData, fileId)) {
      record = {
        ...record,
        curvesByKey: {
          ...record.curvesByKey,
          [createCurveRecordKey(curve)]: curve,
        },
      };
    }

    nextFilesById[fileId] = record;
  }

  return {
    filesById: nextFilesById,
    fileOrder: nextFileOrder.filter((fileId) => nextFilesById[fileId]),
  };
};

export const createCalculatedCurveRecordsByFile = (
  plotsByKey: CalculatedPlotsByKey,
): Record<FileId, CurveRecord[]> => {
  const recordsByFileId: Record<FileId, CurveRecord[]> = {};
  for (const calculatedData of Object.values(plotsByKey)) {
    const fileId = normalizeId(calculatedData.source.fileId ?? calculatedData.activeFile?.fileId);
    if (!fileId) {
      continue;
    }

    const records = createCalculatedCurveRecords(calculatedData, fileId);
    if (records.length) {
      recordsByFileId[fileId] = [
        ...(recordsByFileId[fileId] ?? []),
        ...records,
      ];
    }
  }

  return recordsByFileId;
};

const createCalculatedCurveRecords = (
  calculatedData: CalculatedData,
  fileId: FileId,
): CurveRecord[] => {
  const curves: CurveRecord[] = [];
  for (const series of calculatedData.seriesList) {
    const curve = createCurveRecordFromCalculatedSeries(calculatedData, series, fileId);
    if (!curve || curve.curveGeneration === "base") {
      continue;
    }

    curves.push(curve);
  }

  return curves;
};

export const mergeFileSemanticsIntoRecords = (
  filesById: Readonly<Record<FileId, FileRecord>>,
  fileOrder: readonly FileId[],
  semantics: FileSemantics,
): Pick<SessionSnapshot, "filesById" | "fileOrder"> => {
  const fileId = normalizeId(semantics.fileId);
  if (!fileId) {
    return {
      filesById: { ...filesById },
      fileOrder: [...fileOrder],
    };
  }

  const current = filesById[fileId] ??
    createEmptyFileRecord(fileId, semantics.sourceFileName ?? fileId);
  const record = mergeFileSemanticsRecord(current, semantics);
  return {
    filesById: {
      ...filesById,
      [fileId]: record,
    },
    fileOrder: appendOrderedId(fileOrder, Object.keys(filesById), fileId),
  };
};

export const mergeCurveDataIntoRecords = (
  filesById: Readonly<Record<FileId, FileRecord>>,
  fileOrder: readonly FileId[],
  data: CurveData,
): Pick<SessionSnapshot, "filesById" | "fileOrder"> => {
  const curve = createCurveRecordFromLegacyCurve(data);
  if (!curve) {
    return {
      filesById: { ...filesById },
      fileOrder: [...fileOrder],
    };
  }

  const current = filesById[curve.fileId] ??
    createEmptyFileRecord(curve.fileId, curve.fileId);
  return {
    filesById: {
      ...filesById,
      [curve.fileId]: {
        ...current,
        curvesByKey: {
          ...current.curvesByKey,
          [createCurveRecordKey(curve)]: curve,
        },
      },
    },
    fileOrder: appendOrderedId(fileOrder, Object.keys(filesById), curve.fileId),
  };
};

export const removeCurveDataFromRecords = (
  filesById: Readonly<Record<FileId, FileRecord>>,
  fileOrder: readonly FileId[],
  key: LegacyCurveKey,
): Pick<SessionSnapshot, "filesById" | "fileOrder"> => {
  const fileId = normalizeId(key.fileId);
  const curveKey = createCurveRecordKeyFromLegacyKey(key);
  const file = fileId ? filesById[fileId] : undefined;
  if (!file || !curveKey || !file.curvesByKey[curveKey]) {
    return {
      filesById: { ...filesById },
      fileOrder: [...fileOrder],
    };
  }

  const curvesByKey = { ...file.curvesByKey };
  delete curvesByKey[curveKey];
  return {
    filesById: {
      ...filesById,
      [fileId]: {
        ...file,
        curvesByKey,
      },
    },
    fileOrder: [...fileOrder],
  };
};

export const pruneCurveDataRecords = (
  filesById: Readonly<Record<FileId, FileRecord>>,
  fileOrder: readonly FileId[],
  liveFileIds: ReadonlySet<string>,
  liveCurveKeys: ReadonlySet<string>,
): Pick<SessionSnapshot, "filesById" | "fileOrder"> => {
  const nextFilesById: Record<FileId, FileRecord> = {};
  for (const [fileId, file] of Object.entries(filesById)) {
    if (!liveFileIds.has(fileId)) {
      nextFilesById[fileId] = file;
      continue;
    }

    nextFilesById[fileId] = {
      ...file,
      curvesByKey: filterCurveRecords(file.curvesByKey, (curveKey) =>
        !isCurveRecordKey(curveKey) || liveCurveKeys.has(curveKey)
      ),
    };
  }

  return {
    filesById: nextFilesById,
    fileOrder: [...fileOrder],
  };
};

export const createCanonicalCurveKeyFromCurveKey = (
  key: LegacyCurveKey,
): SessionCurveKey | null => createCurveRecordKeyFromLegacyKey(key);

const getOrderedFileRecords = (
  filesById: Readonly<Record<FileId, FileRecord>>,
  fileOrder: readonly FileId[],
): FileRecord[] => {
  const files: FileRecord[] = [];
  const seen = new Set<FileId>();
  const pushFile = (fileId: string): void => {
    const normalizedFileId = normalizeId(fileId);
    if (!normalizedFileId || seen.has(normalizedFileId)) {
      return;
    }
    seen.add(normalizedFileId);

    const file = filesById[normalizedFileId];
    if (file) {
      files.push(file);
    }
  };

  for (const fileId of fileOrder) {
    pushFile(fileId);
  }
  for (const fileId of Object.keys(filesById)) {
    pushFile(fileId);
  }

  return files;
};

const appendOrderedId = (
  primaryOrder: readonly string[],
  fallbackOrder: readonly string[],
  id: string,
): string[] => {
  const order: string[] = [];
  const seen = new Set<string>();
  const pushId = (value: string): void => {
    const normalized = normalizeId(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    order.push(normalized);
  };

  for (const value of primaryOrder) {
    pushId(value);
  }
  for (const value of fallbackOrder) {
    pushId(value);
  }
  pushId(id);
  return order;
};

const appendCalculatedFileOrder = (
  fileOrder: readonly FileId[],
  plotsByKey: CalculatedPlotsByKey,
): FileId[] => {
  let nextFileOrder = [...fileOrder];
  for (const calculatedData of Object.values(plotsByKey)) {
    const fileId = normalizeId(calculatedData.source.fileId ?? calculatedData.activeFile?.fileId);
    if (fileId && !nextFileOrder.includes(fileId)) {
      nextFileOrder = [...nextFileOrder, fileId];
    }
  }

  return nextFileOrder;
};

const stripProcessedFileRecord = (file: FileRecord): FileRecord => ({
  ...file,
  templateRunsById: {},
  latestTemplateRunId: undefined,
  seriesById: {},
  seriesOrder: [],
  curvesByKey: filterCurveRecords(file.curvesByKey, (_key, curve) =>
    curve.curveGeneration !== "base"
  ),
  metricsByKey: {},
  metricsBySeriesId: undefined,
  metricInputsByKey: undefined,
  calculationCache: undefined,
});

const hasProcessedFileRecord = (file: FileRecord): boolean =>
  Object.keys(file.templateRunsById).length > 0 ||
  file.latestTemplateRunId !== undefined ||
  Object.keys(file.seriesById).length > 0 ||
  file.seriesOrder.length > 0 ||
  Object.values(file.curvesByKey).some(curve => curve.curveGeneration === "base") ||
  Object.keys(file.metricsByKey).length > 0 ||
  file.metricsBySeriesId !== undefined ||
  file.metricInputsByKey !== undefined ||
  file.calculationCache !== undefined;

const filterCurveRecords = (
  curvesByKey: Readonly<Record<SessionCurveKey, CurveRecord>>,
  predicate: (key: SessionCurveKey, value: CurveRecord) => boolean,
): Record<SessionCurveKey, CurveRecord> => {
  const next: Record<SessionCurveKey, CurveRecord> = {};
  let changed = false;
  for (const [key, value] of Object.entries(curvesByKey)) {
    if (predicate(key as SessionCurveKey, value)) {
      next[key as SessionCurveKey] = value;
    } else {
      changed = true;
    }
  }

  return changed ? next : { ...curvesByKey };
};

const createCurveRecordKeyFromLegacyKey = (
  key: LegacyCurveKey,
): SessionCurveKey | null => {
  const seriesId = normalizeId(key.seriesId);
  if (!seriesId) {
    return null;
  }

  const kind = normalizeOptionalText(key.curveKind) ?? "unknown";
  const baseFamily = inferBaseCurveFamily(kind);
  if (baseFamily) {
    return createBaseCurveKey(
      baseFamily,
      inferIvCurveMode(kind),
      inferItCurveMode(kind),
      seriesId,
    );
  }

  const derivedFamily = inferDerivedCurveFamily(kind);
  if (derivedFamily) {
    return `derived:${derivedFamily}:default:${seriesId}` as SessionCurveKey;
  }

  return kind === "secondDerivative"
    ? `secondDerived:secondDerivative:default:${seriesId}` as SessionCurveKey
    : null;
};

const isCurveRecordKey = (key: SessionCurveKey): boolean =>
  key.startsWith("base:") ||
  key.startsWith("derived:") ||
  key.startsWith("secondDerived:");

const mergeCalculationCacheRecord = (
  record: FileRecord,
  payload: ProcessedCalculationCachePayload,
): FileRecord => {
  const fileId = normalizeId(payload.fileId);
  if (!fileId) {
    return record;
  }

  return {
    ...record,
    calculationCache: {
      fileId,
      touchedAt: payload.touchedAt,
      entriesByKey: createCalculationCacheEntries(payload.cache),
    },
  };
};

const createCalculationCacheEntries = (
  cache: unknown,
): Record<CacheKey, CalculationCacheEntry> => {
  const entries: Record<CacheKey, CalculationCacheEntry> = {};
  if (!isObjectRecord(cache) || !isCompatibleCalculationCachePayload(cache)) {
    return entries;
  }

  const seriesById = cache.series;
  if (!isObjectRecord(seriesById)) {
    return entries;
  }

  for (const [rawSeriesId, result] of Object.entries(seriesById)) {
    const seriesId = normalizeId(rawSeriesId);
    if (!seriesId || !isObjectRecord(result)) {
      continue;
    }

    appendCalculationCacheEntry(entries, seriesId, "baseCurrent", result.baseCurrent);
    appendCalculationCacheEntry(entries, seriesId, "gm", result.gm);
    appendCalculationCacheEntry(entries, seriesId, "localSs", result.ss);
    appendCalculationCacheEntry(entries, seriesId, "ssFitAuto", result.ssFitAuto);
  }

  return entries;
};

const appendCalculationCacheEntry = (
  entries: Record<CacheKey, CalculationCacheEntry>,
  seriesId: string,
  kind: CalculationCacheEntry["kind"],
  value: unknown,
): void => {
  if (value === undefined) {
    return;
  }

  entries[`${kind}:${seriesId}` as CacheKey] = {
    inputSignatures: [],
    kind,
    value,
  };
};

const isCompatibleCalculationCachePayload = (
  cache: Record<string, unknown>,
): boolean => {
  const version = Number(cache.version);
  return !Number.isFinite(version) || version === CALCULATION_CACHE_PAYLOAD_VERSION;
};

const getProcessedCalculationCachePayload = (
  file: ProcessedEntry,
): ProcessedCalculationCachePayload | null => {
  const fileId = normalizeId(file.fileId);
  if (!fileId || !isObjectRecord(file) || file["analysisCache"] === undefined) {
    return null;
  }

  const touchedAt = Number(file["analysisCacheTouchedAt"]);
  return {
    fileId,
    cache: file["analysisCache"],
    touchedAt: Number.isFinite(touchedAt) && touchedAt > 0 ? touchedAt : undefined,
  };
};

const mergeProcessedFileRecord = (
  record: FileRecord,
  processedFile: ProcessedEntry,
  options: MergeProcessedFileOptions = {},
): FileRecord => {
  const fileId = readRecordString(processedFile, "fileId") ?? record.id;
  const emptyTemplateConfig = createEmptyTemplateConfig();
  const templateConfig = createTemplateConfigRecordFromAppliedConfig(
    options.appliedTemplateConfig,
    emptyTemplateConfig,
    processedFile,
  );
  const xGroups = readNumberMatrix(processedFile.xGroups);
  const seriesById: Record<string, SeriesRecord> = {};
  const seriesOrder: string[] = [];
  const curvesByKey: Record<SessionCurveKey, CurveRecord> = {};
  const metricsByKey: Record<MetricKey, MetricRecord> = {};
  const metricsBySeriesId: Record<SeriesId, MetricKey[]> = {};
  const curveType = readRecordString(processedFile, "curveType");
  const ivMode = inferIvCurveMode(
    curveType ??
      readRecordString(processedFile, "curveFilterKey") ??
      readRecordString(processedFile, "curveFilterField"),
    readRecordString(processedFile, "xAxisRole"),
  );
  const itMode = inferItCurveMode(curveType);
  const family = inferBaseCurveFamily(curveType) ?? (ivMode ? "iv" : itMode ? "it" : null);

  for (const [index, sourceSeries] of (processedFile.series ?? []).entries()) {
    const seriesId = readRecordString(sourceSeries, "id") ?? `series-${index + 1}`;
    const groupIndex = readInteger(sourceSeries, "groupIndex") ?? index;
    const y = readNumberArray(sourceSeries.y);
    seriesById[seriesId] = {
      fileId,
      sheetId: readRecordString(processedFile, "sheetId") ?? undefined,
      id: seriesId,
      name: readRecordString(sourceSeries, "name"),
      legendValue: readRecordString(sourceSeries, "legendValue"),
      groupIndex,
      yCol: readInteger(sourceSeries, "yCol") ?? undefined,
      y,
    };
    seriesOrder.push(seriesId);

    if (!family) {
      continue;
    }

    const x = xGroups[groupIndex] ?? [];
    const points = createCurvePoints(x, y);
    if (!points.length) {
      continue;
    }

    const channels = createCurveChannels(points.map((point) => point.y));
    const key = createBaseCurveKey(family, ivMode, itMode, seriesId);
    curvesByKey[key] = {
      fileId,
      seriesId,
      curveGeneration: "base",
      curveFamily: family,
      ivMode: family === "iv" ? ivMode : undefined,
      itMode: family === "it" ? itMode : undefined,
      lineage: {
        curveGeneration: "base",
        baseFamily: family,
        ivMode: family === "iv" ? ivMode : undefined,
        itMode: family === "it" ? itMode : undefined,
        baseSeries: { fileId, seriesId },
      },
      points,
      channels,
      domain: createDomainRecord(points, channels),
      signature: createPointsSignature("base", fileId, seriesId, points),
    };
  }

  const metricProjection = createMetricProjectionFromProcessedFile({
    curvesByKey,
    family,
    file: processedFile,
    fileId,
    itMode,
    ivMode,
    seriesOrder,
  });
  for (const [key, metric] of Object.entries(metricProjection.metricsByKey)) {
    metricsByKey[key as MetricKey] = metric;
  }
  for (const [seriesId, keys] of Object.entries(metricProjection.metricsBySeriesId)) {
    metricsBySeriesId[seriesId] = keys;
  }

  const latestTemplateRun = getLatestTemplateRunRecord(record);
  const templateSelection =
    options.appliedTemplateSelection ??
    latestTemplateRun?.selection ??
    { kind: "auto" as const };
  const fileName = readRecordString(processedFile, "fileName") ?? record.raw.fileName;
  const configFingerprint = JSON.stringify(
    options.appliedTemplateConfig ?? emptyTemplateConfig,
  );
  const appliedAt = readNumber(processedFile, "appliedAt") ?? 0;
  const templateRun = createTemplateRunRecord({
    appliedAt,
    config: templateConfig,
    configFingerprint,
    errors: readStringArray(processedFile.errors),
    fileId,
    mode: templateSelection.kind === "auto" ? "auto" : "manual",
    outputCurveKeys: Object.keys(curvesByKey) as SessionCurveKey[],
    outputSeriesIds: seriesOrder,
    selection: templateSelection,
    sourceBlockIds: readStringArray(processedFile.sourceBlockIds),
    warnings: readStringArray(processedFile.warnings),
  });

  return {
    ...record,
    name: fileName,
    raw: {
      ...record.raw,
      fileName,
    },
    templateRunsById: {
      ...record.templateRunsById,
      [templateRun.id]: templateRun,
    },
    latestTemplateRunId: templateRun.id,
    seriesById,
    seriesOrder,
    curvesByKey: {
      ...record.curvesByKey,
      ...curvesByKey,
    },
    metricsByKey: {
      ...record.metricsByKey,
      ...metricsByKey,
    },
    metricsBySeriesId: mergeMetricsBySeriesId(
      record.metricsBySeriesId,
      metricsBySeriesId,
    ),
  };
};

const createTemplateRunRecord = ({
  appliedAt,
  config,
  configFingerprint,
  errors,
  fileId,
  mode,
  outputCurveKeys,
  outputSeriesIds,
  selection,
  sourceBlockIds,
  warnings,
}: {
  readonly appliedAt: number;
  readonly config: TemplateConfigRecord;
  readonly configFingerprint: string;
  readonly errors: readonly string[];
  readonly fileId: FileId;
  readonly mode: TemplateRunRecord["mode"];
  readonly outputCurveKeys: readonly SessionCurveKey[];
  readonly outputSeriesIds: readonly SeriesId[];
  readonly selection: TemplateSelectionRecord;
  readonly sourceBlockIds: readonly string[];
  readonly warnings: readonly string[];
}): TemplateRunRecord => {
  const id = createTemplateRunId(fileId, appliedAt, configFingerprint);
  return {
    id,
    fileId,
    selection,
    config,
    sourceBlockIds: [...sourceBlockIds],
    outputSeriesIds: [...outputSeriesIds],
    outputCurveKeys: [...outputCurveKeys],
    configFingerprint,
    mode,
    appliedAt,
    warnings: [...warnings],
    errors: [...errors],
  };
};

const createTemplateRunId = (
  fileId: FileId,
  appliedAt: number,
  configFingerprint: string,
): TemplateRunId =>
  `template-run:${fileId}:${Math.max(0, Math.floor(appliedAt))}:${hashString(configFingerprint)}`;

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const mergeFileSemanticsRecord = (
  record: FileRecord,
  semantics: FileSemantics,
): FileRecord => {
  const fileName = normalizeOptionalText(semantics.sourceFileName) ?? record.raw.fileName;
  const latestTemplateRun = getLatestTemplateRunRecord(record);
  const nextTemplateRun = semantics.templateId && latestTemplateRun
    ? {
        ...latestTemplateRun,
        selection: {
          kind: "template" as const,
          templateId: semantics.templateId,
        },
        mode: "manual" as const,
      }
    : undefined;
  return {
    ...record,
    name: fileName,
    raw: {
      ...record.raw,
      fileName,
    },
    ...(nextTemplateRun
      ? {
          templateRunsById: {
            ...record.templateRunsById,
            [nextTemplateRun.id]: nextTemplateRun,
          },
          latestTemplateRunId: nextTemplateRun.id,
        }
      : {}),
  };
};

const inferFileKindFromFileName = (fileName: unknown): FileRecord["kind"] => {
  const normalized = String(fileName ?? "").trim().toLowerCase();
  if (/\.(xls|xlsx)$/.test(normalized)) {
    return "excel";
  }
  if (/\.csv$/.test(normalized)) {
    return "csv";
  }
  return "unknown";
};

type MetricProjectionInput = {
  curvesByKey: Record<SessionCurveKey, CurveRecord>;
  family: BaseCurveFamily | null;
  file: ProcessedEntry;
  fileId: string;
  itMode: ItCurveMode | null;
  ivMode: IvCurveMode | null;
  seriesOrder: readonly string[];
};

type MetricProjection = {
  metricsByKey: Record<MetricKey, MetricRecord>;
  metricsBySeriesId: Record<SeriesId, MetricKey[]>;
};

const createMetricProjectionFromProcessedFile = ({
  curvesByKey,
  family,
  file,
  fileId,
  itMode,
  ivMode,
  seriesOrder,
}: MetricProjectionInput): MetricProjection => {
  const metricsByKey: Record<MetricKey, MetricRecord> = {};
  const metricsBySeriesId: Record<SeriesId, MetricKey[]> = {};
  const derivativeKind = ivMode === "output" ? "gds" : "gm";

  for (const [index, row] of createParameterRows(file).entries()) {
    const seriesId = resolveMetricSeriesId(row, seriesOrder[index], index);
    const inputCurve = family
      ? createMetricInputCurveRef({
          curvesByKey,
          family,
          fileId,
          itMode,
          ivMode,
          seriesId,
        })
      : null;
    const inputCurves = inputCurve ? [inputCurve] : [];
    const inputSignatures = inputCurves
      .map((curve) => curve.signature)
      .filter((signature) => signature.length > 0);

    appendMetric(metricsByKey, metricsBySeriesId, {
      key: `current:${seriesId}:base` as MetricKey,
      fileId,
      seriesId,
      metricFamily: "current",
      contextKey: "base",
      inputCurves,
      inputSignatures,
      algorithm: { id: "computeBaseCurrentMetrics" },
      value: {
        method: normalizeCurrentMethod(row.currentMethod),
        ion: normalizeNumberOrNull(row.ion),
        xAtIon: normalizeNumberOrNull(row.xAtIon),
        ioff: normalizeNumberOrNull(row.ioff),
        xAtIoff: normalizeNumberOrNull(row.xAtIoff),
        ionIoff: normalizeNumberOrNull(row.ionIoff),
        candidateWindows: normalizeCurrentWindows(row.currentCandidateWindows),
        ionWindow: normalizeCurrentWindow(row.ionWindow),
        ioffWindow: normalizeCurrentWindow(row.ioffWindow),
      },
    });

    appendMetric(metricsByKey, metricsBySeriesId, {
      key: `derivative:${seriesId}:${derivativeKind}` as MetricKey,
      fileId,
      seriesId,
      metricFamily: "derivative",
      contextKey: derivativeKind,
      inputCurves,
      inputSignatures,
      algorithm: { id: "computeCentralDerivative" },
      value: {
        kind: derivativeKind,
        maxAbs: normalizeNumberOrNull(row.gmMaxAbs),
        xAtMaxAbs: normalizeNumberOrNull(row.xAtGmMaxAbs),
      },
    });

    appendMetric(metricsByKey, metricsBySeriesId, {
      key: `subthreshold:${seriesId}:ss:auto` as MetricKey,
      fileId,
      seriesId,
      metricFamily: "subthreshold",
      contextKey: "ss:auto",
      inputCurves,
      inputSignatures,
      algorithm: { id: "computeSubthresholdSwingFitAuto" },
      value: {
        ss: normalizeNumberOrNull(row.ss),
        confidence: normalizeSsConfidence(row.ssConfidence),
        xAtSs: normalizeNumberOrNull(row.xAtSs),
        method: "auto",
      },
    });

    const thresholdVoltage = normalizeNumberOrNull(row.thresholdVoltage);
    const thresholdVoltageElectron = normalizeNumberOrNull(row.thresholdVoltageElectron);
    const thresholdVoltageHole = normalizeNumberOrNull(row.thresholdVoltageHole);
    if (
      thresholdVoltage !== null ||
      thresholdVoltageElectron !== null ||
      thresholdVoltageHole !== null
    ) {
      appendMetric(metricsByKey, metricsBySeriesId, {
        key: `threshold:${seriesId}:vth` as MetricKey,
        fileId,
        seriesId,
        metricFamily: "threshold",
        contextKey: "vth",
        inputCurves,
        inputSignatures,
        algorithm: { id: "computeVthSqrtFits" },
        value: {
          vth: thresholdVoltage,
          electron: thresholdVoltageElectron,
          hole: thresholdVoltageHole,
          fitQuality: "good",
        },
      });
    }
  }

  return {
    metricsByKey,
    metricsBySeriesId,
  };
};

const appendMetric = (
  metricsByKey: Record<MetricKey, MetricRecord>,
  metricsBySeriesId: Record<SeriesId, MetricKey[]>,
  metric: MetricRecord,
): void => {
  metricsByKey[metric.key] = metric;
  metricsBySeriesId[metric.seriesId] = [
    ...(metricsBySeriesId[metric.seriesId] ?? []),
    metric.key,
  ];
};

const createMetricInputCurveRef = ({
  curvesByKey,
  family,
  fileId,
  itMode,
  ivMode,
  seriesId,
}: {
  curvesByKey: Record<SessionCurveKey, CurveRecord>;
  family: BaseCurveFamily;
  fileId: string;
  itMode: ItCurveMode | null;
  ivMode: IvCurveMode | null;
  seriesId: string;
}): CurveRef => {
  const curveKey = createBaseCurveKey(family, ivMode, itMode, seriesId);
  return {
    fileId,
    seriesId,
    curveKey,
    signature: curvesByKey[curveKey]?.signature ?? "",
  };
};

const resolveMetricSeriesId = (
  row: CalculatedParameterRowData & { id?: unknown },
  fallbackSeriesId: string | undefined,
  index: number,
): string => {
  const rowId = normalizeId(row.id);
  if (rowId) {
    return rowId;
  }
  return fallbackSeriesId || `series-${index + 1}`;
};

const normalizeCurrentMethod = (
  value: unknown,
): "auto" | "manual" | "unavailable" =>
  value === "manual" || value === "auto" ? value : "unavailable";

const normalizeSsConfidence = (value: unknown): "high" | "low" | "fail" =>
  value === "high" || value === "low" || value === "fail" ? value : "fail";

const normalizeNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const normalizeCurrentWindows = (value: unknown): CurrentWindowRecord[] =>
  Array.isArray(value)
    ? value
        .map(normalizeCurrentWindow)
        .filter((window): window is CurrentWindowRecord => Boolean(window))
    : [];

const normalizeCurrentWindow = (value: unknown): CurrentWindowRecord | null => {
  if (!isObjectRecord(value)) {
    return null;
  }

  const key = normalizeCurrentWindowKey(value.key);
  if (!key) {
    return null;
  }

  return {
    key,
    label: normalizeOptionalText(value.label) ?? key,
    current: normalizeNumberOrNull(value.current),
    x: normalizeNumberOrNull(value.x),
    x1: normalizeNumberOrNull(value.x1),
    x2: normalizeNumberOrNull(value.x2),
    targetX: normalizeNumberOrNull(value.targetX),
    pointCount: Math.max(0, Math.floor(Number(value.pointCount) || 0)),
  };
};

const normalizeCurrentWindowKey = (
  value: unknown,
): CurrentWindowRecord["key"] | null => {
  switch (value) {
    case "lowEnd":
    case "highEnd":
    case "maxCurrent":
    case "minCurrent":
    case "zeroBias":
    case "manualIon":
    case "manualIoff":
      return value;
    default:
      return null;
  }
};

const mergeMetricsBySeriesId = (
  current: Record<SeriesId, MetricKey[]> | undefined,
  next: Record<SeriesId, MetricKey[]>,
): Record<SeriesId, MetricKey[]> | undefined => {
  const merged = {
    ...(current ?? {}),
    ...next,
  };
  return Object.keys(merged).length ? merged : undefined;
};

const setSeriesLabelOverride = (
  record: FileRecord,
  seriesId: string,
  label: string,
): FileRecord => ({
  ...record,
  seriesById: {
    ...record.seriesById,
    [seriesId]: {
      ...record.seriesById[seriesId]!,
      labelOverride: normalizeOptionalText(label),
    },
  },
});

const createTemplateConfigRecord = (
  config: TemplateConfig,
): TemplateConfigRecord => ({
  name: normalizeOptionalText(config.name),
  xDataStart: parseNumberOr(config.xDataStart, 0),
  xDataEnd: parseNumberOr(config.xDataEnd, 0),
  xSegmentationMode: config.xSegmentationMode,
  xSegmentCount: parseOptionalNumber(config.xSegmentCount),
  xPointsPerGroup: parseOptionalNumber(config.xPointsPerGroup),
  xUnit: normalizeOptionalText(config.xUnit),
  yLegendStart: parseOptionalNumber(config.yLegendStart),
  yLegendCount: parseOptionalNumber(config.yLegendCount),
  yLegendStep: parseOptionalNumber(config.yLegendStep),
  yLegendTarget: config.yLegendTarget,
  yUnit: normalizeOptionalText(config.yUnit),
  stopOnError: Boolean(config.stopOnError),
  bottomTitle: normalizeOptionalText(config.bottomTitle),
  leftTitle: normalizeOptionalText(config.leftTitle),
  legendPrefix: normalizeOptionalText(config.legendPrefix),
  yColumns: Array.isArray(config.yColumns) ? config.yColumns : [],
});

const createTemplateConfigRecordFromAppliedConfig = (
  config: unknown,
  fallback: TemplateConfig,
  processedFile?: ProcessedEntry,
): TemplateConfigRecord => {
  const fallbackRecord = createTemplateConfigRecord(fallback);
  const processedConfig = createTemplateConfigFallbackFromProcessedFile(processedFile);
  if (!isObjectRecord(config)) {
    return {
      ...fallbackRecord,
      ...processedConfig,
    };
  }

  const yCols = readNumberArray(config.yCols);
  const yColumns = yCols.length ? yCols : readNumberArray(config.yColumns);

  return {
    ...fallbackRecord,
    name: normalizeOptionalText(config.name) ?? fallbackRecord.name,
    xDataStart:
      readConfigNumber(config, "xDataStart") ??
      readConfigNumber(config, "startRow") ??
      fallbackRecord.xDataStart,
    xDataEnd:
      readConfigNumber(config, "xDataEnd") ??
      readConfigNumber(config, "endRow") ??
      fallbackRecord.xDataEnd,
    xSegmentationMode: normalizeXSegmentationMode(
      config.xSegmentationMode,
      fallbackRecord.xSegmentationMode,
    ),
    xSegmentCount:
      readConfigNumber(config, "xSegmentCount") ??
      readConfigNumber(config, "segmentCount") ??
      fallbackRecord.xSegmentCount,
    xPointsPerGroup:
      readConfigNumber(config, "xPointsPerGroup") ??
      readConfigNumber(config, "groupSize") ??
      fallbackRecord.xPointsPerGroup,
    xUnit: normalizeOptionalText(config.xUnit) ??
      processedConfig.xUnit ??
      fallbackRecord.xUnit,
    yLegendStart:
      readConfigNumber(config, "yLegendStart") ??
      readConfigNumber(config, "yLegendStartValue") ??
      fallbackRecord.yLegendStart,
    yLegendCount:
      readConfigNumber(config, "yLegendCount") ??
      fallbackRecord.yLegendCount,
    yLegendStep:
      readConfigNumber(config, "yLegendStep") ??
      fallbackRecord.yLegendStep,
    yLegendTarget: normalizeYLegendTarget(
      config.yLegendTarget,
      fallbackRecord.yLegendTarget,
    ),
    yUnit: normalizeOptionalText(config.yUnit) ??
      processedConfig.yUnit ??
      fallbackRecord.yUnit,
    stopOnError:
      typeof config.stopOnError === "boolean"
        ? config.stopOnError
        : fallbackRecord.stopOnError,
    bottomTitle:
      normalizeOptionalText(config.bottomTitle) ??
      processedConfig.bottomTitle ??
      fallbackRecord.bottomTitle,
    leftTitle:
      normalizeOptionalText(config.leftTitle) ??
      processedConfig.leftTitle ??
      fallbackRecord.leftTitle,
    legendPrefix:
      normalizeOptionalText(config.legendPrefix) ?? fallbackRecord.legendPrefix,
    yColumns: yColumns.length ? yColumns : fallbackRecord.yColumns,
  };
};

const createTemplateConfigFallbackFromProcessedFile = (
  processedFile: ProcessedEntry | undefined,
): Partial<TemplateConfigRecord> => {
  if (!processedFile) {
    return {};
  }
  return {
    bottomTitle: readRecordString(processedFile, "bottomTitle") ??
      readRecordString(processedFile, "xLabel"),
    leftTitle: readRecordString(processedFile, "leftTitle") ??
      readRecordString(processedFile, "yLabel"),
    xUnit: readRecordString(processedFile, "xUnit"),
    yUnit: readRecordString(processedFile, "yUnit"),
  };
};

const normalizeXSegmentationMode = (
  value: unknown,
  fallback: TemplateConfigRecord["xSegmentationMode"],
): TemplateConfigRecord["xSegmentationMode"] =>
  value === "points" || value === "segments" || value === "auto"
    ? value
    : fallback;

const normalizeYLegendTarget = (
  value: unknown,
  fallback: TemplateConfigRecord["yLegendTarget"],
): TemplateConfigRecord["yLegendTarget"] =>
  value === "yColumn" || value === "group" || value === "auto"
    ? value
    : fallback;

const createCurveRecordFromLegacyCurve = (
  data: CurveData,
): CurveRecord | null => {
  const fileId = normalizeId(data.fileId);
  const seriesId = normalizeId(data.seriesId);
  if (!fileId || !seriesId) {
    return null;
  }

  const kind = normalizeOptionalText(data.curveKind) ?? "unknown";
  const points = createCurvePoints(
    data.points.map((point) => point.x),
    data.points.map((point) => point.y),
  );
  if (!points.length) {
    return null;
  }

  const channels = createCurveChannels(points.map((point) => point.y));
  const domain = createDomainRecord(points, channels);
  const baseFamily = inferBaseCurveFamily(kind);
  if (baseFamily) {
    const ivMode = inferIvCurveMode(kind);
    const itMode = inferItCurveMode(kind);
    return {
      fileId,
      seriesId,
      curveGeneration: "base",
      curveFamily: baseFamily,
      ivMode: baseFamily === "iv" ? ivMode : undefined,
      itMode: baseFamily === "it" ? itMode : undefined,
      lineage: {
        curveGeneration: "base",
        baseFamily,
        ivMode: baseFamily === "iv" ? ivMode : undefined,
        itMode: baseFamily === "it" ? itMode : undefined,
        baseSeries: { fileId, seriesId },
      },
      points,
      channels,
      domain,
      signature: normalizeOptionalText(data.signature) ??
        createPointsSignature(kind, fileId, seriesId, points),
    };
  }

  const derivedFamily = inferDerivedCurveFamily(kind);
  if (derivedFamily) {
    const inputCurve = createBaseCurveRef(fileId, seriesId);
    return {
      fileId,
      seriesId,
      curveGeneration: "derived",
      curveFamily: derivedFamily,
      lineage: {
        curveGeneration: "derived",
        derivedFamily,
        inputCurve,
      },
      points,
      channels,
      domain,
      signature: normalizeOptionalText(data.signature) ??
        createPointsSignature(kind, fileId, seriesId, points),
    };
  }

  if (kind === "secondDerivative") {
    const inputCurve = createBaseCurveRef(fileId, seriesId);
    return {
      fileId,
      seriesId,
      curveGeneration: "secondDerived",
      curveFamily: "secondDerivative",
      lineage: {
        curveGeneration: "secondDerived",
        secondDerivedFamily: "secondDerivative",
        inputCurve,
      },
      points,
      channels,
      domain,
      signature: normalizeOptionalText(data.signature) ??
        createPointsSignature(kind, fileId, seriesId, points),
    };
  }

  return null;
};

const createCurveRecordFromCalculatedSeries = (
  data: CalculatedData,
  series: CalculatedSeries,
  fileId: string,
): CurveRecord | null => createCurveRecordFromLegacyCurve({
  curveKind: series.kind,
  fileId,
  seriesId: series.id,
  points: series.data,
  signature: `${data.signature}:${series.id}`,
  xDomain: data.xDomain,
  yDomain: data.yDomain,
});

const createBaseCurveRef = (fileId: string, seriesId: string) => ({
  fileId,
  seriesId,
  curveKey: createBaseCurveKey("iv", null, null, seriesId),
  signature: "",
});

const createCurveRecordKey = (curve: CurveRecord): SessionCurveKey => {
  switch (curve.curveGeneration) {
    case "base":
      return createBaseCurveKey(
        curve.curveFamily,
        curve.ivMode ?? null,
        curve.itMode ?? null,
        curve.seriesId,
      );
    case "derived":
      return `derived:${curve.curveFamily}:default:${curve.seriesId}` as SessionCurveKey;
    case "secondDerived":
      return `secondDerived:${curve.curveFamily}:default:${curve.seriesId}` as SessionCurveKey;
  }
};

const createBaseCurveKey = (
  family: BaseCurveFamily,
  ivMode: IvCurveMode | null,
  itMode: ItCurveMode | null,
  seriesId: string,
): SessionCurveKey => {
  const mode = family === "iv"
    ? ivMode ?? "default"
    : family === "it"
      ? itMode ?? "default"
      : "default";
  return `base:${family}:${mode}:${seriesId}` as SessionCurveKey;
};

const createCurvePoints = (
  xValues: readonly unknown[],
  yValues: readonly unknown[],
): Array<{ x: number; y: number }> => {
  const points: Array<{ x: number; y: number }> = [];
  const length = Math.min(xValues.length, yValues.length);
  for (let index = 0; index < length; index += 1) {
    const x = Number(xValues[index]);
    const y = Number(yValues[index]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push({ x, y });
    }
  }
  return points;
};

const createCurveChannels = (yValues: readonly number[]): CurveChannelsRecord => ({
  yPositive: yValues.map((value) => value > 0 ? value : Number.NaN),
  yAbsPositive: yValues.map((value) => {
    const absolute = Math.abs(value);
    return absolute > 0 ? absolute : Number.NaN;
  }),
  yLog10Abs: yValues.map((value) => {
    const absolute = Math.abs(value);
    return absolute > 0 ? Math.log10(absolute) : Number.NaN;
  }),
});

const createDomainRecord = (
  points: readonly { x: number; y: number }[],
  channels?: CurveChannelsRecord,
): DomainRecord => ({
  x: getFiniteDomain(points.map((point) => point.x)),
  y: getFiniteDomain(points.map((point) => point.y)),
  yPositive: getFiniteDomain(channels?.yPositive ?? []),
  yAbsPositive: getFiniteDomain(channels?.yAbsPositive ?? []),
  yLog10Abs: getFiniteDomain(channels?.yLog10Abs ?? []),
});

const createDomainFromProcessedFile = (file: ProcessedEntry): DomainRecord | undefined => {
  const x = readTupleDomain(file.domain?.x);
  const y = readTupleDomain(file.domain?.y);
  return x || y ? { x, y } : undefined;
};

const getFiniteDomain = (values: readonly unknown[]): [number, number] | undefined => {
  const finite = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!finite.length) {
    return undefined;
  }

  return [Math.min(...finite), Math.max(...finite)];
};

const createPointsSignature = (
  kind: string,
  fileId: string,
  seriesId: string,
  points: readonly { x: number; y: number }[],
): string => {
  const first = points[0];
  const last = points[points.length - 1];
  return [
    kind,
    fileId,
    seriesId,
    points.length,
    first ? `${first.x},${first.y}` : "",
    last ? `${last.x},${last.y}` : "",
  ].join(":");
};

const resolveSourceSheetId = (sourceFile: SessionFile, fileId: string): string =>
  readRecordString(sourceFile, "sheetId") ??
  readRecordString(sourceFile, "worksheetId") ??
  readRecordString(sourceFile, "sheetName") ??
  readRecordString(sourceFile, "worksheetName") ??
  fileId;

const normalizeCurveKindText = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();

const inferBaseCurveFamily = (value: unknown): BaseCurveFamily | null => {
  const text = normalizeCurveKindText(value);
  switch (text) {
    case "iv":
    case "transfer":
    case "output":
      return "iv";
    case "cv":
    case "cf":
    case "pv":
    case "it":
      return text;
    default:
      return null;
  }
};

const inferIvCurveMode = (
  value: unknown,
  xAxisRole?: unknown,
): IvCurveMode | null => {
  const text = normalizeCurveKindText(value);
  if (text === "transfer" || text === "output") {
    return text;
  }

  const role = String(xAxisRole ?? "").trim().toLowerCase();
  if (role === "vg") {
    return "transfer";
  }
  if (role === "vd") {
    return "output";
  }
  return null;
};

const inferItCurveMode = (value: unknown): ItCurveMode | null => {
  const text = String(value ?? "").trim().toLowerCase();
  switch (text) {
    case "stability":
      return "stability";
    case "transient":
      return "transient";
    case "retention":
      return "retention";
    case "biasstress":
    case "bias-stress":
      return "biasStress";
    case "photoresponse":
    case "photo-response":
      return "photoResponse";
    case "generic":
      return "generic";
    default:
      return null;
  }
};

const inferDerivedCurveFamily = (
  value: unknown,
): DerivedCurveFamily | null => {
  const text = String(value ?? "").trim().toLowerCase();
  switch (text) {
    case "gm":
      return "gm";
    case "ss":
    case "localss":
    case "local-ss":
      return "localSs";
    case "vth":
    case "thresholdfit":
    case "threshold-fit":
      return "thresholdFit";
    case "subthresholdfit":
    case "subthreshold-fit":
      return "subthresholdFit";
    default:
      return null;
  }
};

const readRecordString = (
  record: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined => normalizeOptionalText(record?.[key]);

const readInteger = (
  record: Record<string, unknown> | null | undefined,
  key: string,
): number | undefined => {
  const value = Number(record?.[key]);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
};

const readNumber = (
  record: Record<string, unknown> | null | undefined,
  key: string,
): number | undefined => {
  const value = Number(record?.[key]);
  return Number.isFinite(value) ? value : undefined;
};

const readConfigNumber = (
  record: Record<string, unknown> | null | undefined,
  key: string,
): number | undefined => {
  const value = record?.[key];
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const readNestedNumber = (value: unknown, key: string): number | undefined =>
  isObjectRecord(value) ? readNumber(value, key) : undefined;

const readNumberArray = (value: unknown): number[] =>
  Array.isArray(value)
    ? value
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item))
    : [];

const readNumberMatrix = (value: unknown): number[][] =>
  Array.isArray(value)
    ? value.map(readNumberArray).filter((group) => group.length > 0)
    : [];

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => normalizeOptionalText(item))
        .filter((item): item is string => Boolean(item))
    : [];

const readTupleDomain = (value: unknown): [number, number] | undefined => {
  if (!Array.isArray(value) || value.length < 2) {
    return undefined;
  }

  const start = Number(value[0]);
  const end = Number(value[1]);
  return Number.isFinite(start) && Number.isFinite(end) ? [start, end] : undefined;
};

const parseOptionalNumber = (value: unknown): number | undefined => {
  const text = normalizeOptionalText(value);
  if (!text) {
    return undefined;
  }

  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
};

const parseNumberOr = (value: unknown, fallback: number): number =>
  parseOptionalNumber(value) ?? fallback;

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeId = (value: unknown): string => String(value ?? "").trim();

const normalizeOptionalText = (value: unknown): string | undefined => {
  const text = String(value ?? "").trim();
  return text || undefined;
};





