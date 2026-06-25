/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
  CalculatedData,
  CalculatedPlotsByKey,
  CalculatedSeries,
} from "src/cs/workbench/services/calculation/common/calculationReadModel";
import type {
  CurveData,
  CurveKey as CompatibleCurveKey,
  FileSemantics,
} from "src/cs/workbench/services/session/common/fileSemantics";
import type {
  ProcessedEntry,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type {
  SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import {
  createEmptyTemplateEditorConfig,
  type TemplateEditorConfig,
} from "src/cs/workbench/services/template/common/templateEditorConfig";
import { normalizeColumnIndexes } from "src/cs/workbench/services/template/common/templateXYBinding";
import type {
  BaseCurveFamily,
  CacheKey,
  CalculationCacheEntry,
  CurveChannelsRecord,
  CurveKey as SessionCurveKey,
  CurveRecord,
  DerivedCurveFamily,
  DomainRecord,
  FileId,
  FileRecord,
  ItCurveMode,
  IvCurveMode,
  RawRecord,
  SeriesRecord,
  SeriesId,
} from "src/cs/workbench/services/session/common/sessionModel";
import { getLatestSliceRunRecord } from "src/cs/workbench/services/session/common/sessionModel";
import {
  collectFileRecordBaseCurves,
} from "src/cs/workbench/services/session/common/sessionRecordProjection";
import type { SliceRun } from "src/cs/workbench/services/slice/common/slice";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type { Template, TemplateSegmentation } from "src/cs/workbench/services/template/common/templateSpec";
import type { TemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";

const CALCULATION_CACHE_PAYLOAD_VERSION = 2;

type MergeProcessedFileOptions = {
  readonly appliedTemplateApplyConfig?: unknown;
  readonly appliedTemplateSelection?: TemplateSelection;
};

type ProcessedCalculationCachePayload = {
  fileId: string;
  cache: unknown;
  touchedAt?: number;
};

type ProcessedTemplateEditorConfigRecord = {
  readonly name?: string;
  readonly xColumns: number[];
  readonly xDataStart: number;
  readonly xDataEnd: number;
  readonly xSegmentationMode: "auto" | "points" | "segments";
  readonly xSegmentCount?: number;
  readonly xPointsPerGroup?: number;
  readonly xUnit?: string;
  readonly yLegendStart?: number;
  readonly yLegendCount?: number;
  readonly yLegendStep?: number;
  readonly yLegendTarget: "auto" | "yColumn" | "group";
  readonly yUnit?: string;
  readonly stopOnError: boolean;
  readonly bottomTitle?: string;
  readonly leftTitle?: string;
  readonly legendPrefix?: string;
  readonly yColumns: number[];
};

const createEmptyFileRecord = (fileId: string, fileName: string): FileRecord => {
  const raw = createRawRecord(fileId, fileName);
  return {
    id: fileId,
    kind: inferFileKindFromFileName(fileName),
    name: fileName,
    raw,
    rawTableVersionsById: createRawTableVersions(raw.tableOrder),
    tableModelByRawTableId: {},
    rawTableReviewsByRawTableId: {},
    measurementBlocksById: {},
    measurementBlockOrder: [],
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
    health: normalizeRawTableHealth(
      sourceFile.rawTableHealth,
      sourceFile.rawTableHealthMessage,
    ),
    templateEligibility: normalizeTemplateEligibility(sourceFile.templateEligibility),
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
  const retainedTableModelRecords = retainTableModelRecords(
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
    ...retainedTableModelRecords,
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
  areNumberArraysEqual(current.maxCellLengths, next.maxCellLengths) &&
  current.health?.state === next.health?.state &&
  current.health?.message === next.health?.message &&
  current.templateEligibility === next.templateEligibility;

const retainTableModelRecords = (
  record: FileRecord,
  liveRawTableIds: ReadonlySet<string>,
  changedRawTableIds: ReadonlySet<string>,
): Pick<FileRecord, "tableModelByRawTableId" | "rawTableReviewsByRawTableId" | "measurementBlocksById" | "measurementBlockOrder"> => {
  const sourceTableModelByRawTableId = getTableModelByRawTableId(record);
  const tableModelByRawTableId = filterRecord(
    sourceTableModelByRawTableId,
    rawTableId => liveRawTableIds.has(rawTableId) && !changedRawTableIds.has(rawTableId),
  );
  const rawTableReviewsByRawTableId = filterRecord(
    record.rawTableReviewsByRawTableId ?? {},
    rawTableId => liveRawTableIds.has(rawTableId) && !changedRawTableIds.has(rawTableId),
  );
  const measurementBlocksById = filterRecord(
    record.measurementBlocksById ?? {},
    (_blockId, block) =>
      liveRawTableIds.has(block.rawTableId) &&
      !changedRawTableIds.has(block.rawTableId),
  );

  return {
    tableModelByRawTableId,
    rawTableReviewsByRawTableId,
    measurementBlocksById,
    measurementBlockOrder: (record.measurementBlockOrder ?? []).filter(blockId =>
      Boolean(measurementBlocksById[blockId])
    ),
  };
};

const getTableModelByRawTableId = (
  record: FileRecord,
): FileRecord["tableModelByRawTableId"] => {
  if (record.tableModelByRawTableId) {
    return record.tableModelByRawTableId;
  }

  return {};
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
      fileName: file.name || file.raw.fileName,
      normalizedCsvPath: file.raw.normalizedCsvPath ?? null,
      rawKey: file.raw.rawKey,
      relativePath: file.raw.relativePath ?? null,
      sourcePath: file.raw.filePath ?? null,
      curveType: getFileRecordSlicedCurveType(file) ?? null,
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
        ...createRawFileTableModelSummary(file, tableId),
        sheetId: table.sheetId,
        sheetName: table.sheetName ?? null,
        sourceKey: table.tableKey,
        sourceVersion: file.rawTableVersionsById?.[tableId] ?? 0,
        rawTableHealth: table.health?.state,
        rawTableHealthMessage: table.health?.message ?? null,
        templateEligibility: table.templateEligibility,
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
        ...createRawFileTableModelSummary(file),
      });
    }
  }

  return rawFiles;
};

type RawFileTableModelSummary = Pick<
  SessionFile,
  | "tableModelBlocks"
  | "tableModelColumnProfiles"
  | "tableModelLayoutCandidates"
  | "tableModelSchemaFingerprint"
  | "tableModelSemanticCandidates"
>;

const createRawFileTableModelSummary = (
  file: FileRecord,
  rawTableId?: string,
): RawFileTableModelSummary => {
  const tableModel = rawTableId
    ? file.tableModelByRawTableId?.[rawTableId]
    : undefined;

  return {
    tableModelBlocks: tableModel?.blocks.length
      ? [...tableModel.blocks]
      : undefined,
    tableModelColumnProfiles: tableModel?.columnProfiles.length
      ? [...tableModel.columnProfiles]
      : undefined,
    tableModelLayoutCandidates: tableModel?.layoutCandidates.length
      ? [...tableModel.layoutCandidates]
      : undefined,
    tableModelSchemaFingerprint: tableModel?.structure.fingerprint || undefined,
    tableModelSemanticCandidates: tableModel?.semanticCandidates.length
      ? [...tableModel.semanticCandidates]
      : undefined,
  };
};

const getFileRecordSlicedCurveType = (
  file: FileRecord,
): string | undefined => {
  const curve = collectFileRecordBaseCurves(file)[0];
  if (!curve) {
    return undefined;
  }
  if (curve.curveFamily === "iv" && curve.ivMode) {
    return curve.ivMode;
  }
  if (curve.curveFamily === "it" && curve.itMode) {
    return curve.itMode;
  }
  return curve.curveFamily;
};

const normalizeRawTableHealth = (
  state: unknown,
  message: unknown,
): FileRecord["raw"]["tablesById"][string]["health"] | undefined => {
  if (
    state !== "ok" &&
    state !== "suspect" &&
    state !== "decodeFailed" &&
    state !== "parseFailed" &&
    state !== "unsupported" &&
    state !== "empty"
  ) {
    return undefined;
  }

  return {
    state,
    message: normalizeOptionalText(message) ?? "",
  };
};

const normalizeTemplateEligibility = (
  value: unknown,
): FileRecord["raw"]["tablesById"][string]["templateEligibility"] | undefined =>
  value === "eligible" || value === "notEligible" || value === "needsUserAction"
    ? value
    : undefined;

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
  const curve = createCurveRecordFromCompatibleCurve(data);
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
  key: CompatibleCurveKey,
): Pick<SessionSnapshot, "filesById" | "fileOrder"> => {
  const fileId = normalizeId(key.fileId);
  const curveKey = createCurveRecordKeyFromCompatibleKey(key);
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
  key: CompatibleCurveKey,
): SessionCurveKey | null => createCurveRecordKeyFromCompatibleKey(key);

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
  sliceRunsById: undefined,
  latestSliceRunId: undefined,
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

const createCurveRecordKeyFromCompatibleKey = (
  key: CompatibleCurveKey,
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
  const emptyTemplateEditorConfig = createEmptyTemplateEditorConfig();
  const templateConfig = createTemplateEditorConfigRecordFromAppliedConfig(
    options.appliedTemplateApplyConfig,
    emptyTemplateEditorConfig,
    processedFile,
  );
  const xCanonicalFactor = getCanonicalXUnitFactor(templateConfig.xUnit);
  const yCanonicalFactor = getCanonicalYUnitFactor(templateConfig.yUnit);
  const xGroups = readNumberMatrix(processedFile.xGroups);
  const seriesById: Record<string, SeriesRecord> = {};
  const seriesOrder: string[] = [];
  const curvesByKey: Record<SessionCurveKey, CurveRecord> = {};
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
    const points = createCurvePoints(x, y, {
      xFactor: xCanonicalFactor,
      yFactor: yCanonicalFactor,
    });
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

  const latestSliceRun = getLatestSliceRunRecord(record);
  const templateSelection = normalizeTemplateSelection(
    options.appliedTemplateSelection ??
    latestSliceRun?.selection ??
    { kind: "auto" as const },
  );
  const fileName = readRecordString(processedFile, "fileName") ?? record.raw.fileName;
  const sliceRun = createProcessedSliceRunFromOutput({
    config: templateConfig,
    errors: readStringArray(processedFile.errors),
    fileId,
    outputCurveKeys: Object.keys(curvesByKey) as SessionCurveKey[],
    outputSeriesIds: seriesOrder,
    processedFile,
    record,
    selection: templateSelection,
    warnings: readStringArray(processedFile.warnings),
  });

  return {
    ...record,
    name: fileName,
    raw: {
      ...record.raw,
      fileName,
    },
    sliceRunsById: {
      ...record.sliceRunsById,
      [sliceRun.id]: sliceRun,
    },
    latestSliceRunId: sliceRun.id,
    seriesById,
    seriesOrder,
    curvesByKey: {
      ...record.curvesByKey,
      ...curvesByKey,
    },
  };
};

const createProcessedSliceRunFromOutput = ({
  config,
  errors,
  fileId,
  outputCurveKeys,
  outputSeriesIds,
  processedFile,
  record,
  selection,
  warnings,
}: {
  readonly config: ProcessedTemplateEditorConfigRecord;
  readonly errors: readonly string[];
  readonly fileId: FileId;
  readonly outputCurveKeys: readonly SessionCurveKey[];
  readonly outputSeriesIds: readonly SeriesId[];
  readonly processedFile: ProcessedEntry;
  readonly record: FileRecord;
  readonly selection: TemplateSelection;
  readonly warnings: readonly string[];
}): SliceRun => {
  const rawTableId = readRecordString(processedFile, "sheetId") ??
    record.raw.tableOrder[0] ??
    fileId;
  const sourceRawTableVersion = record.rawTableVersionsById[rawTableId] ?? 0;
  const template = createTemplateFromProcessedEditorConfig(config, fileId);
  const templateFingerprint = createTemplateFingerprint(template);
  const inputRanges = createProcessedSliceInputRanges({
    config,
    fileId,
    processedFile,
    rawTableId,
  });
  const appliedAt = Math.max(0, Math.floor(readNumber(processedFile, "appliedAt") ?? 0));
  return {
    id: `slice:${fileId}:${rawTableId}:${templateFingerprint}:${sourceRawTableVersion}:${hashString(String(appliedAt))}`,
    fileId,
    rawTableId,
    mode: selection.kind === "auto" ? "auto" : "manual",
    selection,
    sourceRawTableVersion,
    template,
    templateFingerprint,
    inputRanges,
    outputSeriesIds: [...outputSeriesIds],
    outputCurveKeys: [...outputCurveKeys],
    warnings: [...warnings],
    errors: [...errors],
  };
};

const createTemplateFromProcessedEditorConfig = (
  config: ProcessedTemplateEditorConfigRecord,
  fileId: string,
): Template => ({
  schemaVersion: 1,
  id: `processed:${fileId}`,
  name: config.name ?? fileId,
  version: 1,
  stopOnError: config.stopOnError,
  blocks: [{
    rowRange: {
      startRow: config.xDataStart,
      endRow: config.xDataEnd,
    },
    x: {
      columns: config.xColumns,
      ...(config.xUnit ? { unit: config.xUnit } : {}),
    },
    y: {
      columns: config.yColumns,
      ...(config.yUnit ? { unit: config.yUnit } : {}),
    },
    segmentation: createProcessedTemplateSegmentation(config),
    legend: {
      target: config.yLegendTarget,
      ...(config.legendPrefix ? { prefix: config.legendPrefix } : {}),
    },
    ...(config.bottomTitle || config.leftTitle
      ? {
        titles: {
          ...(config.bottomTitle ? { bottom: config.bottomTitle } : {}),
          ...(config.leftTitle ? { left: config.leftTitle } : {}),
        },
      }
      : {}),
  }],
});

const createProcessedTemplateSegmentation = (
  config: ProcessedTemplateEditorConfigRecord,
): TemplateSegmentation => {
  if (config.xSegmentationMode === "points" && config.xPointsPerGroup) {
    return { kind: "fixedPoints", pointsPerGroup: config.xPointsPerGroup };
  }
  if (config.xSegmentationMode === "segments" && config.xSegmentCount) {
    return { kind: "fixedSegments", segmentCount: config.xSegmentCount };
  }
  return { kind: "auto" };
};

const createProcessedSliceInputRanges = ({
  config,
  fileId,
  processedFile,
  rawTableId,
}: {
  readonly config: ProcessedTemplateEditorConfigRecord;
  readonly fileId: string;
  readonly processedFile: ProcessedEntry;
  readonly rawTableId: string;
}): SliceRun["inputRanges"] => {
  const columns = [...config.xColumns, ...config.yColumns].filter(Number.isFinite);
  const startCol = columns.length ? Math.min(...columns) : 0;
  const endCol = columns.length ? Math.max(...columns) : startCol;
  const xGroups = readNumberMatrix(processedFile.xGroups);
  const pointCount = Math.max(0, ...xGroups.map(group => group.length));
  const startRow = Math.max(0, config.xDataStart);
  const configuredEndRow = Math.max(startRow, config.xDataEnd);
  const inferredEndRow = pointCount > 0 ? startRow + pointCount - 1 : startRow;
  return [{
    fileId,
    rawTableId,
    range: {
      startRow,
      endRow: Math.max(configuredEndRow, inferredEndRow),
      startCol,
      endCol,
    },
  }];
};

const normalizeTemplateSelection = (
  selection: TemplateSelection,
): TemplateSelection => {
  if (selection.kind === "inline" && selection.template) {
    return selection;
  }
  if (selection.kind === "saved") {
    const templateId = String(selection.templateId ?? "").trim();
    return templateId ? { kind: "saved", templateId } : { kind: "auto" };
  }

  return { kind: "auto" };
};

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
  const latestSliceRun = getLatestSliceRunRecord(record);
  const nextSliceRun = semantics.templateId && latestSliceRun
    ? {
        ...latestSliceRun,
        selection: {
          kind: "saved" as const,
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
    ...(nextSliceRun
      ? {
          sliceRunsById: {
            ...record.sliceRunsById,
            [nextSliceRun.id]: nextSliceRun,
          },
          latestSliceRunId: nextSliceRun.id,
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

const createTemplateEditorConfigRecord = (
  config: TemplateEditorConfig,
): ProcessedTemplateEditorConfigRecord => ({
  name: normalizeOptionalText(config.name),
  xColumns: normalizeColumnIndexes(config.xColumns),
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

const createTemplateEditorConfigRecordFromAppliedConfig = (
  config: unknown,
  fallback: TemplateEditorConfig,
  processedFile?: ProcessedEntry,
): ProcessedTemplateEditorConfigRecord => {
  const fallbackRecord = createTemplateEditorConfigRecord(fallback);
  const processedConfig = createTemplateEditorConfigFallbackFromProcessedFile(processedFile);
  if (!isObjectRecord(config)) {
    return {
      ...fallbackRecord,
      ...processedConfig,
    };
  }

  const yCols = readNumberArray(config.yCols);
  const yColumns = yCols.length ? yCols : readNumberArray(config.yColumns);
  const xCols = readNumberArray(config.xCols);
  const xColumns = xCols.length ? xCols : readNumberArray(config.xColumns);
  const xCol = readConfigNumber(config, "xCol");
  const resolvedXColumns = xColumns.length
    ? xColumns
    : xCol !== undefined
      ? [xCol]
      : shouldDefaultExtractionXColumn(config)
        ? [0]
        : fallbackRecord.xColumns;
  const xSegmentCount =
    readConfigNumber(config, "xSegmentCount") ??
    readConfigNumber(config, "segmentCount") ??
    fallbackRecord.xSegmentCount;
  const xPointsPerGroup =
    readConfigNumber(config, "xPointsPerGroup") ??
    readConfigNumber(config, "groupSize") ??
    fallbackRecord.xPointsPerGroup;
  const xSegmentationMode = resolveProcessedTemplateSegmentationMode(
    normalizeXSegmentationMode(
      config.xSegmentationMode,
      fallbackRecord.xSegmentationMode,
    ),
    xPointsPerGroup,
    xSegmentCount,
  );

  return {
    ...fallbackRecord,
    name: normalizeOptionalText(config.name) ?? fallbackRecord.name,
    xColumns: resolvedXColumns,
    xDataStart:
      readConfigNumber(config, "xDataStart") ??
      readConfigNumber(config, "startRow") ??
      fallbackRecord.xDataStart,
    xDataEnd:
      readConfigNumber(config, "xDataEnd") ??
      readConfigNumber(config, "endRow") ??
      fallbackRecord.xDataEnd,
    xSegmentationMode,
    xSegmentCount,
    xPointsPerGroup,
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

const createTemplateEditorConfigFallbackFromProcessedFile = (
  processedFile: ProcessedEntry | undefined,
): Partial<ProcessedTemplateEditorConfigRecord> => {
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

const shouldDefaultExtractionXColumn = (config: Record<string, unknown>): boolean =>
  config.startRow !== undefined ||
  config.yCols !== undefined ||
  config.seriesBindings !== undefined;

const normalizeXSegmentationMode = (
  value: unknown,
  fallback: ProcessedTemplateEditorConfigRecord["xSegmentationMode"],
): ProcessedTemplateEditorConfigRecord["xSegmentationMode"] =>
  value === "points" || value === "segments" || value === "auto"
    ? value
    : fallback;

const resolveProcessedTemplateSegmentationMode = (
  mode: ProcessedTemplateEditorConfigRecord["xSegmentationMode"],
  xPointsPerGroup: number | undefined,
  xSegmentCount: number | undefined,
): ProcessedTemplateEditorConfigRecord["xSegmentationMode"] => {
  if (mode !== "auto") {
    return mode;
  }
  if (isPositiveNumber(xPointsPerGroup)) {
    return "points";
  }
  if (isPositiveNumber(xSegmentCount)) {
    return "segments";
  }
  return mode;
};

const isPositiveNumber = (value: number | undefined): boolean =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const normalizeYLegendTarget = (
  value: unknown,
  fallback: ProcessedTemplateEditorConfigRecord["yLegendTarget"],
): ProcessedTemplateEditorConfigRecord["yLegendTarget"] =>
  value === "yColumn" || value === "group" || value === "auto"
    ? value
    : fallback;

const createCurveRecordFromCompatibleCurve = (
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
): CurveRecord | null => createCurveRecordFromCompatibleCurve({
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
  options: {
    readonly xFactor?: number;
    readonly yFactor?: number;
  } = {},
): Array<{ x: number; y: number }> => {
  const points: Array<{ x: number; y: number }> = [];
  const length = Math.min(xValues.length, yValues.length);
  const xFactor = getFiniteUnitFactor(options.xFactor);
  const yFactor = getFiniteUnitFactor(options.yFactor);
  for (let index = 0; index < length; index += 1) {
    const x = Number(xValues[index]);
    const y = Number(yValues[index]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push({ x: x * xFactor, y: y * yFactor });
    }
  }
  return points;
};

const getFiniteUnitFactor = (value: unknown): number => {
  const factor = Number(value);
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
};

const getCanonicalXUnitFactor = (unit: unknown): number => {
  switch (normalizeUnitToken(unit)) {
    case "kv":
      return 1e3;
    case "mv":
      return 1e-3;
    case "uv":
      return 1e-6;
    case "khz":
      return 1e3;
    case "mhz":
      return 1e6;
    case "ghz":
      return 1e9;
    default:
      return 1;
  }
};

const getCanonicalYUnitFactor = (unit: unknown): number => {
  switch (normalizeUnitToken(unit)) {
    case "ma":
    case "mf":
      return 1e-3;
    case "ua":
    case "uf":
      return 1e-6;
    case "na":
    case "nf":
      return 1e-9;
    case "pa":
    case "pf":
      return 1e-12;
    default:
      return 1;
  }
};

const normalizeUnitToken = (unit: unknown): string =>
  String(unit ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("µ", "u")
    .replaceAll("μ", "u");

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

const isNumberArraySource = (value: unknown): value is ArrayLike<unknown> =>
  Array.isArray(value) ||
  (
    ArrayBuffer.isView(value) &&
    typeof (value as { readonly length?: unknown }).length === "number"
  );

const readNumberArray = (value: unknown): number[] =>
  isNumberArraySource(value)
    ? Array.from(value, (item) => Number(item))
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
