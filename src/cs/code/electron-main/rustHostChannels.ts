import path from "node:path";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type {
  AnalyzeRcRequest,
  DisposeFileRequest,
  ExportOriginCsvRequest,
  IRustHostService,
  OpenFileRequest,
  PreviewMetaRequest,
  PreviewRowsRequest,
  ProcessFileRequest,
  ReadCellRequest,
  ReadCellsRequest,
  RustProcessConfig,
} from "../../platform/rust/common/rustHostProtocol.js";
import type { workbenchIpcChannels } from "../../workbench/common/ipcChannels.js";

type RegisterRustHandlersOptions = {
  ipcChannels: Pick<
    typeof workbenchIpcChannels,
    | "analysisRustEngineAnalyzeRc"
    | "analysisRustEngineDispose"
    | "analysisRustEngineExportOriginCsv"
    | "analysisRustEngineOpen"
    | "analysisRustEnginePreviewMeta"
    | "analysisRustEnginePreviewRows"
    | "analysisRustEngineProcessFile"
    | "analysisRustEngineReadCell"
    | "analysisRustEngineReadCells"
  >;
  ipcMain: IpcMain;
  rustService: IRustHostService;
};

const normalizeCellIndex = (value: unknown): number | null => {
  const index = Math.floor(Number(value));
  return Number.isInteger(index) && index >= 0 ? index : null;
};

const readString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const readObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const ErrorCode = {
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

export const registerRustHostChannels = ({
  ipcChannels,
  ipcMain,
  rustService,
}: RegisterRustHandlersOptions): { dispose(): void } => {
  const handleRustEngineOpen = async (
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
    return rustService.openFile(request);
  };

  const handleRustEnginePreviewRows = async (
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
    return rustService.previewRows(request);
  };

  const handleRustEnginePreviewMeta = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const record = readObject(payload);
    const request: PreviewMetaRequest = {
      fileId: readString(record?.fileId),
    };
    return rustService.previewMeta(request);
  };

  const handleRustEngineReadCell = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const record = readObject(payload);
    const rowIndex = normalizeCellIndex(record?.rowIndex);
    const colIndex = normalizeCellIndex(record?.colIndex);

    if (!readString(record?.fileId) || rowIndex === null || colIndex === null) {
      return {
        ok: false,
        code: ErrorCode.InvalidCell,
        message: "Invalid analysis cell request.",
      };
    }

    const request: ReadCellRequest = {
      colIndex,
      fileId: readString(record?.fileId),
      rowIndex,
    };
    return rustService.readCell(request);
  };

  const handleRustEngineReadCells = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const record = readObject(payload);
    const rawCells = Array.isArray(record?.cells)
      ? record.cells as Array<{ colIndex?: unknown; rowIndex?: unknown }>
      : [];
    const cells = rawCells
      .map((cell) => ({
        colIndex: normalizeCellIndex(cell?.colIndex),
        rowIndex: normalizeCellIndex(cell?.rowIndex),
      }))
      .filter((cell) => cell.rowIndex !== null && cell.colIndex !== null)
      .slice(0, 5000);

    if (!readString(record?.fileId) || !cells.length || cells.length !== rawCells.length) {
      return {
        ok: false,
        code: ErrorCode.InvalidCells,
        message: "Invalid analysis cells request.",
      };
    }

    const request: ReadCellsRequest = {
      cells: cells as Array<{ colIndex: number; rowIndex: number }>,
      fileId: readString(record?.fileId),
    };
    return rustService.readCells(request);
  };

  const handleRustEngineProcessFile = async (
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
    return rustService.processFile(request);
  };

  const handleRustEngineAnalyzeRc = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const record = readObject(payload);
    const request: AnalyzeRcRequest = {
      devices: Array.isArray(record?.devices) ? record.devices : [],
      options: readObject(record?.options) ?? {},
    };
    return rustService.analyzeRc(request);
  };

  const handleRustEngineExportOriginCsv = async (
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
    return rustService.exportOriginCsv(request);
  };

  const handleRustEngineDispose = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const record = readObject(payload);
    const request: DisposeFileRequest = {
      clear: record?.clear === true,
      fileId: readString(record?.fileId),
    };
    return rustService.disposeFile(request);
  };

  ipcMain.handle(
    ipcChannels.analysisRustEngineOpen,
    handleRustEngineOpen,
  );
  ipcMain.handle(
    ipcChannels.analysisRustEnginePreviewMeta,
    handleRustEnginePreviewMeta,
  );
  ipcMain.handle(
    ipcChannels.analysisRustEnginePreviewRows,
    handleRustEnginePreviewRows,
  );
  ipcMain.handle(
    ipcChannels.analysisRustEngineReadCell,
    handleRustEngineReadCell,
  );
  ipcMain.handle(
    ipcChannels.analysisRustEngineReadCells,
    handleRustEngineReadCells,
  );
  ipcMain.handle(
    ipcChannels.analysisRustEngineProcessFile,
    handleRustEngineProcessFile,
  );
  ipcMain.handle(
    ipcChannels.analysisRustEngineAnalyzeRc,
    handleRustEngineAnalyzeRc,
  );
  ipcMain.handle(
    ipcChannels.analysisRustEngineExportOriginCsv,
    handleRustEngineExportOriginCsv,
  );
  ipcMain.handle(
    ipcChannels.analysisRustEngineDispose,
    handleRustEngineDispose,
  );

  return {
    dispose() {
      ipcMain.removeHandler(ipcChannels.analysisRustEngineOpen);
      ipcMain.removeHandler(ipcChannels.analysisRustEnginePreviewMeta);
      ipcMain.removeHandler(ipcChannels.analysisRustEnginePreviewRows);
      ipcMain.removeHandler(ipcChannels.analysisRustEngineReadCell);
      ipcMain.removeHandler(ipcChannels.analysisRustEngineReadCells);
      ipcMain.removeHandler(ipcChannels.analysisRustEngineProcessFile);
      ipcMain.removeHandler(ipcChannels.analysisRustEngineAnalyzeRc);
      ipcMain.removeHandler(ipcChannels.analysisRustEngineExportOriginCsv);
      ipcMain.removeHandler(ipcChannels.analysisRustEngineDispose);
    },
  };
};
