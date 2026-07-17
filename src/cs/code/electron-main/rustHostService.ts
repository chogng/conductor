import fs from "node:fs";
import path from "node:path";
import type {
  IRustWorkerHost,
  RustWorkerCommandHandle,
} from "../../platform/rust/common/rustWorker.js";
import type {
  AnalyzeCalculationRequest,
  CalculateRcRequest,
  CancelStructuredContentRequest,
  ExportOriginCsvRequest,
  IRustHostService,
  ResolveStructuredContentRequest,
  RustHostResponse,
  RustHostRequestOwner,
  RustProcessConfig,
} from "../../platform/rust/common/rustHostProtocol.js";

type ServiceHelpers = {
  createOriginExportTempPath: (fileId: string, csvName: string) => string;
  isRustProcessFileConfigSupported: (config: RustProcessConfig | null) => boolean;
  isSupportedInputPath: (filePath: string) => boolean;
  isSupportedStructuredContentPath: (filePath: string) => boolean;
};

type ServiceOptions = ServiceHelpers & {
  rustWorkerHost: IRustWorkerHost;
};

type StructuredContentRequestRecord = {
  readonly handle: RustWorkerCommandHandle;
  readonly owner: RustHostRequestOwner;
};

const ErrorCode = {
  InvalidPath: "INVALID_RUST_HOST_PATH",
} as const;

const buildSuccess = (
  startedAt: number,
  result: unknown,
  source: "rust" | "rust-pool",
  extras?: Partial<Extract<RustHostResponse, { ok: true }>>,
): Extract<RustHostResponse, { ok: true }> => ({
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
): Extract<RustHostResponse, { ok: false }> => ({
  ok: false,
  code,
  durationMs: typeof startedAt === "number" ? Date.now() - startedAt : undefined,
  message,
});

export class RustHostService implements IRustHostService {
  private readonly structuredContentRequests = new Map<string, StructuredContentRequestRecord>();

  constructor(
    private readonly options: ServiceOptions,
  ) {}

  public async analyzeCalculation(
    request: AnalyzeCalculationRequest,
  ): Promise<RustHostResponse> {
    if (!request.fileId || !request.series.length) {
      return buildFailure(
        "RUST_ENGINE_CALCULATION_MISSING_SERIES",
        "Calculation analysis requires a file and at least one series.",
      );
    }

    const startedAt = Date.now();
    try {
      const result = await this.options.rustWorkerHost.sendProcessingCommand(
        "analyzeSeriesBatch",
        {
          fileId: request.fileId,
          series: request.series,
          sourceFile: request.sourceFile,
        },
        { timeoutMs: 120000 },
      );
      return buildSuccess(startedAt, result, "rust-pool");
    } catch (error) {
      return buildFailure(
        "RUST_ENGINE_CALCULATION_FAILED",
        (error as Error)?.message || "conductor-rs failed to analyze calculation series.",
        startedAt,
      );
    }
  }

  public async calculateRc(request: CalculateRcRequest): Promise<RustHostResponse> {
    if (!request.devices.length) {
      return buildFailure("RUST_ENGINE_RC_MISSING_DEVICES", "Rc calculation requires at least one device.");
    }

    const startedAt = Date.now();
    try {
      const result = await this.options.rustWorkerHost.sendProcessingCommand(
        "calculateRc",
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
        (error as Error)?.message || "conductor-rs failed to calculate Rc.",
        startedAt,
      );
    }
  }

  public async cancelStructuredContent(
    request: CancelStructuredContentRequest,
    owner: RustHostRequestOwner,
  ): Promise<boolean> {
    const requestId = request.requestId.trim();
    const requestKey = createStructuredContentRequestKey(owner, requestId);
    const record = requestKey
      ? this.structuredContentRequests.get(requestKey)
      : undefined;
    if (!record) {
      return false;
    }
    this.structuredContentRequests.delete(requestKey);
    record.handle.cancel();
    return true;
  }

  public cancelStructuredContentOwner(ownerScope: string): void {
    const normalizedOwnerScope = ownerScope.trim();
    if (!normalizedOwnerScope) {
      return;
    }

    for (const [requestKey, record] of this.structuredContentRequests) {
      if (record.owner.scope !== normalizedOwnerScope) {
        continue;
      }
      this.structuredContentRequests.delete(requestKey);
      record.handle.cancel();
    }
  }

  public async exportOriginCsv(request: ExportOriginCsvRequest): Promise<RustHostResponse> {
    const hasRustSeries =
      (request.metricKind === "output" || request.metricKind === "transfer") &&
      request.metricSeries.length > 0;
    if (!request.fileId || !request.inputPath || !this.options.isSupportedInputPath(request.inputPath)) {
      return buildFailure(ErrorCode.InvalidPath, "Invalid file path.");
    }
    if (!this.options.isRustProcessFileConfigSupported(request.config) || (!request.columns.length && !hasRustSeries)) {
      return buildFailure(
        "RUST_ENGINE_EXPORT_UNSUPPORTED_CONFIG",
        "conductor-rs does not support this Origin export plan yet.",
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
      const result = await this.options.rustWorkerHost.sendProcessingCommand(
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
        (error as Error)?.message || "conductor-rs failed to export Origin CSV.",
        startedAt,
      );
    } finally {
      void Promise.allSettled(
        disposeFileIds.map((fileId) => this.options.rustWorkerHost.disposeProcessingFile(fileId)),
      );
    }
  }

  public async resolveStructuredContent(
    request: ResolveStructuredContentRequest,
    owner: RustHostRequestOwner,
  ): Promise<RustHostResponse> {
    const requestId = request.requestId.trim();
    const requestKey = createStructuredContentRequestKey(owner, requestId);
    if (
      !requestKey ||
      !request.inputPath ||
      !this.options.isSupportedStructuredContentPath(request.inputPath)
    ) {
      return buildFailure(ErrorCode.InvalidPath, "Invalid structured-content file path.");
    }

    const startedAt = Date.now();
    if (this.structuredContentRequests.has(requestKey)) {
      return buildFailure(
        "RUST_STRUCTURED_CONTENT_DUPLICATE_REQUEST",
        "Duplicate structured-content request id.",
        startedAt,
      );
    }
    const handle = this.options.rustWorkerHost.startProcessingCommand(
      "resolveStructuredContent",
      {
        fileName: request.fileName || path.basename(request.inputPath),
        path: request.inputPath,
      },
      { timeoutMs: 120000 },
    );
    const record = { handle, owner };
    this.structuredContentRequests.set(requestKey, record);
    try {
      const result = await handle.promise;
      return buildSuccess(startedAt, result, "rust-pool");
    } catch (error) {
      return buildFailure(
        "RUST_STRUCTURED_CONTENT_FAILED",
        (error as Error)?.message || "conductor-rs failed to resolve structured content.",
        startedAt,
      );
    } finally {
      if (this.structuredContentRequests.get(requestKey) === record) {
        this.structuredContentRequests.delete(requestKey);
      }
    }
  }

}

const createStructuredContentRequestKey = (
  owner: RustHostRequestOwner,
  requestId: string,
): string => {
  const ownerId = owner.id.trim();
  const normalizedRequestId = requestId.trim();
  return ownerId && normalizedRequestId
    ? `${ownerId}\u0000${normalizedRequestId}`
    : "";
};
