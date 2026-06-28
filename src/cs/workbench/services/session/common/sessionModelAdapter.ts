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
  SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import type {
  BaseCurveFamily,
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
} from "src/cs/workbench/services/session/common/sessionModel";
import { getLatestSliceRunRecord } from "src/cs/workbench/services/session/common/sessionModel";

const createEmptyFileRecord = (fileId: string, fileName: string): FileRecord => {
  const raw = createRawRecord(fileId, fileName);
  return {
    id: fileId,
    kind: inferFileKindFromFileName(fileName),
    name: fileName,
    raw,
    rawTableVersionsById: createRawTableVersions(raw.tableOrder),
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

const createRawTableVersions = (
  rawTableOrder: readonly string[],
  previousVersions: Readonly<Record<string, number>> = {},
  changedRawTableIds: ReadonlySet<string> = new Set(rawTableOrder),
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

const normalizeId = (value: unknown): string => String(value ?? "").trim();

const normalizeOptionalText = (value: unknown): string | undefined => {
  const text = String(value ?? "").trim();
  return text || undefined;
};
