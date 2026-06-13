/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const IOriginService = createDecorator<IOriginService>("originService");

export const OriginContributionId = "workbench.contrib.origin";
export const OriginExportSettingsViewId = "workbench.origin.exportSettings";

export const OriginCommandId = {
	showExportSettings: "workbench.action.showOriginSettings",
} as const;

export type OriginCommandId = typeof OriginCommandId[keyof typeof OriginCommandId];

export type OriginHealthResult = {
  logPath?: string;
  originExePath?: string;
  [key: string]: unknown;
};

export type OriginCleanupResult = {
  removedTotal?: number;
  [key: string]: unknown;
};

export type OriginCsvExportResult = {
  csvPath?: string;
  message?: string;
  ok?: boolean;
  [key: string]: unknown;
};

export type OriginZipSaveResult = {
  cancelled?: boolean;
  message?: string;
  ok?: boolean;
  zipPath?: string;
  [key: string]: unknown;
};

export type OriginDisplayRange = {
  max: number;
  min: number;
  step?: number | null;
};

export type OriginZipExportResult = {
  canvasCount: number;
  curveCount: number;
  mixedYScales?: boolean;
  mode?: string;
  zipName: string;
};

export interface IOriginService {
  readonly _serviceBrand: undefined;

  canCheckHealth(): boolean;
  canExportCsv(): boolean;
  canManageExePath(): boolean;
  canRunCsv(): boolean;
  canRunRuntimeCleanup(): boolean;
  canSaveZip(): boolean;
  checkHealth(options: { path?: string }): Promise<OriginHealthResult>;
  exportCsv(payload: unknown): Promise<OriginCsvExportResult>;
  getExePath(): Promise<string>;
  pickExePath(): Promise<string>;
  runCsv(payload: unknown): Promise<unknown>;
  runRuntimeCleanup(payload?: unknown): Promise<OriginCleanupResult>;
  saveZip(payload: unknown): Promise<OriginZipSaveResult>;
  setExePath(path: string): Promise<unknown>;
}
