/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
  ConfigurationTarget,
} from "src/cs/platform/configuration/common/configuration";
import { ConfigurationService } from "src/cs/platform/configuration/common/configurationService";
import { BrowserSettingsService } from "src/cs/workbench/services/settings/browser/settingsService";
import type { OriginPlotOptions } from "src/cs/workbench/services/origin/common/originPlotOptions";
import { DEFAULT_PLOT_AXIS_SETTINGS } from "src/cs/workbench/services/plot/common/plotSettings";
import type {
  ConductorSettings,
  SettingsServiceOptions,
  SettingsViewInput,
} from "src/cs/workbench/services/settings/common/settings";

let settingsTestStore: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite> | undefined;

suite("workbench/services/settings/browser/settingsService", () => {
  settingsTestStore = ensureNoDisposablesAreLeakedInTestSuite();

  test("publishes Origin settings view input from owned conductor settings", () => {
    const service = createBrowserSettingsService();
    let changeCount = 0;
    const disposable = settingsTestStore.add(service.onDidChangeOriginSettingsViewInput(() => {
      changeCount += 1;
    }));

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
    const service = createBrowserSettingsService();
    let capturedUpdates: unknown = null;
    service.mergeConductorSettings({});
    service.update(createSettingsServiceOptions({
      settingsPersistence: {
        getSettings: async () => ({}),
        updateSettings: async (updates) => {
          capturedUpdates = updates;
          return updates;
        },
      },
    }));

    await service.updateOriginPlotOptions({
      command: " plotxy ",
      legendFontSize: "12",
      lineWidth: "99",
      postCommands: "layer -a\n\n",
      type: "201",
      xyPairs: " ((1,2)) ",
    } as unknown as Partial<OriginPlotOptions>);

    assert.deepEqual(capturedUpdates, {
      originPlotCommandDefault: "plotxy",
      originPlotLegendFontSizeDefault: 12,
      originPlotLineWidthDefault: 20,
      originPlotPostCommandsDefault: ["layer -a"],
      originPlotTypeDefault: 201,
      originPlotXyPairsDefault: "((1,2))",
    });
    assert.equal(service.getOriginSettingsViewInput().options?.command, "plotxy");
  });

  test("updates plot axis settings through service owner API", async () => {
    const service = createBrowserSettingsService();
    let capturedUpdates: unknown = null;
    service.mergeConductorSettings({
      plotAxisSettings: {
        showGrid: false,
        xMin: "0",
      },
    });
    service.update(createSettingsServiceOptions({
      settingsPersistence: {
        getSettings: async () => ({}),
        updateSettings: async (updates) => {
          capturedUpdates = updates;
          return updates;
        },
      },
    }));

    await service.updatePlotAxisSettings({
      showGrid: true,
      showMajorTicks: false,
      showMinorTicks: false,
      xMax: "10.5",
      xTickCount: "99",
    });

    assert.deepEqual(capturedUpdates, {
      plotAxisSettings: {
        ...DEFAULT_PLOT_AXIS_SETTINGS,
        showGrid: true,
        showMajorTicks: false,
        showMinorTicks: false,
        xMax: "10.5",
        xTickCount: 20,
        xMin: "0",
      },
    });
    assert.deepEqual(service.getConductorSettings()?.plotAxisSettings, {
      ...DEFAULT_PLOT_AXIS_SETTINGS,
      showGrid: true,
      showMajorTicks: false,
      showMinorTicks: false,
      xMax: "10.5",
      xTickCount: 20,
      xMin: "0",
    });
  });

  test("ignores empty owner API updates", async () => {
    const service = createBrowserSettingsService();
    let updateCount = 0;
    service.mergeConductorSettings({});
    service.update(createSettingsServiceOptions({
      settingsPersistence: {
        getSettings: async () => ({}),
        updateSettings: async updates => {
          updateCount += 1;
          return updates;
        },
      },
    }));

    await service.updateOriginPlotOptions({});
    await service.updatePlotAxisSettings({});

    assert.equal(updateCount, 0);
  });

  test("publishes settings view input from owned conductor settings", () => {
    const service = createBrowserSettingsService();
    let changeCount = 0;
    const conductorSettingsEvents: unknown[] = [];
    const disposable = settingsTestStore.add(service.onDidChangeSettingsViewInput(() => {
      changeCount += 1;
    }));
    const conductorSettingsDisposable = settingsTestStore.add(service.onDidChangeConductorSettings(settings => {
      conductorSettingsEvents.push(settings);
    }));

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
    const service = createBrowserSettingsService();
    const calls: unknown[] = [];
    let storedSettings: ConductorSettings = {};

    service.mergeConductorSettings({});
    service.update(createSettingsServiceOptions({
      settingsPersistence: {
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

  test("uses platform configuration as the default persistence owner", async () => {
    const configurationService = settingsTestStore.add(new ConfigurationService());
    const service = settingsTestStore.add(new BrowserSettingsService(configurationService));
    service.mergeConductorSettings({});
    service.update(createSettingsServiceOptions({
      settingsPersistence: undefined,
    }));

    await service.updateSettings({ theme: "dark" });

    assert.equal(configurationService.getValue("theme"), "dark");
    assert.equal(service.getConductorSettings()?.theme, "dark");

    await configurationService.updateValue(
      "theme",
      "light",
      ConfigurationTarget.USER,
    );
    await drainMicrotasks();

    assert.equal(service.getConductorSettings()?.theme, "light");
  });
});

const createBrowserSettingsService = (): BrowserSettingsService =>
  settingsTestStore?.add(new BrowserSettingsService(
    settingsTestStore.add(new ConfigurationService()),
  )) ?? new BrowserSettingsService(new ConfigurationService());

const drainMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const createSettingsServiceOptions = (
  overrides: Partial<SettingsServiceOptions> = {},
): SettingsServiceOptions => ({
  appUpdateSettings: {
    currentVersion: "1.0.0",
    isAvailable: false,
  },
  isWindowsDesktopShell: false,
  language: "en",
  settingsPersistence: {
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
