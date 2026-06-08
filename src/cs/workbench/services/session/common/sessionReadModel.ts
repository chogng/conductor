import type {
  CalculatedPlotsByKey,
} from "src/cs/workbench/contrib/calculation/common/calculatedData";
import {
  createCalculatedPlotsByKeyFromRecords,
} from "src/cs/workbench/contrib/calculation/common/calculatedData";
import type {
  PreviewStatus,
  SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import {
  resolveFileIdFromTarget,
  resolveSheetIdFromTarget,
  type BaseCurveRecord,
  type FileId,
  type FileRecord,
  type SheetId,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  createRawFilesFromRecords,
} from "src/cs/workbench/services/session/common/sessionModelAdapter";
import type {
  PreviewFile,
  ProcessedEntry,
  ProcessedSeries,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";

export type SessionReadModel = {
  readonly activeAnalysisFileId: FileId | null;
  readonly activeAnalysisFileRecord: FileRecord | null;
  readonly activeProcessedFile: ProcessedEntry | null;
  readonly activeTargetFileId: FileId | null;
  readonly activeTargetSheetId: SheetId | null;
  readonly calculatedPlotsByKey: CalculatedPlotsByKey;
  readonly hasAnalysisData: boolean;
  readonly hasSessionData: boolean;
  readonly previewFile: PreviewFile | null;
  readonly previewStatus: PreviewStatus;
  readonly processedFileIds: FileId[];
  readonly processedFiles: ProcessedEntry[];
  readonly rawFiles: SessionFile[];
};

const createIdlePreviewStatus = (): PreviewStatus => ({
  state: "idle",
  message: "",
});

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
  const activeTargetFileId = resolveFileIdFromTarget(snapshot.activeTarget);
  const activeAnalysisFileId = resolveActiveAnalysisFileId(snapshot);
  const activeAnalysisFileRecord = activeAnalysisFileId
    ? snapshot.filesById[activeAnalysisFileId] ?? null
    : null;

  return {
    activeAnalysisFileId,
    activeAnalysisFileRecord,
    activeProcessedFile: activeAnalysisFileRecord
      ? createProcessedEntryFromFileRecord(activeAnalysisFileRecord)
      : null,
    activeTargetFileId,
    activeTargetSheetId: resolveSheetIdFromTarget(snapshot.activeTarget),
    calculatedPlotsByKey: createCalculatedPlotsByKeyFromRecords(
      snapshot.filesById,
      snapshot.fileOrder,
    ),
    hasAnalysisData: processedFileIds.length > 0,
    hasSessionData: rawFiles.length > 0 || processedFileIds.length > 0,
    previewFile: snapshot.viewState.table?.previewFile ?? null,
    previewStatus: snapshot.viewState.table?.previewStatus ??
      createIdlePreviewStatus(),
    processedFileIds,
    processedFiles,
    rawFiles,
  };
};

export const resolveActiveAnalysisFileId = (
  snapshot: SessionSnapshot,
): FileId | null => {
  const activeFileId = resolveFileIdFromTarget(snapshot.activeTarget);
  if (activeFileId && hasFileRecordAnalysisData(snapshot.filesById[activeFileId])) {
    return activeFileId;
  }

  return resolveFirstAnalysisFileId(snapshot);
};

export const resolveFirstAnalysisFileId = (
  snapshot: SessionSnapshot,
): FileId | null => {
  for (const fileId of snapshot.fileOrder) {
    if (hasFileRecordAnalysisData(snapshot.filesById[fileId])) {
      return fileId;
    }
  }

  for (const [fileId, file] of Object.entries(snapshot.filesById)) {
    if (hasFileRecordAnalysisData(file)) {
      return fileId;
    }
  }

  return null;
};

export const hasFileRecordAnalysisData = (
  file: FileRecord | undefined,
): boolean =>
  Boolean(
    file &&
      (file.seriesOrder.length > 0 || collectBaseCurveRecords(file).length > 0),
  );

export const createProcessedEntriesFromRecords = (
  filesById: Readonly<Record<FileId, FileRecord>>,
  fileOrder: readonly FileId[],
): ProcessedEntry[] => {
  const entries: ProcessedEntry[] = [];
  for (const file of getOrderedFileRecords(filesById, fileOrder)) {
    if (hasFileRecordAnalysisData(file)) {
      entries.push(createProcessedEntryFromFileRecord(file));
    }
  }
  return entries;
};

export const createProcessedEntryFromFileRecord = (
  file: FileRecord,
): ProcessedEntry => {
  const baseCurves = collectBaseCurveRecords(file);
  if (baseCurves.length) {
    return {
      curveType: file.assessment.baseFamily ?? undefined,
      curveTypeConfidence: file.assessment.baseFamilyConfidence,
      curveTypeReasons: file.assessment.baseFamilyReasons,
      fileId: file.id,
      fileName: file.raw.fileName,
      series: baseCurves.map((curve, index): ProcessedSeries => {
        const series = file.seriesById[curve.seriesId];
        return {
          groupIndex: index,
          id: curve.seriesId,
          legendValue: series?.legendValue,
          name: series?.labelOverride ?? series?.name ?? series?.legendValue,
          y: curve.points.map((point) => point.y),
          yCol: Number.isInteger(Number(series?.yCol)) ? series?.yCol : index + 1,
        };
      }),
      supportsSs: file.assessment.baseFamily === "iv" &&
        baseCurves.some((curve) => curve.ivMode === "transfer"),
      xAxisRole: normalizeProcessedXAxisRole(file.axis?.x.role),
      xGroups: baseCurves.map((curve) => curve.points.map((point) => point.x)),
      xLabel: file.axis?.x.label,
      xUnit: file.axis?.x.unit ?? file.templateRun?.config.xUnit,
      yLabel: file.axis?.y.label,
      yUnit: file.axis?.y.unit ?? file.templateRun?.config.yUnit,
    };
  }

  return {
    curveType: file.assessment.baseFamily ?? undefined,
    curveTypeConfidence: file.assessment.baseFamilyConfidence,
    curveTypeReasons: file.assessment.baseFamilyReasons,
    fileId: file.id,
    fileName: file.raw.fileName,
    series: file.seriesOrder
      .map((seriesId, index): ProcessedSeries | null => {
        const series = file.seriesById[seriesId];
        if (!series) {
          return null;
        }

        return {
          groupIndex: series.groupIndex,
          id: series.id || `series-${index + 1}`,
          legendValue: series.legendValue,
          name: series.labelOverride ?? series.name ?? series.legendValue,
          y: series.y,
          yCol: series.yCol,
        };
      })
      .filter((series): series is ProcessedSeries => Boolean(series)),
    supportsSs: file.assessment.baseFamily === "iv" && hasTransferCurve(file),
    xAxisRole: normalizeProcessedXAxisRole(file.axis?.x.role),
    xGroups: file.xGroups,
    xLabel: file.axis?.x.label,
    xUnit: file.axis?.x.unit ?? file.templateRun?.config.xUnit,
    yLabel: file.axis?.y.label,
    yUnit: file.axis?.y.unit ?? file.templateRun?.config.yUnit,
  };
};

export const collectBaseCurveRecords = (
  file: FileRecord,
): BaseCurveRecord[] => {
  const curves = Object.values(file.curvesByKey).filter(
    (curve): curve is BaseCurveRecord => curve.curveGeneration === "base",
  );
  if (!curves.length) {
    return [];
  }

  const used = new Set<BaseCurveRecord>();
  const ordered: BaseCurveRecord[] = [];
  const pushCurve = (curve: BaseCurveRecord): void => {
    if (used.has(curve)) {
      return;
    }
    used.add(curve);
    ordered.push(curve);
  };

  for (const seriesId of file.seriesOrder) {
    for (const curve of curves) {
      if (curve.seriesId === seriesId) {
        pushCurve(curve);
      }
    }
  }
  for (const curve of curves) {
    pushCurve(curve);
  }

  return ordered;
};

const getProcessedFileIds = (snapshot: SessionSnapshot): FileId[] =>
  getOrderedFileRecords(snapshot.filesById, snapshot.fileOrder)
    .filter(hasFileRecordAnalysisData)
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

const hasTransferCurve = (file: FileRecord): boolean =>
  Object.values(file.curvesByKey).some(
    (curve) =>
      curve.curveGeneration === "base" &&
      curve.curveFamily === "iv" &&
      curve.ivMode === "transfer",
  );

const normalizeProcessedXAxisRole = (
  role: unknown,
): ProcessedEntry["xAxisRole"] => {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (normalized === "vg" || normalized === "gate" || normalized === "gatevoltage") {
    return "vg";
  }
  if (normalized === "vd" || normalized === "drain" || normalized === "drainvoltage") {
    return "vd";
  }
  return null;
};
