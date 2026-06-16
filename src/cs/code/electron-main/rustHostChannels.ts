import path from "node:path";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type {
  CalculateRcRequest,
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
    | "rustHostCalculateRc"
    | "rustHostDispose"
    | "rustHostExportOriginCsv"
    | "rustHostOpen"
    | "rustHostPreviewMeta"
    | "rustHostPreviewRows"
    | "rustHostProcessFile"
    | "rustHostReadCell"
    | "rustHostReadCells"
  >;
  ipcMain: IpcMain;
  runForeground?: <T>(task: () => Promise<T>) => Promise<T>;
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
  InvalidCell: "INVALID_RUST_HOST_CELL",
  InvalidCells: "INVALID_RUST_HOST_CELLS",
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
  runForeground = task => task(),
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
    return runForeground(() => rustService.openFile(request));
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
    return runForeground(() => rustService.previewRows(request));
  };

  const handleRustEnginePreviewMeta = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const record = readObject(payload);
    const request: PreviewMetaRequest = {
      fileId: readString(record?.fileId),
    };
    return runForeground(() => rustService.previewMeta(request));
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
        message: "Invalid Rust host cell request.",
      };
    }

    const request: ReadCellRequest = {
      colIndex,
      fileId: readString(record?.fileId),
      rowIndex,
    };
    return runForeground(() => rustService.readCell(request));
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
        message: "Invalid Rust host cells request.",
      };
    }

    const request: ReadCellsRequest = {
      cells: cells as Array<{ colIndex: number; rowIndex: number }>,
      fileId: readString(record?.fileId),
    };
    return runForeground(() => rustService.readCells(request));
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
    const request: CalculateRcRequest = {
      devices: Array.isArray(record?.devices) ? record.devices : [],
      options: readObject(record?.options) ?? {},
    };
    return rustService.calculateRc(request);
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
    ipcChannels.rustHostOpen,
    handleRustEngineOpen,
  );
  ipcMain.handle(
    ipcChannels.rustHostPreviewMeta,
    handleRustEnginePreviewMeta,
  );
  ipcMain.handle(
    ipcChannels.rustHostPreviewRows,
    handleRustEnginePreviewRows,
  );
  ipcMain.handle(
    ipcChannels.rustHostReadCell,
    handleRustEngineReadCell,
  );
  ipcMain.handle(
    ipcChannels.rustHostReadCells,
    handleRustEngineReadCells,
  );
  ipcMain.handle(
    ipcChannels.rustHostProcessFile,
    handleRustEngineProcessFile,
  );
  ipcMain.handle(
    ipcChannels.rustHostCalculateRc,
    handleRustEngineAnalyzeRc,
  );
  ipcMain.handle(
    ipcChannels.rustHostExportOriginCsv,
    handleRustEngineExportOriginCsv,
  );
  ipcMain.handle(
    ipcChannels.rustHostDispose,
    handleRustEngineDispose,
  );

  return {
    dispose() {
      ipcMain.removeHandler(ipcChannels.rustHostOpen);
      ipcMain.removeHandler(ipcChannels.rustHostPreviewMeta);
      ipcMain.removeHandler(ipcChannels.rustHostPreviewRows);
      ipcMain.removeHandler(ipcChannels.rustHostReadCell);
      ipcMain.removeHandler(ipcChannels.rustHostReadCells);
      ipcMain.removeHandler(ipcChannels.rustHostProcessFile);
      ipcMain.removeHandler(ipcChannels.rustHostCalculateRc);
      ipcMain.removeHandler(ipcChannels.rustHostExportOriginCsv);
      ipcMain.removeHandler(ipcChannels.rustHostDispose);
    },
  };
};
