import path from "node:path";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type {
  AnalyzeCalculationRequest,
  CalculateRcRequest,
  ExportOriginCsvRequest,
  IRustHostService,
  ResolveStructuredContentRequest,
  RustProcessConfig,
} from "../../platform/rust/common/rustHostProtocol.js";
import type { workbenchIpcChannels } from "../../workbench/common/ipcChannels.js";

type RegisterRustHandlersOptions = {
  ipcChannels: Pick<
    typeof workbenchIpcChannels,
    | "rustHostAnalyzeCalculation"
    | "rustHostCalculateRc"
    | "rustHostExportOriginCsv"
    | "rustHostResolveStructuredContent"
  >;
  ipcMain: IpcMain;
  runForeground?: <T>(task: () => Promise<T>) => Promise<T>;
  rustService: IRustHostService;
};

const readString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const readObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

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

  const handleRustAnalyzeCalculation = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const record = readObject(payload);
    const request: AnalyzeCalculationRequest = {
      fileId: readString(record?.fileId),
      series: Array.isArray(record?.series) ? record.series : [],
      sourceFile: readObject(record?.sourceFile) ?? undefined,
    };
    return runForeground(() => rustService.analyzeCalculation(request));
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

  const handleRustResolveStructuredContent = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const record = readObject(payload);
    const request: ResolveStructuredContentRequest = {
      fileName: readString(record?.fileName),
      inputPath: normalizeAbsoluteFilePath(record?.path),
    };
    return runForeground(() => rustService.resolveStructuredContent(request));
  };

  ipcMain.handle(
    ipcChannels.rustHostAnalyzeCalculation,
    handleRustAnalyzeCalculation,
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
    ipcChannels.rustHostResolveStructuredContent,
    handleRustResolveStructuredContent,
  );
  return {
    dispose() {
      ipcMain.removeHandler(ipcChannels.rustHostAnalyzeCalculation);
      ipcMain.removeHandler(ipcChannels.rustHostCalculateRc);
      ipcMain.removeHandler(ipcChannels.rustHostExportOriginCsv);
      ipcMain.removeHandler(ipcChannels.rustHostResolveStructuredContent);
    },
  };
};
