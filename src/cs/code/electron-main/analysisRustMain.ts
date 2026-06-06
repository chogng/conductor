import path from "node:path";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type {
  AnalyzeRcRequest,
  DisposeFileRequest,
  ExportOriginCsvRequest,
  InferAutoExtractionRequest,
  IRustAnalysisService,
  OpenFileRequest,
  PreviewMetaRequest,
  PreviewRowsRequest,
  ProcessFileRequest,
  ReadCellRequest,
  ReadCellsRequest,
  RustProcessConfig,
} from "../../platform/rust/common/rustAnalysisProtocol.js";
import type { workbenchIpcChannels } from "../../workbench/common/ipcChannels.js";

type RegisterAnalysisRustHandlersOptions = {
  ipcChannels: Pick<
    typeof workbenchIpcChannels,
    | "analysisRustEngineAnalyzeRc"
    | "analysisRustEngineDispose"
    | "analysisRustEngineExportOriginCsv"
    | "analysisRustEngineInferAutoExtraction"
    | "analysisRustEngineOpen"
    | "analysisRustEnginePreviewMeta"
    | "analysisRustEnginePreviewRows"
    | "analysisRustEngineProcessFile"
    | "analysisRustEngineReadCell"
    | "analysisRustEngineReadCells"
  >;
  ipcMain: IpcMain;
  rustAnalysisService: IRustAnalysisService;
};

const normalizeAnalysisCellIndex = (value: unknown): number | null => {
  const index = Math.floor(Number(value));
  return Number.isInteger(index) && index >= 0 ? index : null;
};

const readString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const readObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const AnalysisErrorCode = {
  InvalidCell: "INVALID_ANALYSIS_CELL",
  InvalidCells: "INVALID_ANALYSIS_CELLS",
} as const;

const normalizeAbsoluteFilePath = (rawPath: unknown): string => {
  const normalized = typeof rawPath === "string" ? rawPath.trim() : "";
  if (!normalized || !path.isAbsolute(normalized)) {
    return "";
  }
  return path.normalize(normalized);
};

export const registerAnalysisRustHandlers = ({
  ipcChannels,
  ipcMain,
  rustAnalysisService,
}: RegisterAnalysisRustHandlersOptions): { dispose(): void } => {
  const handleAnalysisRustEngineOpen = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const record = readObject(payload);
    const request: OpenFileRequest = {
      fileId: readString(record?.fileId),
      fileName: readString(record?.fileName),
      inputPath: normalizeAbsoluteFilePath(record?.path),
      seedRows: Math.max(0, Math.min(5000, Math.floor(Number(record?.seedRows) || 0))),
    };
    return rustAnalysisService.openFile(request);
  };

  const handleAnalysisRustEnginePreviewRows = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const record = readObject(payload);
    const startRow = Math.max(0, Math.floor(Number(record?.startRow) || 0));
    const request: PreviewRowsRequest = {
      endRow: Math.max(startRow, Math.floor(Number(record?.endRow) || startRow)),
      fileId: readString(record?.fileId),
      startRow,
    };
    return rustAnalysisService.previewRows(request);
  };

  const handleAnalysisRustEnginePreviewMeta = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const record = readObject(payload);
    const request: PreviewMetaRequest = {
      fileId: readString(record?.fileId),
    };
    return rustAnalysisService.previewMeta(request);
  };

  const handleAnalysisRustEngineReadCell = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const record = readObject(payload);
    const rowIndex = normalizeAnalysisCellIndex(record?.rowIndex);
    const colIndex = normalizeAnalysisCellIndex(record?.colIndex);

    if (!readString(record?.fileId) || rowIndex === null || colIndex === null) {
      return {
        ok: false,
        code: AnalysisErrorCode.InvalidCell,
        message: "Invalid analysis cell request.",
      };
    }

    const request: ReadCellRequest = {
      colIndex,
      fileId: readString(record?.fileId),
      rowIndex,
    };
    return rustAnalysisService.readCell(request);
  };

  const handleAnalysisRustEngineReadCells = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const record = readObject(payload);
    const rawCells = Array.isArray(record?.cells)
      ? record.cells as Array<{ colIndex?: unknown; rowIndex?: unknown }>
      : [];
    const cells = rawCells
      .map((cell) => ({
        colIndex: normalizeAnalysisCellIndex(cell?.colIndex),
        rowIndex: normalizeAnalysisCellIndex(cell?.rowIndex),
      }))
      .filter((cell) => cell.rowIndex !== null && cell.colIndex !== null)
      .slice(0, 5000);

    if (!readString(record?.fileId) || !cells.length || cells.length !== rawCells.length) {
      return {
        ok: false,
        code: AnalysisErrorCode.InvalidCells,
        message: "Invalid analysis cells request.",
      };
    }

    const request: ReadCellsRequest = {
      cells: cells as Array<{ colIndex: number; rowIndex: number }>,
      fileId: readString(record?.fileId),
    };
    return rustAnalysisService.readCells(request);
  };

  const handleAnalysisRustEngineInferAutoExtraction = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const record = readObject(payload);
    const request: InferAutoExtractionRequest = {
      fileId: readString(record?.fileId),
      fileName: readString(record?.fileName),
      inputPath: normalizeAbsoluteFilePath(record?.path),
    };
    return rustAnalysisService.inferAutoExtraction(request);
  };

  const handleAnalysisRustEngineProcessFile = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const record = readObject(payload);
    const config = readObject(record?.config) as RustProcessConfig | null;
    const request: ProcessFileRequest = {
      auto: record?.auto === true,
      config,
      curveFilterField: readString(record?.curveFilterField) || null,
      curveFilterKey: readString(record?.curveFilterKey) || null,
      fileId: readString(record?.fileId),
      fileName: readString(record?.fileName),
      inputPath: normalizeAbsoluteFilePath(record?.path),
      maxPoints: Math.max(2, Math.floor(Number(record?.maxPoints) || 600)),
    };
    return rustAnalysisService.processFile(request);
  };

  const handleAnalysisRustEngineAnalyzeRc = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const record = readObject(payload);
    const request: AnalyzeRcRequest = {
      devices: Array.isArray(record?.devices) ? record.devices : [],
      options: readObject(record?.options) ?? {},
    };
    return rustAnalysisService.analyzeRc(request);
  };

  const handleAnalysisRustEngineExportOriginCsv = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const record = readObject(payload);
    const request: ExportOriginCsvRequest = {
      columns: Array.isArray(record?.columns) ? record.columns : [],
      config: readObject(record?.config) as RustProcessConfig | null,
      csvName: readString(record?.csvName) || "origin.csv",
      fileId: readString(record?.fileId),
      fileName: readString(record?.fileName),
      inputPath: normalizeAbsoluteFilePath(record?.path),
      maxPoints: record?.maxPoints,
      metricKind: readString(record?.metricKind),
      metricSeries: Array.isArray(record?.metricSeries) ? record.metricSeries : [],
      sourceFile: readObject(record?.sourceFile) ?? undefined,
      sources: Array.isArray(record?.sources)
        ? record.sources.filter((source): source is Record<string, unknown> => readObject(source) !== null)
        : undefined,
      xScaleFactor: record?.xScaleFactor,
      yScaleFactor: record?.yScaleFactor,
      yTransform: record?.yTransform,
    };
    return rustAnalysisService.exportOriginCsv(request);
  };

  const handleAnalysisRustEngineDispose = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const record = readObject(payload);
    const request: DisposeFileRequest = {
      clear: record?.clear === true,
      fileId: readString(record?.fileId),
    };
    return rustAnalysisService.disposeFile(request);
  };

  ipcMain.handle(
    ipcChannels.analysisRustEngineOpen,
    handleAnalysisRustEngineOpen,
  );
  ipcMain.handle(
    ipcChannels.analysisRustEnginePreviewMeta,
    handleAnalysisRustEnginePreviewMeta,
  );
  ipcMain.handle(
    ipcChannels.analysisRustEnginePreviewRows,
    handleAnalysisRustEnginePreviewRows,
  );
  ipcMain.handle(
    ipcChannels.analysisRustEngineReadCell,
    handleAnalysisRustEngineReadCell,
  );
  ipcMain.handle(
    ipcChannels.analysisRustEngineReadCells,
    handleAnalysisRustEngineReadCells,
  );
  ipcMain.handle(
    ipcChannels.analysisRustEngineInferAutoExtraction,
    handleAnalysisRustEngineInferAutoExtraction,
  );
  ipcMain.handle(
    ipcChannels.analysisRustEngineProcessFile,
    handleAnalysisRustEngineProcessFile,
  );
  ipcMain.handle(
    ipcChannels.analysisRustEngineAnalyzeRc,
    handleAnalysisRustEngineAnalyzeRc,
  );
  ipcMain.handle(
    ipcChannels.analysisRustEngineExportOriginCsv,
    handleAnalysisRustEngineExportOriginCsv,
  );
  ipcMain.handle(
    ipcChannels.analysisRustEngineDispose,
    handleAnalysisRustEngineDispose,
  );

  return {
    dispose() {
      ipcMain.removeHandler(ipcChannels.analysisRustEngineOpen);
      ipcMain.removeHandler(ipcChannels.analysisRustEnginePreviewMeta);
      ipcMain.removeHandler(ipcChannels.analysisRustEnginePreviewRows);
      ipcMain.removeHandler(ipcChannels.analysisRustEngineReadCell);
      ipcMain.removeHandler(ipcChannels.analysisRustEngineReadCells);
      ipcMain.removeHandler(ipcChannels.analysisRustEngineInferAutoExtraction);
      ipcMain.removeHandler(ipcChannels.analysisRustEngineProcessFile);
      ipcMain.removeHandler(ipcChannels.analysisRustEngineAnalyzeRc);
      ipcMain.removeHandler(ipcChannels.analysisRustEngineExportOriginCsv);
      ipcMain.removeHandler(ipcChannels.analysisRustEngineDispose);
    },
  };
};
