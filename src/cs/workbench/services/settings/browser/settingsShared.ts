/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { originService } from "src/cs/workbench/services/origin/browser/originService";
import type {
  ConductorSettings,
  OriginCleanupResult,
  OriginHealthResult,
} from "src/cs/workbench/services/settings/common/settings";

export type OriginBridge = {
  checkOriginHealth?: (options: { path?: string }) => Promise<OriginHealthResult>;
  getOriginExePath: () => Promise<string>;
  pickOriginExePath: () => Promise<string>;
  runOriginRuntimeCleanup?: () => Promise<OriginCleanupResult>;
};

declare global {
  interface Window {
    __CONDUCTOR_INITIAL_SETTINGS__?: Record<string, unknown> | null;
  }
}

export const ORIGIN_CLEANUP_DEFAULTS = {
  enabled: true,
  keepSuccessJobs: 1,
  failedRetentionDays: 7,
};

export const ORIGIN_EXE_PATH_LOAD_TIMEOUT_MS = 10000;

export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "";

export const isObjectRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

export const toConductorSettings = (
  value: unknown,
): ConductorSettings | null => (isObjectRecord(value) ? value : null);

export const getInitialSettingsSnapshot =
  (): ConductorSettings | null => {
    if (typeof window === "undefined") return null;

    const settings = window.__CONDUCTOR_INITIAL_SETTINGS__;
    return isObjectRecord(settings)
      ? (settings as ConductorSettings)
      : null;
  };

export const normalizeTrimmedString = (value: unknown): string =>
  typeof value === "string" && value.trim() ? value.trim() : "";

export const normalizeBoundedInt = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.floor(num);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
};

export const buildOriginLogMessage = (
  baseMessage: string,
  logPath: unknown,
): string => {
  const normalizedLogPath = normalizeTrimmedString(logPath);
  return normalizedLogPath
    ? `${baseMessage} ${localize("origin.error.logPath", "Log: {path}", {
        path: normalizedLogPath,
      })}`
    : baseMessage;
};

export const getOriginExePathWithTimeout = async (
  bridge: OriginBridge,
): Promise<string> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<string>([
      bridge.getOriginExePath(),
      new Promise<string>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Origin executable path load timed out."));
        }, ORIGIN_EXE_PATH_LOAD_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export const getDesktopOriginBridge = (): OriginBridge | null => {
  if (typeof window === "undefined") return null;

  if (!originService.canManageExePath()) return null;

  return {
    checkOriginHealth:
      originService.canCheckHealth()
        ? (options) => originService.checkHealth(options)
        : undefined,
    getOriginExePath: () => originService.getExePath(),
    pickOriginExePath: () => originService.pickExePath(),
    runOriginRuntimeCleanup:
      originService.canRunRuntimeCleanup()
        ? () => originService.runRuntimeCleanup()
        : undefined,
  };
};
