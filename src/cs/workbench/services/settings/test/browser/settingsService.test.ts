/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { BrowserSettingsService } from "src/cs/workbench/services/settings/browser/settingsService";
import type {
  ConductorSettings,
  SettingsServiceOptions,
  SettingsViewInput,
} from "src/cs/workbench/services/settings/common/settings";

suite("workbench/services/settings/browser/settingsService", () => {
  test("publishes Origin settings view input from owned conductor settings", () => {
    const service = new BrowserSettingsService();
    let changeCount = 0;
    const disposable = service.onDidChangeOriginSettingsViewInput(() => {
      changeCount += 1;
    });

    service.mergeConductorSettings({
      originPlotLineWidthDefault: 2,
      originPlotTypeDefault: 201,
      plotAxisSettings: { showGrid: true },
    });

    const input = service.getOriginSettingsViewInput();
    assert.deepEqual(input.axisSettings, { showGrid: true });
    assert.equal(input.options?.lineWidth, 2);
    assert.equal(input.options?.type, 201);
    assert.equal(changeCount, 1);
    disposable.dispose();
  });

  test("updates Origin plot settings through service owner API", async () => {
    const service = new BrowserSettingsService();
    let capturedUpdates: unknown = null;
    service.mergeConductorSettings({});
    service.update(createSettingsServiceOptions({
      settingsStore: {
        getSettings: async () => ({}),
        updateSettings: async (updates) => {
          capturedUpdates = updates;
          return updates;
        },
      },
    }));

    await service.updateOriginPlotOptions({
      command: "plotxy",
      legendFontSize: 12,
      lineWidth: 2,
      postCommands: ["layer -a"],
      type: 201,
      xyPairs: "((1,2))",
    });

    assert.deepEqual(capturedUpdates, {
      originPlotCommandDefault: "plotxy",
      originPlotLegendFontSizeDefault: 12,
      originPlotLineWidthDefault: 2,
      originPlotPostCommandsDefault: ["layer -a"],
      originPlotTypeDefault: 201,
      originPlotXyPairsDefault: "((1,2))",
    });
    assert.equal(service.getOriginSettingsViewInput().options?.command, "plotxy");
  });

  test("updates plot axis settings through service owner API", async () => {
    const service = new BrowserSettingsService();
    let capturedUpdates: unknown = null;
    service.mergeConductorSettings({
      plotAxisSettings: {
        showGrid: false,
        xMin: "0",
      },
    });
    service.update(createSettingsServiceOptions({
      settingsStore: {
        getSettings: async () => ({}),
        updateSettings: async (updates) => {
          capturedUpdates = updates;
          return updates;
        },
      },
    }));

    await service.updatePlotAxisSettings({
      showGrid: true,
      xMax: "10",
    });

    assert.deepEqual(capturedUpdates, {
      plotAxisSettings: {
        showGrid: true,
        xMax: "10",
        xMin: "0",
      },
    });
    assert.deepEqual(service.getConductorSettings()?.plotAxisSettings, {
      showGrid: true,
      xMax: "10",
      xMin: "0",
    });
  });

  test("publishes settings view input from owned conductor settings", () => {
    const service = new BrowserSettingsService();
    let changeCount = 0;
    const conductorSettingsEvents: unknown[] = [];
    const disposable = service.onDidChangeSettingsViewInput(() => {
      changeCount += 1;
    });
    const conductorSettingsDisposable = service.onDidChangeConductorSettings(settings => {
      conductorSettingsEvents.push(settings);
    });

    service.mergeConductorSettings({ theme: "dark" });
    service.update(createSettingsServiceOptions({
      appUpdateSettings: {
        currentVersion: "1.0.1",
        isAvailable: true,
      },
      theme: "dark",
    }));

    assert.deepEqual(service.getConductorSettings(), { theme: "dark" });
    assert.deepEqual(service.getSettingsViewInput(), createSettingsViewInput({
      appUpdateSettings: {
        currentVersion: "1.0.1",
        isAvailable: true,
      },
      conductorSettings: { theme: "dark" },
      theme: "dark",
    }));
    assert.equal(changeCount, 2);
    assert.deepEqual(conductorSettingsEvents, [{ theme: "dark" }]);
    disposable.dispose();
    conductorSettingsDisposable.dispose();
  });

  test("persists settings patches through the settings store", async () => {
    const service = new BrowserSettingsService();
    const calls: unknown[] = [];
    let storedSettings: ConductorSettings = {};

    service.mergeConductorSettings({});
    service.update(createSettingsServiceOptions({
      settingsStore: {
        getSettings: async () => storedSettings,
        updateSettings: async (updates) => {
          calls.push(["update", updates]);
          storedSettings = {
            ...storedSettings,
            ...(updates as ConductorSettings),
          };
          return storedSettings;
        },
      },
    }));

    await service.updateSettings({
      fileNameFieldSeparators: "_",
      language: "zh",
      theme: "dark",
    });

    assert.deepEqual(calls, [
      ["update", {
        fileNameFieldSeparators: "_",
        language: "zh",
        theme: "dark",
      }],
    ]);
    assert.deepEqual(service.getConductorSettings(), {
      fileNameFieldSeparators: "_",
      language: "zh",
      theme: "dark",
    });
  });
});

const createSettingsServiceOptions = (
  overrides: Partial<SettingsServiceOptions> = {},
): SettingsServiceOptions => ({
  appUpdateSettings: {
    currentVersion: "1.0.0",
    isAvailable: false,
  },
  isWindowsDesktopShell: false,
  language: "en",
  settingsStore: {
    getSettings: async () => ({}),
    updateSettings: async updates => updates,
  },
  theme: "light",
  ...overrides,
});

const createSettingsViewInput = (
  overrides: Partial<SettingsViewInput> = {},
): SettingsViewInput => ({
  appUpdateSettings: {
    currentVersion: "1.0.0",
    isAvailable: true,
  },
  conductorSettings: null,
  conductorSettingsLoaded: true,
  isWindowsDesktopShell: false,
  language: "en",
  theme: "light",
  ...overrides,
});
