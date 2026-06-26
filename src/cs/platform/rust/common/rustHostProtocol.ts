export type RustProcessConfig = {
  xSegmentationMode?: unknown;
  yCols?: unknown;
};

export type RustHostResultSource = "rust" | "rust-pool";

export type RustHostResponse =
  | {
      ok: true;
      durationMs?: number;
      result?: unknown;
      source: RustHostResultSource;
      csvPath?: string;
    }
  | {
      ok: false;
      code: string;
      durationMs?: number;
      message: string;
    };

export type CalculateRcRequest = {
  devices: unknown[];
  options: Record<string, unknown>;
};

export type ExportOriginCsvRequest = {
  columns: unknown[];
  config: RustProcessConfig | null;
  csvName: string;
  fileId: string;
  fileName: string;
  inputPath: string;
  maxPoints?: unknown;
  metricKind: string;
  metricSeries: unknown[];
  sourceFile?: Record<string, unknown>;
  sources?: Array<Record<string, unknown>>;
  xScaleFactor?: unknown;
  yScaleFactor?: unknown;
  yTransform?: unknown;
};

export interface IRustHostService {
  calculateRc(request: CalculateRcRequest): Promise<RustHostResponse>;
  exportOriginCsv(request: ExportOriginCsvRequest): Promise<RustHostResponse>;
}
