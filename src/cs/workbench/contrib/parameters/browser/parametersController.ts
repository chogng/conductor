import {
  createRcAnalyzeDevices,
  type RcAnalyzeDevice,
  type RcAnalyzeRow,
} from "./rcAnalysisModel.ts";

type RcAnalyzeImportService = {
  analyzeRc(payload: {
    devices: RcAnalyzeDevice[];
    options: {
      maxGridPoints: number;
      minAbsCurrent: number;
      minDevices: number;
      normalizeByWidth: boolean;
      selectedVg: number | null;
    };
  }): Promise<unknown>;
  canAnalyzeRc(): boolean;
};

type TranslateFn = (key: string) => string;

export type RunRcAnalysisResult =
  | {
      ok: true;
      result: unknown;
    }
  | {
      error: string;
      ok: false;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

export type RunRcAnalysisOptions = {
  curveProbeX: number | null;
  importService: RcAnalyzeImportService;
  rows: RcAnalyzeRow[];
  t: TranslateFn;
};

export const runRcAnalysis = async ({
  curveProbeX,
  importService,
  rows,
  t,
}: RunRcAnalysisOptions): Promise<RunRcAnalysisResult> => {
  if (!importService.canAnalyzeRc()) {
    return {
      error: t("da_rc_error_bridge_unavailable"),
      ok: false,
    };
  }

  if (!rows.length) {
    return {
      error: t("da_rc_error_no_transfer_curves"),
      ok: false,
    };
  }

  const devices = createRcAnalyzeDevices(rows);
  if (devices.length < 2) {
    return {
      error: t("da_rc_error_insufficient_devices"),
      ok: false,
    };
  }

  try {
    const response = await importService.analyzeRc({
      devices,
      options: {
        maxGridPoints: 240,
        minAbsCurrent: 0,
        minDevices: Math.min(3, devices.length),
        normalizeByWidth: true,
        selectedVg: curveProbeX,
      },
    });
    const responseRecord = isRecord(response) ? response : {};
    if (responseRecord.ok !== true) {
      const message = String(responseRecord.message || "").trim();
      throw new Error(message || t("da_rc_error_analysis_failed"));
    }

    return {
      ok: true,
      result: responseRecord.result ?? null,
    };
  } catch (error) {
    return {
      error: error instanceof Error && error.message
        ? error.message
        : t("da_rc_error_analysis_failed"),
      ok: false,
    };
  }
};
