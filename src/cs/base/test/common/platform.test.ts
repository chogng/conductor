import assert from "assert";

import {
  isMacintosh,
  isLinux,
  isLanguageCode,
  isLanguagePreference,
  isNative,
  isWindows,
  platform,
  Platform,
  PlatformToString,
  resolveLanguageCode,
} from "../../common/platform.ts";

suite("base/test/common/platform", () => {
  test("detects the native platform from node process", () => {
    if (process.platform === "darwin") {
      assert.equal(isMacintosh, true);
      assert.equal(isLinux, false);
      assert.equal(isWindows, false);
      assert.equal(isNative, true);
      assert.equal(platform, Platform.Mac);
      assert.equal(PlatformToString(platform), "Mac");
      return;
    }

    if (process.platform === "win32") {
      assert.equal(isMacintosh, false);
      assert.equal(isLinux, false);
      assert.equal(isWindows, true);
      assert.equal(isNative, true);
      assert.equal(platform, Platform.Windows);
      assert.equal(PlatformToString(platform), "Windows");
      return;
    }

    if (process.platform === "linux") {
      assert.equal(isMacintosh, false);
      assert.equal(isLinux, true);
      assert.equal(isWindows, false);
      assert.equal(isNative, true);
      assert.equal(platform, Platform.Linux);
      assert.equal(PlatformToString(platform), "Linux");
      return;
    }

    assert.equal(isMacintosh, false);
    assert.equal(isLinux, false);
    assert.equal(isWindows, false);
  });

  test("normalizes Conductor display language preferences", () => {
    assert.equal(isLanguageCode("en"), true);
    assert.equal(isLanguageCode("zh"), true);
    assert.equal(isLanguageCode("de"), false);

    assert.equal(isLanguagePreference("system"), true);
    assert.equal(isLanguagePreference("en"), true);
    assert.equal(isLanguagePreference("zh"), true);
    assert.equal(isLanguagePreference("fr"), false);

    assert.equal(resolveLanguageCode("zh", "en-US"), "zh");
    assert.equal(resolveLanguageCode("system", "zh-CN"), "zh");
    assert.equal(resolveLanguageCode("system", "en-US"), "en");
    assert.equal(resolveLanguageCode("system", "de-DE"), "en");
  });
});
