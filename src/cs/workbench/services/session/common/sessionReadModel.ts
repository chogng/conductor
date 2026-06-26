import { startPerf } from "src/cs/workbench/common/perf";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import {
  logSessionSnapshotTrace,
} from "src/cs/workbench/services/session/common/sessionTrace";
import {
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
  readonly hasChartData: boolean;
  readonly hasSessionData: boolean;
  readonly processedFileIds: FileId[];
  readonly processedFiles: ProcessedEntry[];
  readonly rawFiles: SessionFile[];
};

let cachedSnapshot: SessionSnapshot | null = null;
let cachedReadModel: SessionReadModel | null = null;

export const createSessionReadModel = (
  snapshot: SessionSnapshot,
): SessionReadModel => {
  if (cachedSnapshot === snapshot && cachedReadModel) {
    return cachedReadModel;
  }

  const endPerf = startPerf("createSessionReadModel", {
    fileCount: Object.keys(snapshot.filesById).length,
    sessionVersion: snapshot.sessionVersion,
  });
  const orderedFiles = getOrderedFileRecords(snapshot.filesById, snapshot.fileOrder);
  const rawFiles = createRawFilesFromRecords(
    snapshot.filesById,
    snapshot.fileOrder,
  );
  const { processedFileIds, processedFiles } = createProcessedReadModel(orderedFiles);
  const readModel = {
    hasChartData: processedFileIds.length > 0,
    hasSessionData: rawFiles.length > 0 || processedFileIds.length > 0,
    processedFileIds,
    processedFiles,
    rawFiles,
  };
  endPerf({
    processedFileCount: processedFileIds.length,
    processedProjectionCount: processedFiles.length,
    rawFileCount: rawFiles.length,
  });
  logSessionSnapshotTrace("createSessionReadModel", snapshot, {
    hasChartData: readModel.hasChartData,
    processedFileCount: processedFileIds.length,
    processedProjectionCount: processedFiles.length,
    rawFileCount: rawFiles.length,
  }, {
    fileIds: processedFileIds,
  });
  cachedSnapshot = snapshot;
  cachedReadModel = readModel;
  return readModel;
};

export const hasFileRecordChartData = (
  file: FileRecord | undefined,
): boolean =>
  Boolean(
    file &&
      collectFileRecordBaseCurves(file).length > 0,
  );

const createProcessedReadModel = (
  files: readonly FileRecord[],
): Pick<SessionReadModel, "processedFileIds" | "processedFiles"> => {
  const processedFileIds: FileId[] = [];
  const entries: ProcessedEntry[] = [];
  for (const file of files) {
    if (hasFileRecordChartData(file)) {
      processedFileIds.push(file.id);
      entries.push(createProcessedEntryFromFileRecord(file));
    }
  }

  return {
    processedFileIds,
    processedFiles: entries,
  };
};

export const createProcessedEntryFromFileRecord = (
  file: FileRecord,
): ProcessedEntry => {
  const axis = getFileRecordAxisProjection(file);
  return {
    curveType: getFileRecordCurveType(file),
    fileId: file.id,
    fileName: file.name || file.raw.fileName,
    series: createProcessedSeriesFromFileRecord(file),
    supportsSs: fileRecordSupportsSs(file),
    xAxisRole: axis.xAxisRole,
    xGroups: getFileRecordXGroups(file),
    xLabel: axis.xLabel,
    xUnit: axis.xUnit,
    yLabel: axis.yLabel,
    yUnit: axis.yUnit,
  };
};

export const collectBaseCurveRecords = (
  file: FileRecord,
): ReturnType<typeof collectFileRecordBaseCurves> =>
  collectFileRecordBaseCurves(file);

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
