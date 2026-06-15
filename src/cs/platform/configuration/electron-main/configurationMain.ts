/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_CONDUCTOR_CONFIGURATION,
  applyStartupConductorDefaults,
  cloneConductorSettings,
  normalizeConductorSettings,
  type ConductorSettings,
} from "../common/configurationRegistry.js";

const USER_CONFIGURATION_DIRECTORY = "User";
const USER_SETTINGS_FILE = "settings.json";

export type ConductorMainConfigurationOptions = {
  readonly getUserDataPath: () => string;
};

export interface ConductorMainConfiguration {
  getConductorSettings(): ConductorSettings;
  patchConductorSettings(updates: unknown): ConductorSettings;
}

export function createConductorMainConfiguration(
  options: ConductorMainConfigurationOptions,
): ConductorMainConfiguration {
  const getUserDataPath =
    options && typeof options.getUserDataPath === "function"
      ? options.getUserDataPath
      : null;

  if (!getUserDataPath) {
    throw new Error("Conductor main configuration requires getUserDataPath().");
  }

  const getUserSettingsPath = (): string => path.join(
    getUserDataPath(),
    USER_CONFIGURATION_DIRECTORY,
    USER_SETTINGS_FILE,
  );

  const readRawSettings = (): unknown => {
    const settingsPath = getUserSettingsPath();
    if (!fs.existsSync(settingsPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(settingsPath, "utf8");
      return content.trim() ? JSON.parse(content) : {};
    } catch {
      return null;
    }
  };

  const readConductorSettings = (): ConductorSettings => {
    const raw = readRawSettings();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return cloneConductorSettings(DEFAULT_CONDUCTOR_CONFIGURATION);
    }

    return applyStartupConductorDefaults(raw);
  };

  const patchConductorSettings = (updates: unknown): ConductorSettings => {
    const patch = updates && typeof updates === "object" && !Array.isArray(updates)
      ? updates
      : {};
    const nextSettings = normalizeConductorSettings({
      ...readConductorSettings(),
      ...patch,
    });
    const settingsPath = getUserSettingsPath();
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, "utf8");
    return cloneConductorSettings(nextSettings);
  };

  return {
    getConductorSettings: readConductorSettings,
    patchConductorSettings,
  };
}
