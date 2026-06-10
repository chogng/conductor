/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { BrowserSettingsService } from "src/cs/workbench/services/settings/browser/settingsService";
import type {
  OriginSettingsViewInput,
  SettingsViewInput,
} from "src/cs/workbench/services/settings/common/settings";

suite("workbench/services/settings/browser/settingsService", () => {
  test("publishes Origin settings view input", () => {
    const service = new BrowserSettingsService();
    const events: OriginSettingsViewInput[] = [];
    const disposable = service.onDidChangeOriginSettingsViewInput(input => {
      events.push(input);
    });

    const input: OriginSettingsViewInput = {
      axisSettings: { showGrid: true },
      options: { command: "", legendFontSize: "", lineWidth: 1.5, postCommands: [], type: 200, xyPairs: "" },
    };

    service.updateOriginSettingsViewInput(input);

    assert.equal(service.getOriginSettingsViewInput(), input);
    assert.deepEqual(events, [input]);
    disposable.dispose();
  });

  test("publishes settings view input", () => {
    const service = new BrowserSettingsService();
    const events: SettingsViewInput[] = [];
    const disposable = service.onDidChangeSettingsViewInput(input => {
      events.push(input);
    });

    const input: SettingsViewInput = {
      appUpdateSettings: {
        currentVersion: "1.0.0",
        isAvailable: true,
        onCheckForUpdates: () => true,
      },
      conductorSettings: { theme: "dark" },
      conductorSettingsLoaded: true,
      handleLanguageChange: () => undefined,
      handleResetLayoutState: () => undefined,
      handleThemeChange: () => undefined,
      isWindowsDesktopShell: false,
      language: "en",
      mergeConductorSettings: () => undefined,
      theme: "dark",
      updateConductorSettings: async () => null,
    };

    service.updateSettingsViewInput(input);

    assert.equal(service.getSettingsViewInput(), input);
    assert.deepEqual(events, [input]);
    disposable.dispose();
  });
});
