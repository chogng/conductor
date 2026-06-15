import assert from "node:assert/strict";

import { language } from "src/cs/base/common/platform";
import { LanguagePackBaseService } from "src/cs/platform/languagePacks/common/languagePacks";

class TestLanguagePackService extends LanguagePackBaseService {}

suite("platform/languagePacks/common/languagePacks", () => {
	test("returns Conductor built-in language packs", async () => {
		const service = new TestLanguagePackService();

		const languages = await service.getAvailableLanguages();

		assert.deepEqual(languages.map(item => item.id), ["en", "zh"]);
		assert.deepEqual(languages.map(item => item.label), ["English", "Chinese"]);
	});

	test("marks the current language", async () => {
		const service = new TestLanguagePackService();

		const languages = await service.getInstalledLanguages();
		const currentLanguage = languages.find(item => item.id === language);

		assert.ok(currentLanguage);
		assert.match(currentLanguage.description ?? "", /Current/);
	});

	test("does not provide extension translation resources without extension packs", async () => {
		const service = new TestLanguagePackService();

		assert.equal(
			await service.getBuiltInExtensionTranslationsUri("sample.extension", "zh"),
			undefined,
		);
	});
});
