/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as assert from "assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createConductorMainConfiguration } from "src/cs/platform/configuration/electron-main/configurationMain";

suite("platform/configuration/electron-main/configurationMain", () => {
  test("reads defaults when user settings do not exist", () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-main-config-test-"));
    const configuration = createConductorMainConfiguration({
      getUserDataPath: () => userDataPath,
    });

    const settings = configuration.getConductorSettings();

    assert.equal(settings.language, "system");
    assert.equal(settings.theme, "system");
    assert.equal(
      fs.existsSync(path.join(userDataPath, "User", "settings.json")),
      false,
    );
  });

  test("patches user settings in User/settings.json", () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-main-config-test-"));
    const configuration = createConductorMainConfiguration({
      getUserDataPath: () => userDataPath,
    });

    const settings = configuration.patchConductorSettings({
      theme: "dark",
      originExePath: "C:\\Origin\\Origin.exe",
      unknownSetting: 42,
    });
    const settingsPath = path.join(userDataPath, "User", "settings.json");
    const raw = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as Record<string, unknown>;

    assert.equal(settings.theme, "dark");
    assert.equal(settings.originExePath, "C:\\Origin\\Origin.exe");
    assert.equal(raw.theme, "dark");
    assert.equal(raw.originExePath, "C:\\Origin\\Origin.exe");
    assert.equal(raw.unknownSetting, 42);
  });

  test("falls back to defaults for unreadable user settings", () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-main-config-test-"));
    const settingsPath = path.join(userDataPath, "User", "settings.json");
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, "{", "utf8");

    const configuration = createConductorMainConfiguration({
      getUserDataPath: () => userDataPath,
    });

    assert.equal(configuration.getConductorSettings().theme, "system");
  });
});
