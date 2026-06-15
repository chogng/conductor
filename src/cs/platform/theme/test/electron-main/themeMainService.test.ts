import assert from "node:assert/strict";

import { ConfigurationTarget } from "src/cs/platform/configuration/common/configuration";
import { ConfigurationService } from "src/cs/platform/configuration/common/configurationService";
import { ThemeMainService } from "src/cs/platform/theme/electron-main/themeMainServiceImpl";
import type { ThemeMode, ThemeSnapshot } from "src/cs/platform/theme/electron-main/themeMainService";

class TestNativeTheme {
  public shouldUseDarkColors = false;
  public themeSource: ThemeMode = "system";
  private readonly listeners = new Set<() => void>();

  public on(event: "updated", listener: () => void): void {
    if (event === "updated") {
      this.listeners.add(listener);
    }
  }

  public removeListener(event: "updated", listener: () => void): void {
    if (event === "updated") {
      this.listeners.delete(listener);
    }
  }

  public fireUpdated(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

suite("platform/theme/electron-main/themeMainService", () => {
  test("reads theme appearance from IConfigurationService", async () => {
    const configurationService = new ConfigurationService();
    await configurationService.updateValue("theme", "dark", ConfigurationTarget.USER);
    await configurationService.updateValue("backgroundColor", " #ABCDEF ", ConfigurationTarget.USER);
    await configurationService.updateValue("transparentChrome", true, ConfigurationTarget.USER);
    const nativeTheme = new TestNativeTheme();
    const service = new ThemeMainService("#f3f4f6", configurationService, nativeTheme);

    assert.equal(nativeTheme.themeSource, "dark");
    assert.deepEqual(service.getWindowTheme(), {
      backgroundColor: "#0b0b0c",
      foregroundColor: "#f5f4ef",
    });
    assert.deepEqual(service.getWindowAppearance(), {
      backgroundColor: "#abcdef",
      opaqueSurfaceBackgroundColor: "#f9f9f9",
      transparentChrome: true,
    });

    service.dispose();
    configurationService.dispose();
  });

  test("fires color scheme changes from configuration and native theme updates", async () => {
    const configurationService = new ConfigurationService();
    const nativeTheme = new TestNativeTheme();
    const service = new ThemeMainService("#f3f4f6", configurationService, nativeTheme);
    const events: ThemeSnapshot[] = [];
    const listener = service.onDidChangeColorScheme(event => events.push(event));

    await configurationService.updateValue("theme", "light", ConfigurationTarget.USER);
    nativeTheme.shouldUseDarkColors = true;
    await configurationService.updateValue("theme", "system", ConfigurationTarget.USER);
    nativeTheme.fireUpdated();

    assert.equal(nativeTheme.themeSource, "system");
    assert.equal(events.some(event => event.themeMode === "light"), true);
    assert.equal(events.some(event => event.themeMode === "system" && event.resolvedThemeMode === "dark"), true);

    listener.dispose();
    service.dispose();
    configurationService.dispose();
  });
});
