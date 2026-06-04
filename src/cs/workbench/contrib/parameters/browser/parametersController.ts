import { localize } from "src/cs/nls";
import {
  createRcAnalyzeDevices,
  type RcAnalyzeDevice,
  type RcAnalyzeRow,
} from "./rcAnalysisModel.ts";

type RcAnalysisFileService = {
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
  analysisFileService: RcAnalysisFileService;
  rows: RcAnalyzeRow[];
};

export const runRcAnalysis = async ({
  curveProbeX,
  analysisFileService,
  rows,
}: RunRcAnalysisOptions): Promise<RunRcAnalysisResult> => {
  if (!analysisFileService.canAnalyzeRc()) {
    return {
      error: localize("rc_error_bridge_unavailable", "Rust Rc bridge is unavailable."),
      ok: false,
    };
  }

  if (!rows.length) {
    return {
      error: localize("rc_error_no_transfer_curves", "No transfer curves are available."),
      ok: false,
    };
  }

  const devices = createRcAnalyzeDevices(rows);
  if (devices.length < 2) {
    return {
      error: localize("rc_error_insufficient_devices", "Rc needs at least two valid devices; three or more is recommended."),
      ok: false,
    };
  }

  try {
    const response = await analysisFileService.analyzeRc({
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
      throw new Error(message || localize("rc_error_analysis_failed", "Rc analysis failed."));
    }

    return {
      ok: true,
      result: responseRecord.result ?? null,
    };
  } catch (error) {
    return {
      error: error instanceof Error && error.message
        ? error.message
        : localize("rc_error_analysis_failed", "Rc analysis failed."),
      ok: false,
    };
  }
};
