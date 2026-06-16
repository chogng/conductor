import assert from "node:assert/strict";

import { language } from "src/cs/base/common/platform";
import { LanguagePackBaseService } from "src/cs/platform/languagePacks/common/languagePacks";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

class TestLanguagePackService extends LanguagePackBaseService {}

suite("platform/languagePacks/common/languagePacks", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
	test("returns Conductor built-in language packs", async () => {
		const service = store.add(new TestLanguagePackService());

		const languages = await service.getAvailableLanguages();

		assert.deepEqual(languages.map(item => item.id), ["en", "zh"]);
		assert.deepEqual(languages.map(item => item.label), ["English", "Chinese"]);
	});

	test("marks the current language", async () => {
		const service = store.add(new TestLanguagePackService());

		const languages = await service.getInstalledLanguages();
		const currentLanguage = languages.find(item => item.id === language);

		assert.ok(currentLanguage);
		assert.match(currentLanguage.description ?? "", /Current/);
	});

	test("does not provide extension translation resources without extension packs", async () => {
		const service = store.add(new TestLanguagePackService());

		assert.equal(
			await service.getBuiltInExtensionTranslationsUri("sample.extension", "zh"),
			undefined,
		);
	});
});
