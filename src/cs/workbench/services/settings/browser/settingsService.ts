/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from "src/cs/base/common/event";
import { localize } from "src/cs/nls";
import { formatOriginBridgeError } from "src/cs/workbench/services/export/common/originBridgeError";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  getDesktopOriginBridge,
  getErrorMessage,
  getOriginExePathWithTimeout,
  normalizeTrimmedString,
} from "src/cs/workbench/services/settings/browser/settingsShared";
import {
  ISettingsService,
  type ISettingsService as ISettingsServiceType,
  type ConductorSettings,
  type OriginCleanupResult,
  type OriginHealthResult,
  type OriginSettingsViewInput,
  type SettingsServiceOptions,
  type SettingsViewInput,
} from "src/cs/workbench/services/settings/common/settings";

const defaultOptions: SettingsServiceOptions = {
  updateConductorSettings: async () => null,
  isWindowsDesktopShell: false,
  mergeConductorSettings: () => {},
};

export class BrowserSettingsService implements ISettingsServiceType {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeOriginSettingsViewInputEmitter =
    new Emitter<OriginSettingsViewInput>();
  public readonly onDidChangeOriginSettingsViewInput =
    this.onDidChangeOriginSettingsViewInputEmitter.event;
  private readonly onDidChangeSettingsViewInputEmitter =
    new Emitter<SettingsViewInput>();
  public readonly onDidChangeSettingsViewInput =
    this.onDidChangeSettingsViewInputEmitter.event;

  private options: SettingsServiceOptions = defaultOptions;
  private originSettingsViewInput: OriginSettingsViewInput = {};
  private settingsViewInput: SettingsViewInput | null = null;

  update(options: SettingsServiceOptions): void {
    this.options = options;
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

  public async chooseOriginExePath(): Promise<string> {
    const bridge = getDesktopOriginBridge();
    if (!bridge) {
      return "";
    }

    const nextPath = normalizeTrimmedString(await bridge.pickOriginExePath());
    if (nextPath) {
      this.options.mergeConductorSettings({ originExePath: nextPath });
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
      this.options.mergeConductorSettings({ originExePath: nextPath });
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
    return this.options.updateConductorSettings(updates);
  }

  public updateOriginSettingsViewInput(input: OriginSettingsViewInput): void {
    this.originSettingsViewInput = input;
    this.onDidChangeOriginSettingsViewInputEmitter.fire(input);
  }

  public updateSettingsViewInput(input: SettingsViewInput): void {
    this.settingsViewInput = input;
    this.onDidChangeSettingsViewInputEmitter.fire(input);
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
}

registerSingleton(ISettingsService, BrowserSettingsService, InstantiationType.Delayed);
