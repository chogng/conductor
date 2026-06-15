/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import {
  createRcCalculateDevices,
  type RcCalculateRow,
} from "./rcCalculationModel.ts";
import type { RcCalculationBackend } from "src/cs/workbench/services/parameters/common/rcCalculationBackend";

export type RunRcCalculationResult =
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
      return localize("parameters.rc.error.noDevices", "Rc calculation requires at least one device.");
    case "RUST_ENGINE_RC_FAILED":
      return localize("parameters.rc.error.analysisFailed", "Rc calculation failed.");
    default: {
      const message = String(response.message || "").trim();
      return message || localize("parameters.rc.error.analysisFailed", "Rc calculation failed.");
    }
  }
};

export type RunRcCalculationOptions = {
  curveProbeX: number | null;
  rcCalculationBackendService: RcCalculationBackend;
  rows: RcCalculateRow[];
};

export const runRcCalculation = async ({
  curveProbeX,
  rcCalculationBackendService,
  rows,
}: RunRcCalculationOptions): Promise<RunRcCalculationResult> => {
  if (!rcCalculationBackendService.canCalculateRc()) {
    return {
      error: localize("parameters.rc.error.bridgeUnavailable", "Rust Rc calculation bridge is unavailable."),
      ok: false,
    };
  }

  if (!rows.length) {
    return {
      error: localize("parameters.rc.error.noTransferCurves", "No transfer curves are available."),
      ok: false,
    };
  }

  const devices = createRcCalculateDevices(rows);
  if (devices.length < 2) {
    return {
      error: localize("parameters.rc.error.insufficientDevices", "Rc needs at least two valid devices; three or more is recommended."),
      ok: false,
    };
  }

  try {
    const response = await rcCalculationBackendService.calculateRc({
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
        : localize("parameters.rc.error.analysisFailed", "Rc calculation failed."),
      ok: false,
    };
  }
};
