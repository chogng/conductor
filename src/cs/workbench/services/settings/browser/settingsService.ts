/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import {
  isLanguagePreference,
} from "src/cs/base/common/platform";
import {
  ConfigurationTarget,
  IConfigurationService,
} from "src/cs/platform/configuration/common/configuration";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { formatOriginBridgeError } from "src/cs/workbench/services/export/common/originBridgeError";
import {
  normalizeOriginPlotOptions,
  type OriginPlotOptions,
} from "src/cs/workbench/services/origin/common/originPlotOptions";
import {
  getDesktopOriginBridge,
  getErrorMessage,
  getInitialSettingsSnapshot,
  getOriginExePathWithTimeout,
  isObjectRecord,
  normalizeTrimmedString,
  toConductorSettings,
} from "src/cs/workbench/services/settings/browser/settingsShared";
import {
  CONDUCTOR_CONFIGURATION_KEYS,
  normalizeConductorSettings as normalizePersistedConductorSettings,
} from "src/cs/platform/configuration/common/configurationRegistry";
import {
  getOriginOpenPlotOptions,
  ISettingsService,
  type ConductorSettings,
  type OriginCleanupResult,
  type OriginHealthResult,
  type OriginSettingsViewInput,
  type SettingsServiceOptions,
  type SettingsPersistence,
  type SettingsViewInput,
} from "src/cs/workbench/services/settings/common/settings";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import { normalizePlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";

const defaultOptions: SettingsServiceOptions = {
  appUpdateSettings: {
    currentVersion: null,
    isAvailable: false,
  },
  isWindowsDesktopShell: false,
  language: "system",
  theme: "system",
};

export class BrowserSettingsService extends Disposable implements ISettingsService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeConductorSettingsEmitter =
    this._register(new Emitter<ConductorSettings | null>());
  public readonly onDidChangeConductorSettings =
    this.onDidChangeConductorSettingsEmitter.event;
  private readonly onDidChangeOriginSettingsViewInputEmitter =
    this._register(new Emitter<void>());
  public readonly onDidChangeOriginSettingsViewInput =
    this.onDidChangeOriginSettingsViewInputEmitter.event;
  private readonly onDidChangeSettingsViewInputEmitter =
    this._register(new Emitter<void>());
  public readonly onDidChangeSettingsViewInput =
    this.onDidChangeSettingsViewInputEmitter.event;

  private options: SettingsServiceOptions = defaultOptions;
  private conductorSettings: ConductorSettings | null;
  private conductorSettingsLoaded: boolean;
  private disposed = false;
  private loadingSettings = false;
  private originSettingsViewInput: OriginSettingsViewInput;
  private settingsViewInput: SettingsViewInput | null = null;

  constructor(
    @IConfigurationService private readonly configurationService: IConfigurationService,
  ) {
    super();

    this.conductorSettings = getInitialSettingsSnapshot();
    this.conductorSettingsLoaded = Boolean(this.conductorSettings);
    this.originSettingsViewInput = this.createOriginSettingsViewInput();
    this.settingsViewInput = this.createSettingsViewInput();
    this._register(this.configurationService.onDidChangeConfiguration(event => {
      if (
        CONDUCTOR_CONFIGURATION_KEYS.some(key =>
          event.affectsConfiguration(key),
        )
      ) {
        void this.loadSettings();
      }
    }));
  }

  public override dispose(): void {
    this.disposed = true;
    super.dispose();
  }

  public update(options: SettingsServiceOptions): void {
    this.options = options;
    this.publishSettingsViewInput();
    this.publishOriginSettingsViewInput();

    if (!this.conductorSettingsLoaded) {
      void this.loadSettings();
    }
  }

  public canManageOrigin(): boolean {
    return this.options.isWindowsDesktopShell && Boolean(getDesktopOriginBridge());
  }

  public canCheckOriginHealth(): boolean {
    const bridge = getDesktopOriginBridge();
    return this.options.isWindowsDesktopShell && typeof bridge?.checkOriginHealth === "function";
  }

  public canRunOriginCleanup(): boolean {
    const bridge = getDesktopOriginBridge();
    return this.options.isWindowsDesktopShell && typeof bridge?.runOriginRuntimeCleanup === "function";
  }

  public async getOriginExePath(): Promise<string> {
    const bridge = getDesktopOriginBridge();
    if (!this.options.isWindowsDesktopShell || !bridge) {
      return "";
    }

    return normalizeTrimmedString(await getOriginExePathWithTimeout(bridge));
  }

  public getOriginSettingsViewInput(): OriginSettingsViewInput {
    return this.originSettingsViewInput;
  }

  public getSettingsViewInput(): SettingsViewInput | null {
    return this.settingsViewInput;
  }

  public getConductorSettings(): ConductorSettings | null {
    return this.conductorSettings;
  }

  public async chooseOriginExePath(): Promise<string> {
    const bridge = getDesktopOriginBridge();
    if (!bridge) {
      return "";
    }

    const nextPath = normalizeTrimmedString(await bridge.pickOriginExePath());
    if (nextPath) {
      this.mergeConductorSettings({ originExePath: nextPath });
    }
    return nextPath;
  }

  public async checkOriginHealth(path: string): Promise<OriginHealthResult> {
    const bridge = getDesktopOriginBridge();
    if (!bridge || typeof bridge.checkOriginHealth !== "function") {
      throw new Error("Origin health check is unavailable.");
    }

    const result = await bridge.checkOriginHealth({ path: path || undefined });
    const nextPath = normalizeTrimmedString(result?.originExePath);
    if (nextPath) {
      this.mergeConductorSettings({ originExePath: nextPath });
    }
    return result;
  }

  public async runOriginCleanup(): Promise<OriginCleanupResult> {
    const bridge = getDesktopOriginBridge();
    if (!bridge || typeof bridge.runOriginRuntimeCleanup !== "function") {
      throw new Error("Origin runtime cleanup is unavailable.");
    }

    return bridge.runOriginRuntimeCleanup();
  }

  public async updateSettings(updates: unknown): Promise<ConductorSettings | null> {
    const patch = isObjectRecord(updates) ? updates : null;
    if (!patch) {
      return this.getConductorSettings();
    }

    const persisted = toConductorSettings(
      await this.getSettingsPersistence().updateSettings(patch),
    );
    this.mergeConductorSettings(persisted ?? patch);
    return this.getConductorSettings();
  }

  public mergeConductorSettings(nextSettings: ConductorSettings | null): void {
    if (!nextSettings) {
      return;
    }

    this.setConductorSettings({
      ...(this.conductorSettings ?? {}),
      ...nextSettings,
    }, true);
  }

  public async updateOriginPlotOptions(
    updates: Partial<OriginPlotOptions>,
  ): Promise<ConductorSettings | null> {
    if (!updates || typeof updates !== "object") {
      return this.getConductorSettings();
    }

    const currentOptions = getOriginOpenPlotOptions(this.getConductorSettings());
    const nextOptions = normalizeOriginPlotOptions({
      ...currentOptions,
      ...updates,
    }, currentOptions);
    const settingsUpdates: Record<string, unknown> = {};
    if (updates.type !== undefined) {
      settingsUpdates.originPlotTypeDefault = nextOptions.type;
    }
    if (updates.lineWidth !== undefined) {
      settingsUpdates.originPlotLineWidthDefault = nextOptions.lineWidth;
    }
    if (updates.symbolShape !== undefined) {
      settingsUpdates.originPlotSymbolShapeDefault = nextOptions.symbolShape;
    }
    if (updates.legendFontSize !== undefined) {
      settingsUpdates.originPlotLegendFontSizeDefault = nextOptions.legendFontSize;
    }
    if (updates.command !== undefined) {
      settingsUpdates.originPlotCommandDefault = nextOptions.command;
    }
    if (updates.postCommands !== undefined) {
      settingsUpdates.originPlotPostCommandsDefault = nextOptions.postCommands;
    }
    if (updates.xyPairs !== undefined) {
      settingsUpdates.originPlotXyPairsDefault = nextOptions.xyPairs;
    }

    if (Object.keys(settingsUpdates).length === 0) {
      return this.getConductorSettings();
    }

    return this.updateSettings(settingsUpdates);
  }

  public async updatePlotAxisSettings(
    updates: Record<string, unknown>,
  ): Promise<ConductorSettings | null> {
    if (!updates || typeof updates !== "object") {
      return this.getConductorSettings();
    }
    if (Object.keys(updates).length === 0) {
      return this.getConductorSettings();
    }

    const currentAxisSettings = normalizePlotAxisSettings(this.getConductorSettings()?.plotAxisSettings);
    const nextAxisSettings = normalizePlotAxisSettings({
      ...currentAxisSettings,
      ...updates,
    }, currentAxisSettings);

    return this.updateSettings({
      plotAxisSettings: nextAxisSettings,
    });
  }

  public formatOriginError(error: unknown): string {
    const detail = formatOriginBridgeError(error);
    if (detail.code === "ORIGIN_EXE_REQUIRED") {
      return localize("origin.executable.required", "Please select Origin executable path first.");
    }

    return detail.messageText;
  }

  public errorMessage(error: unknown): string {
    return getErrorMessage(error) || localize("common.unknownError", "Unknown error");
  }

  private async loadSettings(): Promise<void> {
    if (this.loadingSettings) {
      return;
    }

    this.loadingSettings = true;
    this.setConductorSettingsLoaded(false);

    try {
      const settings = toConductorSettings(await this.getSettingsPersistence().getSettings());
      if (!this.disposed) {
        this.setConductorSettings(settings, true);
      }
    } catch {
      if (!this.disposed) {
        this.setConductorSettingsLoaded(true);
      }
    } finally {
      this.loadingSettings = false;
    }
  }

  private getSettingsPersistence(): SettingsPersistence {
    return this.options.settingsPersistence ??
      createConfigurationSettingsPersistence(this.configurationService);
  }

  private setConductorSettings(
    nextSettings: ConductorSettings | null,
    conductorSettingsLoaded: boolean,
  ): void {
    const settingsChanged = !isSameObjectRecord(this.conductorSettings, nextSettings);
    const loadedChanged = this.conductorSettingsLoaded !== conductorSettingsLoaded;
    if (!settingsChanged && !loadedChanged) {
      return;
    }

    this.conductorSettings = nextSettings;
    this.conductorSettingsLoaded = conductorSettingsLoaded;

    if (settingsChanged) {
      this.onDidChangeConductorSettingsEmitter.fire(nextSettings);
    }

    this.publishSettingsViewInput();
    if (settingsChanged) {
      this.publishOriginSettingsViewInput();
    }
  }

  private setConductorSettingsLoaded(conductorSettingsLoaded: boolean): void {
    if (this.conductorSettingsLoaded === conductorSettingsLoaded) {
      return;
    }

    this.conductorSettingsLoaded = conductorSettingsLoaded;
    this.publishSettingsViewInput();
  }

  private createOriginSettingsViewInput(): OriginSettingsViewInput {
    return {
      axisSettings: this.conductorSettings?.plotAxisSettings,
      options: getOriginOpenPlotOptions(this.conductorSettings),
    };
  }

  private publishOriginSettingsViewInput(): void {
    const nextInput = this.createOriginSettingsViewInput();
    if (isSameOriginSettingsViewInput(this.originSettingsViewInput, nextInput)) {
      return;
    }

    this.originSettingsViewInput = nextInput;
    this.onDidChangeOriginSettingsViewInputEmitter.fire(undefined);
  }

  private createSettingsViewInput(): SettingsViewInput {
    return {
      appUpdateSettings: this.options.appUpdateSettings,
      conductorSettings: this.conductorSettings,
      conductorSettingsLoaded: this.conductorSettingsLoaded,
      isWindowsDesktopShell: this.options.isWindowsDesktopShell,
      language: isLanguagePreference(this.conductorSettings?.language)
        ? this.conductorSettings.language
        : this.options.language,
      theme: isThemeMode(this.conductorSettings?.theme)
        ? this.conductorSettings.theme
        : this.options.theme,
    };
  }

  private publishSettingsViewInput(): void {
    const nextInput = this.createSettingsViewInput();
    if (isSameSettingsViewInput(this.settingsViewInput, nextInput)) {
      return;
    }

    this.settingsViewInput = nextInput;
    this.onDidChangeSettingsViewInputEmitter.fire(undefined);
  }
}

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === "light" || value === "dark" || value === "system";

const isSameSettingsViewInput = (
  current: SettingsViewInput | null,
  next: SettingsViewInput,
): boolean =>
  Boolean(current) &&
  current?.appUpdateSettings.currentVersion === next.appUpdateSettings.currentVersion &&
  current?.appUpdateSettings.isAvailable === next.appUpdateSettings.isAvailable &&
  current?.conductorSettingsLoaded === next.conductorSettingsLoaded &&
  current?.isWindowsDesktopShell === next.isWindowsDesktopShell &&
  current?.language === next.language &&
  current?.theme === next.theme &&
  isSameObjectRecord(current?.conductorSettings, next.conductorSettings);

const isSameOriginSettingsViewInput = (
  current: OriginSettingsViewInput,
  next: OriginSettingsViewInput,
): boolean =>
  isSameObjectRecord(current.axisSettings ?? null, next.axisSettings ?? null) &&
  current.options?.command === next.options?.command &&
  current.options?.legendFontSize === next.options?.legendFontSize &&
  current.options?.lineWidth === next.options?.lineWidth &&
  current.options?.symbolShape === next.options?.symbolShape &&
  current.options?.type === next.options?.type &&
  current.options?.xyPairs === next.options?.xyPairs &&
  isSameStringArray(current.options?.postCommands, next.options?.postCommands);

const isSameStringArray = (
  current: readonly string[] | undefined,
  next: readonly string[] | undefined,
): boolean => {
  if (current === next) {
    return true;
  }
  if (!current || !next || current.length !== next.length) {
    return false;
  }
  return current.every((value, index) => value === next[index]);
};

const isSameObjectRecord = (
  current: Record<string, unknown> | null | undefined,
  next: Record<string, unknown> | null | undefined,
): boolean => {
  if (current === next) {
    return true;
  }
  if (!current || !next) {
    return false;
  }

  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);
  return currentKeys.length === nextKeys.length &&
    currentKeys.every(key => Object.is(current[key], next[key]));
};

function createConfigurationSettingsPersistence(
  configurationService: IConfigurationService,
): SettingsPersistence {
  const readSettings = (): ConductorSettings =>
    toConductorSettings(normalizePersistedConductorSettings(
      configurationService.getValue<Record<string, unknown>>() ?? {},
    )) ?? {};

  return {
    getSettings: async () => readSettings(),
    updateSettings: async (updates: unknown) => {
      const patch = isObjectRecord(updates) ? updates : {};
      const nextSettings = normalizePersistedConductorSettings({
        ...readSettings(),
        ...patch,
      }) as Record<string, unknown>;

      for (const key of Object.keys(patch)) {
        await configurationService.updateValue(
          key,
          nextSettings[key],
          ConfigurationTarget.USER,
        );
      }

      return readSettings();
    },
  };
}

registerSingleton(ISettingsService, BrowserSettingsService, InstantiationType.Delayed);
