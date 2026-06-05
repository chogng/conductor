import assert from "assert";

import {
  isMacintosh,
  isLinux,
  isNative,
  isWindows,
  platform,
  Platform,
  PlatformToString,
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
});
