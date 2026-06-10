/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import {
  createRcAnalyzeDevices,
  type RcAnalyzeRow,
} from "./rcAnalysisModel.ts";
import type { RcAnalysisBackend } from "src/cs/workbench/services/parameters/common/rcAnalysisBackend";

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

const getRcErrorMessage = (response: Record<string, unknown>): string => {
  switch (response.code) {
    case "RUST_ENGINE_RC_MISSING_DEVICES":
      return localize("rc_error_no_devices", "Rc analysis requires at least one device.");
    case "RUST_ENGINE_RC_FAILED":
      return localize("rc_error_analysis_failed", "Rc analysis failed.");
    default: {
      const message = String(response.message || "").trim();
      return message || localize("rc_error_analysis_failed", "Rc analysis failed.");
    }
  }
};

export type RunRcAnalysisOptions = {
  curveProbeX: number | null;
  rcAnalysisBackendService: RcAnalysisBackend;
  rows: RcAnalyzeRow[];
};

export const runRcAnalysis = async ({
  curveProbeX,
  rcAnalysisBackendService,
  rows,
}: RunRcAnalysisOptions): Promise<RunRcAnalysisResult> => {
  if (!rcAnalysisBackendService.canAnalyzeRc()) {
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
    const response = await rcAnalysisBackendService.analyzeRc({
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
      throw new Error(getRcErrorMessage(responseRecord));
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
