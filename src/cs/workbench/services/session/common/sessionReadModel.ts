import {
  createCalculatedPlotsByKeyFromRecords,
  type CalculatedPlotsByKey,
} from "src/cs/workbench/services/calculation/common/calculationReadModel";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import {
  getLatestTemplateRunRecord,
  type FileId,
  type FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  createRawFilesFromRecords,
} from "src/cs/workbench/services/session/common/sessionModelAdapter";
import {
  collectFileRecordBaseCurves,
  createProcessedSeriesFromFileRecord,
  fileRecordSupportsSs,
  getFileRecordAxisProjection,
  getFileRecordCurveType,
  getFileRecordXGroups,
} from "src/cs/workbench/services/session/common/sessionRecordProjection";
import type {
  ProcessedEntry,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";

export type SessionReadModel = {
  readonly calculatedPlotsByKey: CalculatedPlotsByKey;
  readonly hasChartData: boolean;
  readonly hasSessionData: boolean;
  readonly processedFileIds: FileId[];
  readonly processedFiles: ProcessedEntry[];
  readonly rawFiles: SessionFile[];
};

export const createSessionReadModel = (
  snapshot: SessionSnapshot,
): SessionReadModel => {
  const rawFiles = createRawFilesFromRecords(
    snapshot.filesById,
    snapshot.fileOrder,
  );
  const processedFileIds = getProcessedFileIds(snapshot);
  const processedFiles = createProcessedEntriesFromRecords(
    snapshot.filesById,
    snapshot.fileOrder,
  );

  return {
    calculatedPlotsByKey: createCalculatedPlotsByKeyFromRecords(
      snapshot.filesById,
      snapshot.fileOrder,
    ),
    hasChartData: processedFileIds.length > 0,
    hasSessionData: rawFiles.length > 0 || processedFileIds.length > 0,
    processedFileIds,
    processedFiles,
    rawFiles,
  };
};

export const hasFileRecordChartData = (
  file: FileRecord | undefined,
): boolean =>
  Boolean(
    file &&
      collectFileRecordBaseCurves(file).length > 0,
  );

export const createProcessedEntriesFromRecords = (
  filesById: Readonly<Record<FileId, FileRecord>>,
  fileOrder: readonly FileId[],
): ProcessedEntry[] => {
  const entries: ProcessedEntry[] = [];
  for (const file of getOrderedFileRecords(filesById, fileOrder)) {
    if (hasFileRecordChartData(file)) {
      entries.push(createProcessedEntryFromFileRecord(file));
    }
  }
  return entries;
};

export const createProcessedEntryFromFileRecord = (
  file: FileRecord,
): ProcessedEntry => {
  const axis = getFileRecordAxisProjection(file);
  return {
    curveType: getFileRecordCurveType(file),
    fileId: file.id,
    fileName: file.raw.fileName,
    series: createProcessedSeriesFromFileRecord(file),
    supportsSs: fileRecordSupportsSs(file),
    xAxisRole: axis.xAxisRole,
    xGroups: getFileRecordXGroups(file),
    xLabel: axis.xLabel,
    xUnit: axis.xUnit ?? getLatestTemplateRunRecord(file)?.config.xUnit,
    yLabel: axis.yLabel,
    yUnit: axis.yUnit ?? getLatestTemplateRunRecord(file)?.config.yUnit,
  };
};

export const collectBaseCurveRecords = (
  file: FileRecord,
): ReturnType<typeof collectFileRecordBaseCurves> =>
  collectFileRecordBaseCurves(file);

const getProcessedFileIds = (snapshot: SessionSnapshot): FileId[] =>
  getOrderedFileRecords(snapshot.filesById, snapshot.fileOrder)
    .filter(hasFileRecordChartData)
    .map((file) => file.id);

const getOrderedFileRecords = (
  filesById: Readonly<Record<FileId, FileRecord>>,
  fileOrder: readonly FileId[],
): FileRecord[] => {
  const files: FileRecord[] = [];
  const seen = new Set<FileId>();
  const pushFile = (fileId: string): void => {
    const normalizedFileId = String(fileId ?? "").trim();
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
