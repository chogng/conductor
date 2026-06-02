import path from "node:path";
import fs from "node:fs";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { IRustWorkerService } from "../../platform/rust/common/rustWorker.js";
import type { workbenchIpcChannels } from "../../workbench/common/ipcChannels.js";

type RustProcessConfig = {
  xSegmentationMode?: unknown;
  yCols?: unknown;
};

type AnalysisRustHelpers = {
  createRustAnalysisOriginExportTempPath: (fileId: string, csvName: string) => string;
  createRustAnalysisResultTempDir: (fileId: string) => string;
  hydrateRustAnalysisResultRefs: (result: unknown, tempDir?: string | null) => Promise<unknown>;
  isRustProcessFileConfigSupported: (config: RustProcessConfig | null) => boolean;
  isSupportedRustAnalysisInputPath: (filePath: string) => boolean;
  normalizeAbsoluteFilePath: (rawPath: unknown) => string;
};

type RegisterAnalysisRustHandlersOptions = AnalysisRustHelpers & {
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
  rustWorkerRuntime: IRustWorkerService;
};

const normalizeAnalysisCellIndex = (value: unknown): number | null => {
  const index = Math.floor(Number(value));
  return Number.isInteger(index) && index >= 0 ? index : null;
};

export const registerAnalysisRustHandlers = ({
  createRustAnalysisOriginExportTempPath,
  createRustAnalysisResultTempDir,
  hydrateRustAnalysisResultRefs,
  ipcChannels,
  ipcMain,
  isRustProcessFileConfigSupported,
  isSupportedRustAnalysisInputPath,
  normalizeAbsoluteFilePath,
  rustWorkerRuntime,
}: RegisterAnalysisRustHandlersOptions): { dispose(): void } => {
  const handleAnalysisRustEngineOpen = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const rawPath = payload && typeof payload === "object" ? (payload as { path?: unknown }).path : "";
    const inputPath = normalizeAbsoluteFilePath(rawPath);
    const fileId =
      payload && typeof payload === "object" && typeof (payload as { fileId?: unknown }).fileId === "string"
        ? (payload as { fileId: string }).fileId.trim()
        : "";
    const fileName =
      payload && typeof payload === "object" && typeof (payload as { fileName?: unknown }).fileName === "string"
        ? (payload as { fileName: string }).fileName.trim()
        : "";
    const seedRows = Math.max(
      0,
      Math.min(5000, Math.floor(Number((payload as { seedRows?: unknown } | undefined)?.seedRows) || 0)),
    );

    if (!fileId || !inputPath || !isSupportedRustAnalysisInputPath(inputPath)) {
      return {
        ok: false,
        code: "INVALID_DEVICE_ANALYSIS_PATH",
        message: "Invalid analysis file path.",
      };
    }

    try {
      const stat = fs.statSync(inputPath);
      if (!stat.isFile()) {
        return {
          ok: false,
          code: "INVALID_DEVICE_ANALYSIS_PATH",
          message: "Analysis path is not a file.",
        };
      }
    } catch (error) {
      return {
        ok: false,
        code: "DEVICE_ANALYSIS_FILE_NOT_FOUND",
        message: (error as Error)?.message || "Analysis file not found.",
      };
    }

    const startedAt = Date.now();
    try {
      const result = await rustWorkerRuntime.sendCommand("open", {
        fileId,
        fileName: fileName || path.basename(inputPath),
        path: inputPath,
        seedRows,
      });
      return {
        ok: true,
        durationMs: Date.now() - startedAt,
        result,
        source: "rust",
      };
    } catch (error) {
      return {
        ok: false,
        code: "RUST_ENGINE_OPEN_FAILED",
        durationMs: Date.now() - startedAt,
        message: (error as Error)?.message || "rs-worker failed to open file.",
      };
    }
  };

  const handleAnalysisRustEnginePreviewRows = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const fileId =
      payload && typeof payload === "object" && typeof (payload as { fileId?: unknown }).fileId === "string"
        ? (payload as { fileId: string }).fileId.trim()
        : "";
    const startRow = Math.max(0, Math.floor(Number((payload as { startRow?: unknown } | undefined)?.startRow) || 0));
    const endRow = Math.max(
      startRow,
      Math.floor(Number((payload as { endRow?: unknown } | undefined)?.endRow) || startRow),
    );

    if (!fileId) {
      return {
        ok: false,
        code: "INVALID_DEVICE_ANALYSIS_FILE_ID",
        message: "Missing file id.",
      };
    }

    const startedAt = Date.now();
    try {
      const result = await rustWorkerRuntime.sendCommand("previewRows", {
        endRow,
        fileId,
        startRow,
      });
      return {
        ok: true,
        durationMs: Date.now() - startedAt,
        result,
        source: "rust",
      };
    } catch (error) {
      return {
        ok: false,
        code: "RUST_ENGINE_PREVIEW_ROWS_FAILED",
        durationMs: Date.now() - startedAt,
        message: (error as Error)?.message || "rs-worker failed to read preview rows.",
      };
    }
  };

  const handleAnalysisRustEnginePreviewMeta = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const fileId =
      payload && typeof payload === "object" && typeof (payload as { fileId?: unknown }).fileId === "string"
        ? (payload as { fileId: string }).fileId.trim()
        : "";

    if (!fileId) {
      return {
        ok: false,
        code: "INVALID_DEVICE_ANALYSIS_FILE_ID",
        message: "Missing file id.",
      };
    }

    const startedAt = Date.now();
    try {
      const result = await rustWorkerRuntime.sendCommand("previewMeta", {
        fileId,
      });
      return {
        ok: true,
        durationMs: Date.now() - startedAt,
        result,
        source: "rust",
      };
    } catch (error) {
      return {
        ok: false,
        code: "RUST_ENGINE_PREVIEW_META_FAILED",
        durationMs: Date.now() - startedAt,
        message: (error as Error)?.message || "rs-worker failed to read preview metadata.",
      };
    }
  };

  const handleAnalysisRustEngineReadCell = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const fileId =
      payload && typeof payload === "object" && typeof (payload as { fileId?: unknown }).fileId === "string"
        ? (payload as { fileId: string }).fileId.trim()
        : "";
    const rowIndex = normalizeAnalysisCellIndex((payload as { rowIndex?: unknown } | undefined)?.rowIndex);
    const colIndex = normalizeAnalysisCellIndex((payload as { colIndex?: unknown } | undefined)?.colIndex);

    if (!fileId || rowIndex === null || colIndex === null) {
      return {
        ok: false,
        code: "INVALID_DEVICE_ANALYSIS_CELL",
        message: "Invalid analysis cell request.",
      };
    }

    const startedAt = Date.now();
    try {
      const result = await rustWorkerRuntime.sendCommand("readCell", {
        colIndex,
        fileId,
        rowIndex,
      });
      return {
        ok: true,
        durationMs: Date.now() - startedAt,
        result,
        source: "rust",
      };
    } catch (error) {
      return {
        ok: false,
        code: "RUST_ENGINE_READ_CELL_FAILED",
        durationMs: Date.now() - startedAt,
        message: (error as Error)?.message || "rs-worker failed to read cell.",
      };
    }
  };

  const handleAnalysisRustEngineReadCells = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const fileId =
      payload && typeof payload === "object" && typeof (payload as { fileId?: unknown }).fileId === "string"
        ? (payload as { fileId: string }).fileId.trim()
        : "";
    const rawCells = Array.isArray((payload as { cells?: unknown } | undefined)?.cells)
      ? (payload as { cells: Array<{ colIndex?: unknown; rowIndex?: unknown }> }).cells
      : [];
    const cells = rawCells
      .map((cell) => ({
        colIndex: normalizeAnalysisCellIndex(cell?.colIndex),
        rowIndex: normalizeAnalysisCellIndex(cell?.rowIndex),
      }))
      .filter((cell) => cell.rowIndex !== null && cell.colIndex !== null)
      .slice(0, 5000);

    if (!fileId || !cells.length || cells.length !== rawCells.length) {
      return {
        ok: false,
        code: "INVALID_DEVICE_ANALYSIS_CELLS",
        message: "Invalid analysis cells request.",
      };
    }

    const startedAt = Date.now();
    try {
      const result = await rustWorkerRuntime.sendCommand("readCells", {
        cells,
        fileId,
      });
      return {
        ok: true,
        durationMs: Date.now() - startedAt,
        result,
        source: "rust",
      };
    } catch (error) {
      return {
        ok: false,
        code: "RUST_ENGINE_READ_CELLS_FAILED",
        durationMs: Date.now() - startedAt,
        message: (error as Error)?.message || "rs-worker failed to read cells.",
      };
    }
  };

  const handleAnalysisRustEngineInferAutoExtraction = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const rawPath = payload && typeof payload === "object" ? (payload as { path?: unknown }).path : "";
    const inputPath = normalizeAbsoluteFilePath(rawPath);
    const fileId =
      payload && typeof payload === "object" && typeof (payload as { fileId?: unknown }).fileId === "string"
        ? (payload as { fileId: string }).fileId.trim()
        : "";
    const fileName =
      payload && typeof payload === "object" && typeof (payload as { fileName?: unknown }).fileName === "string"
        ? (payload as { fileName: string }).fileName.trim()
        : "";

    if (!fileId || !inputPath || !isSupportedRustAnalysisInputPath(inputPath)) {
      return {
        ok: false,
        code: "INVALID_DEVICE_ANALYSIS_PATH",
        message: "Invalid analysis file path.",
      };
    }

    const startedAt = Date.now();
    try {
      const result = await rustWorkerRuntime.sendCommand("inferAutoExtraction", {
        fileId,
        fileName: fileName || path.basename(inputPath),
        path: inputPath,
      });
      return {
        ok: true,
        durationMs: Date.now() - startedAt,
        result,
        source: "rust",
      };
    } catch (error) {
      return {
        ok: false,
        code: "RUST_ENGINE_INFER_AUTO_EXTRACTION_FAILED",
        durationMs: Date.now() - startedAt,
        message: (error as Error)?.message || "rs-worker failed to infer auto extraction.",
      };
    }
  };

  const handleAnalysisRustEngineProcessFile = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const rawPath = payload && typeof payload === "object" ? (payload as { path?: unknown }).path : "";
    const inputPath = normalizeAbsoluteFilePath(rawPath);
    const fileId =
      payload && typeof payload === "object" && typeof (payload as { fileId?: unknown }).fileId === "string"
        ? (payload as { fileId: string }).fileId.trim()
        : "";
    const fileName =
      payload && typeof payload === "object" && typeof (payload as { fileName?: unknown }).fileName === "string"
        ? (payload as { fileName: string }).fileName.trim()
        : "";
    const config =
      payload && typeof payload === "object" && typeof (payload as { config?: unknown }).config === "object" &&
      !Array.isArray((payload as { config?: unknown }).config)
        ? ((payload as { config: RustProcessConfig }).config)
        : null;
    const maxPoints = Math.max(2, Math.floor(Number((payload as { maxPoints?: unknown } | undefined)?.maxPoints) || 600));
    const auto = (payload as { auto?: unknown } | undefined)?.auto === true;

    if (!fileId || !inputPath || !isSupportedRustAnalysisInputPath(inputPath)) {
      return {
        ok: false,
        code: "INVALID_DEVICE_ANALYSIS_PATH",
        message: "Invalid analysis file path.",
      };
    }
    if (!auto && !isRustProcessFileConfigSupported(config)) {
      return {
        ok: false,
        code: "RUST_ENGINE_PROCESS_UNSUPPORTED_CONFIG",
        message: "rs-worker does not support this extraction config yet.",
      };
    }

    const startedAt = Date.now();
    const tempDir = createRustAnalysisResultTempDir(fileId);
    const analysisCachePath = path.join(tempDir, "analysis-cache.json");
    try {
      const result = await rustWorkerRuntime.sendProcessingCommand(
        auto ? "processFileAuto" : "processFile",
        {
          analysisCachePath,
          config,
          curveFilterField:
            typeof (payload as { curveFilterField?: unknown } | undefined)?.curveFilterField === "string"
              ? (payload as { curveFilterField: string }).curveFilterField
              : null,
          curveFilterKey:
            typeof (payload as { curveFilterKey?: unknown } | undefined)?.curveFilterKey === "string"
              ? (payload as { curveFilterKey: string }).curveFilterKey
              : null,
          fileId,
          fileName: fileName || path.basename(inputPath),
          maxPoints,
          path: inputPath,
        },
      );
      await hydrateRustAnalysisResultRefs(result, tempDir);
      if (result && typeof result === "object" && !Array.isArray(result)) {
        const resultObject = result as {
          autoConfig?: unknown;
          originExportConfig?: unknown;
          originExportSourcePath?: unknown;
        };
        resultObject.originExportSourcePath = inputPath;
        resultObject.originExportConfig =
          auto && resultObject.autoConfig && typeof resultObject.autoConfig === "object"
            ? resultObject.autoConfig
            : config;
      }
      void rustWorkerRuntime.disposeProcessingFile(fileId);
      return {
        ok: true,
        durationMs: Date.now() - startedAt,
        result,
        source: "rust-pool",
      };
    } catch (error) {
      void rustWorkerRuntime.disposeProcessingFile(fileId);
      void fs.promises.rm(tempDir, { force: true, recursive: true }).catch(() => {});
      return {
        ok: false,
        code: "RUST_ENGINE_PROCESS_FAILED",
        durationMs: Date.now() - startedAt,
        message: (error as Error)?.message || "rs-worker failed to process file.",
      };
    }
  };

  const handleAnalysisRustEngineAnalyzeRc = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const devices = Array.isArray((payload as { devices?: unknown } | undefined)?.devices)
      ? (payload as { devices: unknown[] }).devices
      : [];
    const options =
      payload && typeof payload === "object" && typeof (payload as { options?: unknown }).options === "object" &&
      !Array.isArray((payload as { options?: unknown }).options)
        ? (payload as { options: Record<string, unknown> }).options
        : {};

    if (!devices.length) {
      return {
        ok: false,
        code: "RUST_ENGINE_RC_MISSING_DEVICES",
        message: "Rc analysis requires at least one device.",
      };
    }

    const startedAt = Date.now();
    try {
      const result = await rustWorkerRuntime.sendProcessingCommand(
        "analyzeRc",
        {
          rcDevices: devices,
          rcOptions: options,
        },
        { timeoutMs: 120000 },
      );
      return {
        ok: true,
        durationMs: Date.now() - startedAt,
        result,
        source: "rust-pool",
      };
    } catch (error) {
      return {
        ok: false,
        code: "RUST_ENGINE_RC_FAILED",
        durationMs: Date.now() - startedAt,
        message: (error as Error)?.message || "rs-worker failed to analyze Rc.",
      };
    }
  };

  const handleAnalysisRustEngineExportOriginCsv = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const rawPath = payload && typeof payload === "object" ? (payload as { path?: unknown }).path : "";
    const inputPath = normalizeAbsoluteFilePath(rawPath);
    const fileId =
      payload && typeof payload === "object" && typeof (payload as { fileId?: unknown }).fileId === "string"
        ? (payload as { fileId: string }).fileId.trim()
        : "";
    const fileName =
      payload && typeof payload === "object" && typeof (payload as { fileName?: unknown }).fileName === "string"
        ? (payload as { fileName: string }).fileName.trim()
        : "";
    const config =
      payload && typeof payload === "object" && typeof (payload as { config?: unknown }).config === "object" &&
      !Array.isArray((payload as { config?: unknown }).config)
        ? ((payload as { config: RustProcessConfig }).config)
        : null;
    const csvName =
      typeof (payload as { csvName?: unknown } | undefined)?.csvName === "string" &&
      (payload as { csvName: string }).csvName.trim()
        ? (payload as { csvName: string }).csvName.trim()
        : "device_analysis_origin.csv";
    const columns = Array.isArray((payload as { columns?: unknown } | undefined)?.columns)
      ? (payload as { columns: unknown[] }).columns
      : [];
    const metricKind =
      typeof (payload as { metricKind?: unknown } | undefined)?.metricKind === "string"
        ? (payload as { metricKind: string }).metricKind.trim()
        : "";
    const metricSeries = Array.isArray((payload as { metricSeries?: unknown } | undefined)?.metricSeries)
      ? (payload as { metricSeries: unknown[] }).metricSeries
      : [];
    const sourceFile =
      payload &&
      typeof payload === "object" &&
      typeof (payload as { sourceFile?: unknown }).sourceFile === "object" &&
      !Array.isArray((payload as { sourceFile?: unknown }).sourceFile)
        ? (payload as { sourceFile: Record<string, unknown> }).sourceFile
        : undefined;
    const sources = Array.isArray((payload as { sources?: unknown } | undefined)?.sources)
      ? (payload as { sources: Array<Record<string, unknown>> }).sources
      : undefined;
    const disposeFileIds = Array.from(
      new Set(
        [
          fileId,
          ...(Array.isArray(sources)
            ? sources.map((source) =>
                source && typeof source === "object"
                  ? typeof source.fileId === "string"
                    ? source.fileId.trim()
                    : typeof source.file_id === "string"
                      ? source.file_id.trim()
                      : ""
                  : "",
              )
            : []),
        ].filter((value) => typeof value === "string" && value.length > 0),
      ),
    );

    if (!fileId || !inputPath || !isSupportedRustAnalysisInputPath(inputPath)) {
      return {
        ok: false,
        code: "INVALID_DEVICE_ANALYSIS_PATH",
        message: "Invalid analysis file path.",
      };
    }
    if (
      !isRustProcessFileConfigSupported(config) ||
      (!columns.length &&
        !((metricKind === "output" || metricKind === "transfer") && metricSeries.length))
    ) {
      return {
        ok: false,
        code: "RUST_ENGINE_EXPORT_UNSUPPORTED_CONFIG",
        message: "rs-worker does not support this Origin export plan yet.",
      };
    }

    const startedAt = Date.now();
    const outputPath = createRustAnalysisOriginExportTempPath(fileId, csvName);
    try {
      const result = await rustWorkerRuntime.sendProcessingCommand(
        "exportOriginCsv",
        {
          columns,
          config,
          fileId,
          fileName: fileName || path.basename(inputPath),
          maxPoints: (payload as { maxPoints?: unknown } | undefined)?.maxPoints,
          metricKind,
          metricSeries,
          outputPath,
          path: inputPath,
          sourceFile,
          sources,
          xScaleFactor: (payload as { xScaleFactor?: unknown } | undefined)?.xScaleFactor,
          yScaleFactor: (payload as { yScaleFactor?: unknown } | undefined)?.yScaleFactor,
          yTransform: (payload as { yTransform?: unknown } | undefined)?.yTransform,
        },
        { timeoutMs: 120000 },
      );
      return {
        ok: true,
        csvPath: outputPath,
        durationMs: Date.now() - startedAt,
        result,
        source: "rust-pool",
      };
    } catch (error) {
      void fs.promises.rm(path.dirname(outputPath), { force: true, recursive: true }).catch(() => {});
      return {
        ok: false,
        code: "RUST_ENGINE_EXPORT_FAILED",
        durationMs: Date.now() - startedAt,
        message: (error as Error)?.message || "rs-worker failed to export Origin CSV.",
      };
    } finally {
      void Promise.allSettled(
        disposeFileIds.map((cachedFileId) =>
          rustWorkerRuntime.disposeProcessingFile(cachedFileId),
        ),
      );
    }
  };

  const handleAnalysisRustEngineDispose = async (
    _event: IpcMainInvokeEvent,
    payload: unknown,
  ) => {
    const fileId =
      payload && typeof payload === "object" && typeof (payload as { fileId?: unknown }).fileId === "string"
        ? (payload as { fileId: string }).fileId.trim()
        : "";

    try {
      if ((payload as { clear?: unknown } | undefined)?.clear === true) {
        await rustWorkerRuntime.clear();
        return { ok: true, source: "rust" };
      }
      if (fileId) {
        const [previewDispose] = await Promise.allSettled([
          rustWorkerRuntime.disposeFile(fileId),
        ]);
        if (previewDispose.status === "rejected") {
          throw previewDispose.reason;
        }
      }
      return { ok: true, source: "rust" };
    } catch (error) {
      return {
        ok: false,
        code: "RUST_ENGINE_DISPOSE_FAILED",
        message: (error as Error)?.message || "rs-worker dispose failed.",
      };
    }
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
