/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
  FileImportResult,
  ImportedFileRecord,
  SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import type {
  BaseCurveFamily,
  CurveChannelsRecord,
  CurveKey as SessionCurveKey,
  CurveRecord,
  DomainRecord,
  FileId,
  FileRecord,
  IvCurveMode,
  ItCurveMode,
  RawRecord,
  RawTableHealthState,
  RawTableRecord,
  SeriesRecord,
  TableRecord,
  TemplateEligibility,
} from "src/cs/workbench/services/session/common/sessionModel";
import type {
  SliceCommit,
  SliceCurveKey,
  SliceRun,
} from "src/cs/workbench/services/slice/common/slice";
import type { TemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type {
  Template,
  TemplateSegmentation,
} from "src/cs/workbench/services/template/common/templateSpec";

type SessionCommitTargetForTest = {
  readonly commitFileImport: (result: FileImportResult) => unknown;
};

type SessionSliceTargetForTest = SessionCommitTargetForTest & {
  readonly commitSliceRuns: (inputs: readonly SliceCommit[]) => unknown;
  readonly getSnapshot: () => SessionSnapshot;
};

type SessionReplaceTargetForTest = SessionCommitTargetForTest & {
  readonly clearSession: () => void;
};

export type RawFileImportForTest = {
  readonly file?: unknown;
  readonly fileId?: string;
  readonly fileName?: string;
  readonly normalizedCsvPath?: string | null;
  readonly relativePath?: string | null;
  readonly rows?: readonly (readonly string[])[];
  readonly rowCount?: number;
  readonly columnCount?: number;
  readonly maxCellLengths?: readonly number[];
  readonly rawKey?: string | null;
  readonly rawTableHealth?: RawTableHealthState;
  readonly rawTableHealthMessage?: string | null;
  readonly sheetId?: string | null;
  readonly sheetName?: string | null;
  readonly sourcePath?: string | null;
  readonly tableKey?: string | null;
  readonly templateEligibility?: TemplateEligibility;
  readonly worksheetName?: string | null;
};

export type NumberSeriesForTest = readonly number[] | Float64Array;

export type CurveSeriesForTest = {
  readonly id?: string;
  readonly name?: string;
  readonly legendValue?: string;
  readonly groupIndex?: number;
  readonly yCol?: number;
  readonly y?: NumberSeriesForTest;
};

export type CurveFileForTest = {
  readonly fileId?: string;
  readonly fileName?: string;
  readonly curveType?: string | null;
  readonly errors?: readonly string[];
  readonly leftTitle?: string;
  readonly sheetId?: string | null;
  readonly series?: readonly CurveSeriesForTest[];
  readonly warnings?: readonly string[];
  readonly xAxisRole?: "vg" | "vd" | null;
  readonly xGroups?: readonly NumberSeriesForTest[];
  readonly xLabel?: string;
  readonly xUnit?: string;
  readonly yLabel?: string;
  readonly yUnit?: string;
};

export type SliceOutputOptionsForTest = {
  readonly appliedTemplateSelection?: TemplateSelection;
  readonly mode?: SliceRun["mode"];
};

export const commitRawFilesForTest = (
  session: SessionCommitTargetForTest,
  files: readonly RawFileImportForTest[],
): void => {
  session.commitFileImport(createFileImportResultForTest(files));
};

export const replaceImportedFilesForTest = (
  session: SessionReplaceTargetForTest,
  files: readonly RawFileImportForTest[],
): void => {
  session.clearSession();
  commitRawFilesForTest(session, files);
};

export const createFileImportResultForTest = (
  files: readonly RawFileImportForTest[],
): FileImportResult => ({
  createdAt: 1,
  diagnostics: [],
  files: files
    .map(createImportedFileRecordForTest)
    .filter((file): file is ImportedFileRecord => Boolean(file)),
});

export const createFileRecordsForTest = (
  files: readonly RawFileImportForTest[],
): Pick<SessionSnapshot, "filesById" | "fileOrder"> => {
  const filesById: Record<FileId, FileRecord> = {};
  const fileOrder: FileId[] = [];
  for (const importedFile of createFileImportResultForTest(files).files) {
    const record = createFileRecordForTest(importedFile);
    if (!record) {
      continue;
    }

    filesById[record.id] = record;
    if (!fileOrder.includes(record.id)) {
      fileOrder.push(record.id);
    }
  }

  return { filesById, fileOrder };
};

export const commitTemplateOutputForTest = (
  session: SessionSliceTargetForTest,
  file: CurveFileForTest | null | undefined,
  options: SliceOutputOptionsForTest = {},
): void => {
  const fileId = normalizeId(file?.fileId);
  if (fileId && !session.getSnapshot().filesById[fileId]) {
    commitRawFilesForTest(session, [{
      fileId,
      fileName: normalizeOptionalText(file?.fileName) ?? fileId,
    }]);
  }

  const commit = createSliceCommitForTest(session.getSnapshot(), file, options);
  if (commit) {
    session.commitSliceRuns([commit]);
  }
};

export const createSliceCommitForTest = (
  snapshot: SessionSnapshot,
  file: CurveFileForTest | null | undefined,
  options: SliceOutputOptionsForTest = {},
): SliceCommit | null => {
  if (!file) {
    return null;
  }

  const fileId = normalizeId(file.fileId);
  const record = fileId ? snapshot.filesById[fileId] : undefined;
  if (!fileId || !record) {
    return null;
  }

  const rawTableId = normalizeOptionalText(file.sheetId) ??
    record.raw.tableOrder[0] ??
    fileId;
  if (!record.raw.tablesById[rawTableId]) {
    return null;
  }

  const curveKind = normalizeOptionalText(file.curveType) ?? "transfer";
  const ivMode = inferIvCurveMode(curveKind, file.xAxisRole ?? "vg");
  const itMode = inferItCurveMode(curveKind);
  const curveFamily = inferBaseCurveFamily(curveKind) ?? (ivMode ? "iv" : itMode ? "it" : null);
  const xFactor = getCanonicalXUnitFactor(file.xUnit);
  const yFactor = getCanonicalYUnitFactor(file.yUnit);
  const xGroups = readNumberMatrix(file.xGroups);
  const series: SeriesRecord[] = [];
  const curves: CurveRecord[] = [];

  for (const [index, sourceSeries] of (file.series ?? []).entries()) {
    const seriesId = normalizeOptionalText(sourceSeries.id) ?? `series-${index + 1}`;
    const groupIndex = readNonNegativeInteger(sourceSeries.groupIndex) ?? index;
    const y = readNumberArray(sourceSeries.y);
    series.push({
      fileId,
      sheetId: rawTableId,
      id: seriesId,
      name: normalizeOptionalText(sourceSeries.name),
      legendValue: normalizeOptionalText(sourceSeries.legendValue),
      groupIndex,
      yCol: readNonNegativeInteger(sourceSeries.yCol),
      y,
    });

    if (!curveFamily) {
      continue;
    }

    const points = createCurvePoints(xGroups[groupIndex] ?? [], y, {
      xFactor,
      yFactor,
    });
    if (!points.length) {
      continue;
    }

    const channels = createCurveChannels(points.map(point => point.y));
    curves.push({
      fileId,
      seriesId,
      curveGeneration: "base",
      curveFamily,
      ivMode: curveFamily === "iv" ? ivMode : undefined,
      itMode: curveFamily === "it" ? itMode : undefined,
      lineage: {
        curveGeneration: "base",
        baseFamily: curveFamily,
        ivMode: curveFamily === "iv" ? ivMode : undefined,
        itMode: curveFamily === "it" ? itMode : undefined,
        baseSeries: { fileId, seriesId },
      },
      points,
      channels,
      domain: createDomainRecord(points, channels),
      signature: createPointsSignature("base", fileId, seriesId, points),
    });
  }

  const outputCurveKeys = curves.map(createCurveRecordKey);
  const template = createTemplateForTest(file, fileId);
  const selection = normalizeTemplateSelection(options.appliedTemplateSelection ?? { kind: "auto" });
  const mode = options.mode ?? (selection.kind === "auto" ? "auto" : "manual");
  const templateFingerprint = createTemplateFingerprint(template);
  const sourceRawTableVersion = record.rawTableVersionsById[rawTableId] ?? 0;
  const run: SliceRun = {
    id: [
      "slice-test",
      fileId,
      rawTableId,
      templateFingerprint,
      sourceRawTableVersion,
      series.map(item => item.id).join("."),
      outputCurveKeys.join("."),
    ].join(":"),
    fileId,
    rawTableId,
    mode,
    selection,
    sourceRawTableVersion,
    template,
    templateFingerprint,
    inputRanges: [{
      fileId,
      rawTableId,
      range: createInputRangeForTest(file, xGroups),
    }],
    outputSeriesIds: series.map(item => item.id),
    outputCurveKeys: outputCurveKeys as readonly SliceCurveKey[],
    warnings: [...(file.warnings ?? [])],
    errors: [...(file.errors ?? [])],
  };

  return { run, series, curves };
};

export const addSliceOutputToRecordsForTest = (
  records: Pick<SessionSnapshot, "filesById" | "fileOrder">,
  file: CurveFileForTest,
  options: SliceOutputOptionsForTest = {},
): Pick<SessionSnapshot, "filesById" | "fileOrder"> => {
  const fileId = normalizeId(file.fileId);
  let nextRecords = records;
  if (fileId && !records.filesById[fileId]) {
    const rawRecords = createFileRecordsForTest([{
      fileId,
      fileName: normalizeOptionalText(file.fileName) ?? fileId,
    }]);
    nextRecords = {
      filesById: {
        ...records.filesById,
        ...rawRecords.filesById,
      },
      fileOrder: appendOrderedId(records.fileOrder, fileId),
    };
  }

  const snapshot = createSnapshotForTest(nextRecords);
  const commit = createSliceCommitForTest(snapshot, file, options);
  return commit ? applySliceCommitToRecordsForTest(nextRecords, commit) : nextRecords;
};

const createImportedFileRecordForTest = (
  file: RawFileImportForTest,
): ImportedFileRecord | null => {
  const fileId = normalizeId(file.fileId);
  if (!fileId) {
    return null;
  }

  const fileName = normalizeOptionalText(file.fileName) ?? fileId;
  const rawTableId = normalizeOptionalText(file.sheetId) ??
    normalizeOptionalText(file.tableKey) ??
    fileId;
  const sheetName = normalizeOptionalText(file.sheetName) ??
    normalizeOptionalText(file.worksheetName);
  const rows = Array.isArray(file.rows)
    ? file.rows
    : [];
  const rowCount = Math.max(0, Math.floor(Number(file.rowCount) || rows.length));
  const columnCount = Math.max(
    0,
    Math.floor(Number(file.columnCount) || rows[0]?.length || 0),
  );
  const lastModified = readRecordNumber(file.file, "lastModified");
  const size = readRecordNumber(file.file, "size");
  const rawKey = normalizeOptionalText(file.rawKey) ??
    normalizeOptionalText(file.tableKey);

  return {
    id: fileId,
    kind: /\.xlsx?$/i.test(fileName) ? "excel" : /\.csv$/i.test(fileName) ? "csv" : "unknown",
    name: fileName,
    raw: {
      fileId,
      fileName,
      filePath: file.sourcePath ?? null,
      rawFile: file.file,
      rawKey,
      rawTablesById: {
        [rawTableId]: {
          columnCount,
          fileId,
          health: file.rawTableHealth
            ? {
              state: file.rawTableHealth,
              message: file.rawTableHealthMessage ?? "",
            }
            : undefined,
          maxCellLengths: [...(file.maxCellLengths ?? [])],
          rawTableId,
          rowCount,
          rows: createRowsRecordForTest(file, rows),
          source: sheetName || /\.xlsx?$/i.test(fileName)
            ? {
              kind: "excelSheet",
              sheetIndex: 0,
              sheetName,
            }
            : {
              kind: "csv",
            },
          templateEligibility: file.templateEligibility,
        },
      },
      rawTableOrder: [rawTableId],
      relativePath: file.relativePath ?? null,
      ...(lastModified !== undefined ? { lastModified } : {}),
      ...(size !== undefined ? { size } : {}),
    },
  };
};

const createRowsRecordForTest = (
  file: RawFileImportForTest,
  rows: readonly (readonly string[])[],
): RawTableRecord["rows"] => {
  if (
    file.rawTableHealth === "decodeFailed" ||
    file.rawTableHealth === "parseFailed" ||
    file.rawTableHealth === "unsupported"
  ) {
    return {
      kind: "unavailable",
      reason: file.rawTableHealthMessage ?? "",
    };
  }

  return file.normalizedCsvPath
    ? {
      formatVersion: 1,
      kind: "normalizedCsv",
      normalizedCsvPath: file.normalizedCsvPath,
    }
    : {
      kind: "inline",
      values: rows,
    };
};

const createFileRecordForTest = (
  importedFile: ImportedFileRecord,
): FileRecord | null => {
  const fileId = normalizeId(importedFile.id || importedFile.raw.fileId);
  if (!fileId) {
    return null;
  }

  const raw = createRawRecordForTest(fileId, importedFile);
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
    rawTableVersionsById: Object.fromEntries(
      raw.tableOrder.map(rawTableId => [rawTableId, 1]),
    ),
    seriesById: {},
    seriesOrder: [],
    curvesByKey: {},
    metricsByKey: {},
  };
};

const createRawRecordForTest = (
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

    tablesById[normalizedRawTableId] = {
      fileId,
      sheetId: normalizedRawTableId,
      sheetName: rawTable.source.kind === "excelSheet"
        ? rawTable.source.sheetName ?? null
        : null,
      tableKey: normalizedRawTableId,
      rowStore: rawTable.rows.kind === "unavailable"
        ? undefined
        : rawTable.rows.kind === "normalizedCsv"
          ? {
            kind: "external",
            normalizedCsvPath: rawTable.rows.normalizedCsvPath,
            tableKey: rawTable.rawTableId,
          }
          : {
            kind: "memory",
            rows: rawTable.rows.values,
          },
      rowCount: Math.max(0, Math.floor(rawTable.rowCount)),
      columnCount: Math.max(0, Math.floor(rawTable.columnCount)),
      maxCellLengths: [...(rawTable.maxCellLengths ?? [])],
      health: rawTable.health,
      templateEligibility: rawTable.templateEligibility,
    };
    tableOrder.push(normalizedRawTableId);
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
    file: importedFile.raw.rawFile,
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

const applySliceCommitToRecordsForTest = (
  records: Pick<SessionSnapshot, "filesById" | "fileOrder">,
  commit: SliceCommit,
): Pick<SessionSnapshot, "filesById" | "fileOrder"> => {
  const file = records.filesById[commit.run.fileId];
  if (!file) {
    return records;
  }

  const seriesById: Record<string, SeriesRecord> = {};
  const seriesOrder: string[] = [];
  for (const series of commit.series) {
    seriesById[series.id] = {
      ...series,
      y: [...series.y],
    };
    if (!seriesOrder.includes(series.id)) {
      seriesOrder.push(series.id);
    }
  }

  const curvesByKey: Record<string, CurveRecord> = {};
  for (const [curveKey, curve] of Object.entries(file.curvesByKey)) {
    if (curve.curveGeneration !== "base") {
      curvesByKey[curveKey] = curve;
    }
  }
  for (const curve of commit.curves) {
    curvesByKey[createCurveRecordKey(curve as CurveRecord)] = curve as CurveRecord;
  }

  return {
    filesById: {
      ...records.filesById,
      [file.id]: {
        ...file,
        sliceRunsById: {
          ...file.sliceRunsById,
          [commit.run.id]: commit.run,
        },
        latestSliceRunId: commit.run.id,
        seriesById,
        seriesOrder,
        curvesByKey,
      },
    },
    fileOrder: appendOrderedId(records.fileOrder, file.id),
  };
};

const createTemplateForTest = (
  file: CurveFileForTest,
  fileId: string,
): Template => ({
  schemaVersion: 1,
  id: `slice-test:${fileId}`,
  name: normalizeOptionalText(file.fileName) ?? fileId,
  version: 1,
  stopOnError: false,
  blocks: [{
    rowRange: {
      startRow: 0,
      endRow: "end",
    },
    x: {
      columns: [0],
      ...(normalizeOptionalText(file.xUnit) ? { unit: normalizeOptionalText(file.xUnit)! } : {}),
    },
    y: {
      columns: (file.series ?? [])
        .map((series, index) => readNonNegativeInteger(series.yCol) ?? index + 1),
      ...(normalizeOptionalText(file.yUnit) ? { unit: normalizeOptionalText(file.yUnit)! } : {}),
    },
    segmentation: createTemplateSegmentationForTest(file),
    legend: {
      target: "auto",
    },
    ...(normalizeOptionalText(file.xLabel) ||
      normalizeOptionalText(file.yLabel) ||
      normalizeOptionalText(file.leftTitle)
      ? {
        titles: {
          ...(normalizeOptionalText(file.xLabel) ? { bottom: normalizeOptionalText(file.xLabel)! } : {}),
          ...(normalizeOptionalText(file.yLabel) || normalizeOptionalText(file.leftTitle)
            ? { left: normalizeOptionalText(file.yLabel) ?? normalizeOptionalText(file.leftTitle)! }
            : {}),
        },
      }
      : {}),
  }],
});

const createTemplateSegmentationForTest = (
  file: CurveFileForTest,
): TemplateSegmentation => {
  const firstGroup = readNumberMatrix(file.xGroups)[0];
  return firstGroup?.length
    ? { kind: "fixedPoints", pointsPerGroup: firstGroup.length }
    : { kind: "auto" };
};

const createInputRangeForTest = (
  file: CurveFileForTest,
  xGroups: readonly (readonly number[])[],
): SliceRun["inputRanges"][number]["range"] => {
  const yColumns = (file.series ?? [])
    .map((series, index) => readNonNegativeInteger(series.yCol) ?? index + 1);
  const endCol = Math.max(0, ...yColumns);
  const pointCount = Math.max(0, ...xGroups.map(group => group.length));
  return {
    startRow: 0,
    endRow: Math.max(0, pointCount - 1),
    startCol: 0,
    endCol,
  };
};

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

const createCurveChannels = (yValues: readonly number[]): CurveChannelsRecord => ({
  yPositive: yValues.map(value => value > 0 ? value : Number.NaN),
  yAbsPositive: yValues.map(value => {
    const absolute = Math.abs(value);
    return absolute > 0 ? absolute : Number.NaN;
  }),
  yLog10Abs: yValues.map(value => {
    const absolute = Math.abs(value);
    return absolute > 0 ? Math.log10(absolute) : Number.NaN;
  }),
});

const createDomainRecord = (
  points: readonly { x: number; y: number }[],
  channels?: CurveChannelsRecord,
): DomainRecord => ({
  x: getFiniteDomain(points.map(point => point.x)),
  y: getFiniteDomain(points.map(point => point.y)),
  yPositive: getFiniteDomain(channels?.yPositive ?? []),
  yAbsPositive: getFiniteDomain(channels?.yAbsPositive ?? []),
  yLog10Abs: getFiniteDomain(channels?.yLog10Abs ?? []),
});

const getFiniteDomain = (values: readonly unknown[]): [number, number] | undefined => {
  const finite = values
    .map(value => Number(value))
    .filter(value => Number.isFinite(value));
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

const normalizeTemplateSelection = (
  selection: TemplateSelection,
): TemplateSelection => {
  if (selection.kind === "saved") {
    const templateId = normalizeOptionalText(selection.templateId);
    return templateId ? { kind: "saved", templateId } : { kind: "auto" };
  }

  return { kind: "auto" };
};

const createSnapshotForTest = (
  records: Pick<SessionSnapshot, "filesById" | "fileOrder">,
): SessionSnapshot => ({
  schemaVersion: 1,
  sessionVersion: 0,
  filesById: records.filesById,
  fileOrder: records.fileOrder,
});

const appendOrderedId = (
  order: readonly string[],
  id: string,
): string[] => {
  const next = [...order];
  if (id && !next.includes(id)) {
    next.push(id);
  }
  return next;
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
    .replaceAll("碌", "u")
    .replaceAll("渭", "u");

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

const normalizeCurveKindText = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();

const readNumberArray = (value: unknown): number[] =>
  isNumberArraySource(value)
    ? Array.from(value, item => Number(item))
      .filter(item => Number.isFinite(item))
    : [];

const readNumberMatrix = (value: unknown): number[][] =>
  Array.isArray(value)
    ? value.map(readNumberArray).filter(group => group.length > 0)
    : [];

const isNumberArraySource = (value: unknown): value is ArrayLike<unknown> =>
  Array.isArray(value) ||
  (
    ArrayBuffer.isView(value) &&
    typeof (value as { readonly length?: unknown }).length === "number"
  );

const readNonNegativeInteger = (value: unknown): number | undefined => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : undefined;
};

const readRecordNumber = (
  record: unknown,
  key: string,
): number | undefined => {
  if (!record || typeof record !== "object") {
    return undefined;
  }

  const value = (record as Record<string, unknown>)[key];
  return Number.isFinite(Number(value)) ? Number(value) : undefined;
};

const getFiniteUnitFactor = (value: unknown): number => {
  const factor = Number(value);
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
};

const normalizeId = (value: unknown): string => String(value ?? "").trim();

const normalizeOptionalText = (value: unknown): string | undefined => {
  const text = String(value ?? "").trim();
  return text || undefined;
};
