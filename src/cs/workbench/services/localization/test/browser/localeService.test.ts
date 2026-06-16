import assert from "node:assert/strict";

import { Event } from "src/cs/base/common/event";
import type { LanguagePreference } from "src/cs/base/common/platform";
import type { INativeHostService } from "src/cs/platform/native/common/native";
import type {
	ConductorSettings,
	ISettingsService,
	SettingsViewInput,
} from "src/cs/workbench/services/settings/common/settings";
import { BrowserLocaleService } from "src/cs/workbench/services/localization/browser/localeService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

class TestSettingsService {
	public readonly _serviceBrand = undefined;
	public readonly onDidChangeConductorSettings = Event.None;
	public readonly onDidChangeOriginSettingsViewInput = Event.None;
	public readonly onDidChangeSettingsViewInput = Event.None;
	public language: LanguagePreference = "system";
	public readonly updates: unknown[] = [];

	public getSettingsViewInput(): SettingsViewInput {
		return {
			appUpdateSettings: {
				currentVersion: null,
				isAvailable: false,
			},
			conductorSettings: { language: this.language },
			conductorSettingsLoaded: true,
			isWindowsDesktopShell: false,
			language: this.language,
			theme: "system",
		};
	}

	public async updateSettings(updates: unknown): Promise<ConductorSettings | null> {
		this.updates.push(updates);
		if (
			updates &&
			typeof updates === "object" &&
			"language" in updates
		) {
			this.language = (updates as { language: LanguagePreference }).language;
		}

		return { language: this.language };
	}
}

suite("workbench/services/localization/browser/localeService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("persists locale changes and reloads the native window", async () => {
		const settingsService = new TestSettingsService();
		let reloads = 0;
		const nativeHostService = {
			reloadWindow: async () => {
				reloads++;
			},
		} as INativeHostService;
		const service = new BrowserLocaleService(
			settingsService as unknown as ISettingsService,
			nativeHostService,
		);

		await service.setLocale("zh");

		assert.equal(settingsService.language, "zh");
		assert.deepEqual(settingsService.updates, [{ language: "zh" }]);
		assert.equal(reloads, 1);
	});

	test("does not persist or reload when locale is unchanged", async () => {
		const settingsService = new TestSettingsService();
		settingsService.language = "en";
		let reloads = 0;
		const service = new BrowserLocaleService(
			settingsService as unknown as ISettingsService,
			{
				reloadWindow: async () => {
					reloads++;
				},
			} as INativeHostService,
		);

		await service.setLocale("en");

		assert.deepEqual(settingsService.updates, []);
		assert.equal(reloads, 0);
	});

	test("clears locale preference to system", async () => {
		const settingsService = new TestSettingsService();
		settingsService.language = "zh";
		const service = new BrowserLocaleService(
			settingsService as unknown as ISettingsService,
			{
				reloadWindow: async () => undefined,
			} as INativeHostService,
		);

		await service.clearLocalePreference();

		assert.equal(settingsService.language, "system");
		assert.deepEqual(settingsService.updates, [{ language: "system" }]);
	});
});
