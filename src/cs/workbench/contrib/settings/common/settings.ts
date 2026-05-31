import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { LooseTranslateFn as TranslateFn } from "src/cs/workbench/common/deviceAnalysis/translateTypes";
import type {
  AnalysisSettings,
  OriginCleanupResult,
  OriginHealthResult,
  PersistencePathInfo,
} from "src/cs/workbench/contrib/settings/settingsShared";

export const SettingsContributionId = "workbench.contrib.settings";

export const SettingsViewId = "workbench.settings";

export const ISettingsService = createDecorator<ISettingsService>("settingsService");

export type SettingsServiceOptions = {
  handleUpdateAnalysisSettings: (
    updates: unknown,
  ) => Promise<AnalysisSettings | null>;
  isWindowsDesktopShell: boolean;
  mergeAnalysisSettings: (nextSettings: AnalysisSettings | null) => void;
  t: TranslateFn;
};

export interface ISettingsService {
  readonly _serviceBrand: undefined;

  canCheckOriginHealth(): boolean;
  canManageOrigin(): boolean;
  canRunOriginCleanup(): boolean;
  checkOriginHealth(path: string): Promise<OriginHealthResult>;
  chooseOriginExePath(): Promise<string>;
  choosePersistencePath(): Promise<PersistencePathInfo | null>;
  errorMessage(error: unknown): string;
  formatOriginError(error: unknown): string;
  getOriginExePath(): Promise<string>;
  getPersistencePath(): Promise<PersistencePathInfo | null>;
  runOriginCleanup(): Promise<OriginCleanupResult>;
  update(options: SettingsServiceOptions): void;
  updateSettings(updates: unknown): Promise<AnalysisSettings | null>;
}
