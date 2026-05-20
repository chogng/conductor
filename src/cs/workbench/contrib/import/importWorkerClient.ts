import {
  type ImportedCurveAssessment,
} from "src/cs/workbench/common/deviceAnalysis/importFileUtils";
import { isExcelDataImportFileName } from "src/cs/workbench/contrib/import/importFileConversion";
import {
  isPerfEnabled,
  startPerf,
} from "src/cs/workbench/common/deviceAnalysis/perf";

type ImportWorkerPreparedFile = {
  assessment: ImportedCurveAssessment;
  file: File;
  normalizedCsvPath?: string | null;
  normalizedSizeBytes: number;
  sourcePath?: string | null;
  sourceName: string;
  sourceSizeBytes: number;
};

type ImportWorkerMessage =
  | {
      type: "prepareImportFileResult";
      payload?: ImportWorkerPreparedFile & { requestId?: number | null };
    }
  | {
      type: "importWorkerError";
      payload?: {
        fileName?: string | null;
        message?: string | null;
        requestId?: number | null;
      };
    };

type PendingRequest = {
  slotIndex: number;
  reject: (error: Error) => void;
  resolve: (result: ImportWorkerPreparedFile) => void;
};

type RustExcelConvertResult = {
  assessment?: ImportedCurveAssessment | null;
  code?: string;
  csvPath?: string;
  csvText?: string;
  durationMs?: number;
  manifest?: unknown;
  message?: string;
  ok?: boolean;
  source?: string;
};

type DesktopImportBridge = {
  convertExcelFileWithRust?: (payload: {
    path: string;
    returnCsvText?: boolean;
  }) => Promise<RustExcelConvertResult>;
  readConvertedCsvFileWithRust?: (payload: {
    path: string;
  }) => Promise<{ csvText?: string; ok?: boolean; sizeBytes?: number }>;
  disposeDeviceAnalysisFileWithRust?: (payload: {
    clear?: boolean;
    fileId?: string;
  }) => Promise<unknown>;
  getDeviceAnalysisPreviewRowsWithRust?: (payload: {
    endRow: number;
    fileId: string;
    startRow: number;
  }) => Promise<unknown>;
  getDeviceAnalysisDemoFiles?: () => Promise<{
    demoDir?: string;
    files?: Array<{
      fileName?: string;
      lastModified?: number;
      path?: string;
      size?: number;
      text?: string;
    }>;
  }>;
  getDeviceAnalysisPreviewMetaWithRust?: (payload: {
    fileId: string;
  }) => Promise<unknown>;
  getFilePath?: (file: File) => string;
  openDeviceAnalysisFileWithRust?: (payload: {
    fileId: string;
    fileName: string;
    path: string;
    seedRows?: number;
  }) => Promise<unknown>;
  readDeviceAnalysisCellWithRust?: (payload: {
    colIndex: number;
    fileId: string;
    rowIndex: number;
  }) => Promise<unknown>;
  readDeviceAnalysisCellsWithRust?: (payload: {
    cells: Array<{ colIndex: number; rowIndex: number }>;
    fileId: string;
  }) => Promise<unknown>;
  inferDeviceAnalysisAutoExtractionWithRust?: (payload: {
    fileId: string;
    fileName: string;
    path: string;
  }) => Promise<unknown>;
};

type ImportWorkerSlot = {
  excelRequestsSinceRecycle: number;
  index: number;
  pendingCount: number;
  worker: Worker | null;
};

let requestIdSeed = 0;
const pendingRequests = new Map<number, PendingRequest>();
const IMPORT_WORKER_POOL_SIZE = 2;
const IMPORT_WORKER_EXCEL_RECYCLE_INTERVAL = 24;
const importWorkerSlots: ImportWorkerSlot[] = Array.from(
  { length: IMPORT_WORKER_POOL_SIZE },
  (_unused, index) => ({
    excelRequestsSinceRecycle: 0,
    index,
    pendingCount: 0,
    worker: null,
  }),
);

const getRustConvertCsvBytes = (manifest: unknown): number | null => {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return null;
  }
  const value = Number((manifest as { csvBytes?: unknown }).csvBytes);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

declare global {
  interface Window {
    desktopImport?: DesktopImportBridge;
  }
}

const rejectPendingRequests = (error: Error, slotIndex: number | null = null) => {
  for (const [requestId, pending] of pendingRequests.entries()) {
    if (slotIndex !== null && pending.slotIndex !== slotIndex) continue;
    pending.reject(error);
    pendingRequests.delete(requestId);
  }
};

const disposeImportWorkerSlot = (slot: ImportWorkerSlot) => {
  slot.worker?.terminate();
  slot.worker = null;
  slot.excelRequestsSinceRecycle = 0;
  slot.pendingCount = 0;
};

const createImportWorkerForSlot = (slot: ImportWorkerSlot) => {
  if (slot.worker) return slot.worker;

  const worker = new Worker(
    new URL("./import.worker.ts", import.meta.url),
    { type: "module" },
  );
  slot.worker = worker;

  worker.onmessage = (event: MessageEvent<ImportWorkerMessage>) => {
    const { type, payload } = event.data ?? {};
    const requestId = Number(payload?.requestId);
    const pending = Number.isInteger(requestId)
      ? pendingRequests.get(requestId)
      : null;
    if (!pending) return;

    pendingRequests.delete(requestId);
    slot.pendingCount = Math.max(0, slot.pendingCount - 1);

    if (type === "prepareImportFileResult") {
      if (!payload?.file) {
        pending.reject(new Error("Import worker returned an empty file."));
        return;
      }
      pending.resolve({
        assessment: payload.assessment,
        file: payload.file,
        normalizedSizeBytes: payload.normalizedSizeBytes,
        sourcePath: payload.sourcePath ?? null,
        sourceName: payload.sourceName,
        sourceSizeBytes: payload.sourceSizeBytes,
      });
      if (isExcelDataImportFileName(payload.sourceName)) {
        slot.excelRequestsSinceRecycle += 1;
      }
      if (
        slot.pendingCount === 0 &&
        slot.excelRequestsSinceRecycle >= IMPORT_WORKER_EXCEL_RECYCLE_INTERVAL
      ) {
        disposeImportWorkerSlot(slot);
      }
      return;
    }

    pending.reject(
      new Error(
        typeof payload?.message === "string" && payload.message.trim()
          ? payload.message
          : "Import worker failed.",
      ),
    );
  };

  worker.onerror = (event) => {
    const message =
      typeof event?.message === "string" && event.message.trim()
        ? event.message
        : "Import worker failed.";
    rejectPendingRequests(new Error(message), slot.index);
    disposeImportWorkerSlot(slot);
  };

  return worker;
};

const getLeastBusyImportWorkerSlot = (): ImportWorkerSlot => {
  let selected = importWorkerSlots[0];
  for (const slot of importWorkerSlots) {
    if (slot.pendingCount < selected.pendingCount) {
      selected = slot;
    }
  }
  return selected;
};

const prepareImportFileWithJsWorker = (
  file: File,
): Promise<ImportWorkerPreparedFile> => {
  const slot = getLeastBusyImportWorkerSlot();
  const worker = createImportWorkerForSlot(slot);
  const requestId = (requestIdSeed += 1);
  slot.pendingCount += 1;

  const sourcePath = globalThis.window?.desktopImport?.getFilePath?.(file) ?? "";

  return new Promise<ImportWorkerPreparedFile>((resolve, reject) => {
    pendingRequests.set(requestId, { reject, resolve, slotIndex: slot.index });
    worker.postMessage({
      type: "prepareImportFile",
      payload: {
        file,
        perfEnabled: isPerfEnabled(),
        requestId,
      },
    });
  }).then((result) => ({
    ...result,
    sourcePath: sourcePath || result.sourcePath || null,
  }));
};

const prepareExcelImportFileWithRust = async (
  file: File,
): Promise<ImportWorkerPreparedFile | null> => {
  if (!isExcelDataImportFileName(file.name)) return null;

  const bridge = globalThis.window?.desktopImport;
  if (!bridge?.getFilePath || !bridge?.convertExcelFileWithRust) return null;

  const filePath = bridge.getFilePath(file);
  if (!filePath) return null;

  const finishPerf = startPerf("import:rust-excel-convert", {
    fileName: file.name,
    sizeBytes: file.size,
  });

  try {
    const result = await bridge.convertExcelFileWithRust({
      path: filePath,
      returnCsvText: false,
    });
    if (
      !result?.ok ||
      (!result.csvPath && typeof result.csvText !== "string") ||
      !result.assessment
    ) {
      finishPerf({
        code: result?.code ?? null,
        message: result?.message ?? null,
        rustDurationMs: result?.durationMs ?? null,
        source: "rust-fallback",
      });
      return null;
    }

    const normalizedFile =
      typeof result.csvText === "string"
        ? new File([result.csvText], file.name, {
            lastModified: Number.isFinite(file.lastModified)
              ? file.lastModified
              : Date.now(),
            type: "text/csv;charset=utf-8",
          })
        : file;
    const assessment = result.assessment;
    const normalizedSizeBytes =
      getRustConvertCsvBytes(result.manifest) ??
      (Number((result as any)?.normalizedSizeBytes) || normalizedFile.size);

    finishPerf({
      confidence: assessment.curveTypeConfidence,
      curveType: assessment.curveType,
      normalizedCsvPath: result.csvPath ?? null,
      normalizedSizeBytes,
      rustDurationMs: result.durationMs ?? null,
      source: result.assessment ? "rust-assessment" : result.source ?? "rust",
      xAxisRole: assessment.xAxisRole,
    });

    return {
      assessment,
      file: normalizedFile,
      normalizedCsvPath: result.csvPath ?? null,
      normalizedSizeBytes,
      sourcePath: filePath,
      sourceName: file.name,
      sourceSizeBytes: file.size,
    };
  } catch (error) {
    finishPerf({
      message: error instanceof Error ? error.message : String(error),
      source: "rust-fallback",
    });
    return null;
  }
};

export const loadConvertedCsvFile = async ({
  fallbackFile,
  fileName,
  lastModified,
  normalizedCsvPath,
}: {
  fallbackFile?: unknown;
  fileName?: unknown;
  lastModified?: unknown;
  normalizedCsvPath?: unknown;
}): Promise<File | null> => {
  const csvPath =
    typeof normalizedCsvPath === "string" ? normalizedCsvPath.trim() : "";
  if (!csvPath) {
    return fallbackFile instanceof File ? fallbackFile : null;
  }

  const bridge = globalThis.window?.desktopImport;
  if (!bridge?.readConvertedCsvFileWithRust) {
    return fallbackFile instanceof File ? fallbackFile : null;
  }

  try {
    const response = await bridge.readConvertedCsvFileWithRust({ path: csvPath });
    if (!response?.ok || typeof response.csvText !== "string") {
      return fallbackFile instanceof File ? fallbackFile : null;
    }
    return new File([response.csvText], String(fileName || "converted.csv"), {
      lastModified: Number.isFinite(Number(lastModified))
        ? Number(lastModified)
        : Date.now(),
      type: "text/csv;charset=utf-8",
    });
  } catch {
    return fallbackFile instanceof File ? fallbackFile : null;
  }
};

export const prepareImportFileInWorker = async (
  file: File,
): Promise<ImportWorkerPreparedFile> => {
  const rustPrepared = await prepareExcelImportFileWithRust(file);
  if (rustPrepared) return rustPrepared;

  return prepareImportFileWithJsWorker(file);
};

export const resetImportWorker = () => {
  rejectPendingRequests(new Error("Import worker reset."));
  for (const slot of importWorkerSlots) {
    disposeImportWorkerSlot(slot);
  }
};
