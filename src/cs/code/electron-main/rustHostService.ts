import fs from "node:fs";
import path from "node:path";
import type { IRustWorkerService } from "../../platform/rust/common/rustWorker.js";
import type {
  AnalyzeRcRequest,
  DisposeFileRequest,
  ExportOriginCsvRequest,
  IRustAnalysisService,
  OpenFileRequest,
  PreviewMetaRequest,
  PreviewRowsRequest,
  ProcessFileRequest,
  ReadCellRequest,
  ReadCellsRequest,
  RustAnalysisResponse,
  RustProcessConfig,
} from "../../platform/rust/common/rustAnalysisProtocol.js";

type ServiceHelpers = {
  createOriginExportTempPath: (fileId: string, csvName: string) => string;
  createRustProcessingResultTempDir: (fileId: string) => string;
  hydrateRustProcessingResultRefs: (result: unknown, tempDir?: string | null) => Promise<unknown>;
  isRustProcessFileConfigSupported: (config: RustProcessConfig | null) => boolean;
  isSupportedInputPath: (filePath: string) => boolean;
};

type ServiceOptions = ServiceHelpers & {
  rustWorkerRuntime: IRustWorkerService;
};

const ErrorCode = {
  FileNotFound: "ANALYSIS_FILE_NOT_FOUND",
  InvalidCell: "INVALID_ANALYSIS_CELL",
  InvalidCells: "INVALID_ANALYSIS_CELLS",
  InvalidFileId: "INVALID_ANALYSIS_FILE_ID",
  InvalidPath: "INVALID_ANALYSIS_PATH",
} as const;

const buildSuccess = (
  startedAt: number,
  result: unknown,
  source: "rust" | "rust-pool",
  extras?: Partial<Extract<RustAnalysisResponse, { ok: true }>>,
): Extract<RustAnalysisResponse, { ok: true }> => ({
  ok: true,
  durationMs: Date.now() - startedAt,
  result,
  source,
  ...extras,
});

const buildFailure = (
  code: string,
  message: string,
  startedAt?: number,
): Extract<RustAnalysisResponse, { ok: false }> => ({
  ok: false,
  code,
  durationMs: typeof startedAt === "number" ? Date.now() - startedAt : undefined,
  message,
});

export class RustHostService implements IRustAnalysisService {
  constructor(
    private readonly options: ServiceOptions,
  ) {}

  public async openFile(request: OpenFileRequest): Promise<RustAnalysisResponse> {
    if (!request.fileId || !request.inputPath || !this.options.isSupportedInputPath(request.inputPath)) {
      return buildFailure(ErrorCode.InvalidPath, "Invalid analysis file path.");
    }

    try {
      const stat = fs.statSync(request.inputPath);
      if (!stat.isFile()) {
        return buildFailure(ErrorCode.InvalidPath, "Analysis path is not a file.");
      }
    } catch (error) {
      return buildFailure(
        ErrorCode.FileNotFound,
        (error as Error)?.message || "Analysis file not found.",
      );
    }

    const startedAt = Date.now();
    try {
      const result = await this.options.rustWorkerRuntime.sendCommand("open", {
        fileId: request.fileId,
        fileName: request.fileName || path.basename(request.inputPath),
        path: request.inputPath,
        seedRows: request.seedRows,
      });
      return buildSuccess(startedAt, result, "rust");
    } catch (error) {
      return buildFailure(
        "RUST_ENGINE_OPEN_FAILED",
        (error as Error)?.message || "rs-worker failed to open file.",
        startedAt,
      );
    }
  }

  public async previewRows(request: PreviewRowsRequest): Promise<RustAnalysisResponse> {
    if (!request.fileId) {
      return buildFailure(ErrorCode.InvalidFileId, "Missing file id.");
    }

    const startedAt = Date.now();
    try {
      const result = await this.options.rustWorkerRuntime.sendCommand("previewRows", request);
      return buildSuccess(startedAt, result, "rust");
    } catch (error) {
      return buildFailure(
        "RUST_ENGINE_PREVIEW_ROWS_FAILED",
        (error as Error)?.message || "rs-worker failed to read preview rows.",
        startedAt,
      );
    }
  }

  public async previewMeta(request: PreviewMetaRequest): Promise<RustAnalysisResponse> {
    if (!request.fileId) {
      return buildFailure(ErrorCode.InvalidFileId, "Missing file id.");
    }

    const startedAt = Date.now();
    try {
      const result = await this.options.rustWorkerRuntime.sendCommand("previewMeta", request);
      return buildSuccess(startedAt, result, "rust");
    } catch (error) {
      return buildFailure(
        "RUST_ENGINE_PREVIEW_META_FAILED",
        (error as Error)?.message || "rs-worker failed to read preview metadata.",
        startedAt,
      );
    }
  }

  public async readCell(request: ReadCellRequest): Promise<RustAnalysisResponse> {
    if (!request.fileId) {
      return buildFailure(ErrorCode.InvalidCell, "Invalid analysis cell request.");
    }

    const startedAt = Date.now();
    try {
      const result = await this.options.rustWorkerRuntime.sendCommand("readCell", request);
      return buildSuccess(startedAt, result, "rust");
    } catch (error) {
      return buildFailure(
        "RUST_ENGINE_READ_CELL_FAILED",
        (error as Error)?.message || "rs-worker failed to read cell.",
        startedAt,
      );
    }
  }

  public async readCells(request: ReadCellsRequest): Promise<RustAnalysisResponse> {
    if (!request.fileId || !request.cells.length) {
      return buildFailure(ErrorCode.InvalidCells, "Invalid analysis cells request.");
    }

    const startedAt = Date.now();
    try {
      const result = await this.options.rustWorkerRuntime.sendCommand("readCells", request);
      return buildSuccess(startedAt, result, "rust");
    } catch (error) {
      return buildFailure(
        "RUST_ENGINE_READ_CELLS_FAILED",
        (error as Error)?.message || "rs-worker failed to read cells.",
        startedAt,
      );
    }
  }

  public async processFile(request: ProcessFileRequest): Promise<RustAnalysisResponse> {
    if (!request.fileId || !request.inputPath || !this.options.isSupportedInputPath(request.inputPath)) {
      return buildFailure(ErrorCode.InvalidPath, "Invalid analysis file path.");
    }
    if (!request.auto && !this.options.isRustProcessFileConfigSupported(request.config)) {
      return buildFailure(
        "RUST_ENGINE_PROCESS_UNSUPPORTED_CONFIG",
        "rs-worker does not support this extraction config yet.",
      );
    }

    const startedAt = Date.now();
    const tempDir = this.options.createRustProcessingResultTempDir(request.fileId);
    const calculationCachePath = path.join(tempDir, "calculation-cache.json");
    try {
      const result = await this.options.rustWorkerRuntime.sendProcessingCommand(
        request.auto ? "processFileAuto" : "processFile",
        {
          calculationCachePath,
          config: request.config,
          curveFilterField: request.curveFilterField,
          curveFilterKey: request.curveFilterKey,
          fileId: request.fileId,
          fileName: request.fileName || path.basename(request.inputPath),
          maxPoints: request.maxPoints,
          path: request.inputPath,
        },
      );
      await this.options.hydrateRustProcessingResultRefs(result, tempDir);
      if (result && typeof result === "object" && !Array.isArray(result)) {
        const resultObject = result as {
          autoConfig?: unknown;
          originExportConfig?: unknown;
          originExportSourcePath?: unknown;
        };
        resultObject.originExportSourcePath = request.inputPath;
        resultObject.originExportConfig =
          request.auto && resultObject.autoConfig && typeof resultObject.autoConfig === "object"
            ? resultObject.autoConfig
            : request.config;
      }
      void this.options.rustWorkerRuntime.disposeProcessingFile(request.fileId);
      return buildSuccess(startedAt, result, "rust-pool");
    } catch (error) {
      void this.options.rustWorkerRuntime.disposeProcessingFile(request.fileId);
      void fs.promises.rm(tempDir, { force: true, recursive: true }).catch(() => {});
      return buildFailure(
        "RUST_ENGINE_PROCESS_FAILED",
        (error as Error)?.message || "rs-worker failed to process file.",
        startedAt,
      );
    }
  }

  public async analyzeRc(request: AnalyzeRcRequest): Promise<RustAnalysisResponse> {
    if (!request.devices.length) {
      return buildFailure("RUST_ENGINE_RC_MISSING_DEVICES", "Rc analysis requires at least one device.");
    }

    const startedAt = Date.now();
    try {
      const result = await this.options.rustWorkerRuntime.sendProcessingCommand(
        "analyzeRc",
        {
          rcDevices: request.devices,
          rcOptions: request.options,
        },
        { timeoutMs: 120000 },
      );
      return buildSuccess(startedAt, result, "rust-pool");
    } catch (error) {
      return buildFailure(
        "RUST_ENGINE_RC_FAILED",
        (error as Error)?.message || "rs-worker failed to analyze Rc.",
        startedAt,
      );
    }
  }

  public async exportOriginCsv(request: ExportOriginCsvRequest): Promise<RustAnalysisResponse> {
    const hasRustSeries =
      (request.metricKind === "output" || request.metricKind === "transfer") &&
      request.metricSeries.length > 0;
    if (!request.fileId || !request.inputPath || !this.options.isSupportedInputPath(request.inputPath)) {
      return buildFailure(ErrorCode.InvalidPath, "Invalid analysis file path.");
    }
    if (!this.options.isRustProcessFileConfigSupported(request.config) || (!request.columns.length && !hasRustSeries)) {
      return buildFailure(
        "RUST_ENGINE_EXPORT_UNSUPPORTED_CONFIG",
        "rs-worker does not support this Origin export plan yet.",
      );
    }

    const disposeFileIds = Array.from(
      new Set(
        [
          request.fileId,
          ...((request.sources ?? []).map((source) =>
            typeof source.fileId === "string"
              ? source.fileId.trim()
              : typeof source.file_id === "string"
                ? source.file_id.trim()
                : "",
          )),
        ].filter((value) => value.length > 0),
      ),
    );

    const startedAt = Date.now();
    const outputPath = this.options.createOriginExportTempPath(request.fileId, request.csvName);
    try {
      const result = await this.options.rustWorkerRuntime.sendProcessingCommand(
        "exportOriginCsv",
        {
          columns: request.columns,
          config: request.config,
          fileId: request.fileId,
          fileName: request.fileName || path.basename(request.inputPath),
          maxPoints: request.maxPoints,
          metricKind: request.metricKind,
          metricSeries: request.metricSeries,
          outputPath,
          path: request.inputPath,
          sourceFile: request.sourceFile,
          sources: request.sources,
          xScaleFactor: request.xScaleFactor,
          yScaleFactor: request.yScaleFactor,
          yTransform: request.yTransform,
        },
        { timeoutMs: 120000 },
      );
      return buildSuccess(startedAt, result, "rust-pool", { csvPath: outputPath });
    } catch (error) {
      void fs.promises.rm(path.dirname(outputPath), { force: true, recursive: true }).catch(() => {});
      return buildFailure(
        "RUST_ENGINE_EXPORT_FAILED",
        (error as Error)?.message || "rs-worker failed to export Origin CSV.",
        startedAt,
      );
    } finally {
      void Promise.allSettled(
        disposeFileIds.map((fileId) => this.options.rustWorkerRuntime.disposeProcessingFile(fileId)),
      );
    }
  }

  public async disposeFile(request: DisposeFileRequest): Promise<RustAnalysisResponse> {
    try {
      if (request.clear) {
        await this.options.rustWorkerRuntime.clear();
        return { ok: true, source: "rust" };
      }
      if (request.fileId) {
        const [previewDispose] = await Promise.allSettled([
          this.options.rustWorkerRuntime.disposeFile(request.fileId),
        ]);
        if (previewDispose.status === "rejected") {
          throw previewDispose.reason;
        }
      }
      return { ok: true, source: "rust" };
    } catch (error) {
      return buildFailure(
        "RUST_ENGINE_DISPOSE_FAILED",
        (error as Error)?.message || "rs-worker dispose failed.",
      );
    }
  }
}
