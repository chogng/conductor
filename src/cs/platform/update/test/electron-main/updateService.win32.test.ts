/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { Win32UpdateService, type DesktopUpdateStatus } from "src/cs/platform/update/electron-main/updateService.win32";

suite("platform/update/test/electron-main/updateService.win32", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("prepares app quit before silently installing downloaded update", async () => {
    const calls: string[] = [];
    const statuses: DesktopUpdateStatus[] = [];
    const service = new Win32UpdateService({
      app: { getVersion: () => "1.0.0", isPackaged: true } as never,
      appDisplayName: "Conductor Studio",
      dialog: {} as never,
      getDialogWindow: () => null,
      isWindowsStorePackage: false,
      localize: key => key,
      log: () => undefined,
      onStatusChange: status => statuses.push(status),
      packageJsonPath: "package.json",
      prepareToQuitForUpdate: () => calls.push("prepare"),
      warn: () => undefined,
    });

    const serviceState = service as unknown as {
      autoUpdater: { quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void };
      status: DesktopUpdateStatus;
    };
    serviceState.autoUpdater = {
      quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => {
        calls.push(`quit:${String(isSilent)}:${String(isForceRunAfter)}`);
      },
    };
    serviceState.status = {
      status: "downloaded",
      version: "1.2.0",
      channel: "generic",
      isStoreManaged: false,
      message: null,
      progressPercent: null,
    };

    assert.strictEqual(await service.installDownloadedUpdate(), true);
    assert.deepStrictEqual(calls, [
      "prepare",
      "quit:true:true",
    ]);
    assert.deepStrictEqual(statuses, [{
      status: "updating",
      version: "1.2.0",
      channel: "generic",
      isStoreManaged: false,
      message: null,
      progressPercent: null,
    }]);
  });

  test("serves a local setup package through a debug update feed", async () => {
    if (process.platform !== "win32") {
      return;
    }

    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "conductor-update-test-"));
    const updateTempDir = path.join(tempDir, "update-temp");
    const userDataDir = path.join(tempDir, "user-data");
    const packagePath = path.join(tempDir, "Conductor-Studio-1.5.19-windows-x64-setup.exe");
    await fs.promises.writeFile(packagePath, "test setup package", "utf8");

    const statuses: DesktopUpdateStatus[] = [];
    const setPathCalls: Array<{ readonly name: string; readonly path: string }> = [];
    const updater = new TestAutoUpdater();
    const service = new Win32UpdateService({
      app: {
        getPath: (name: string) => {
          assert.strictEqual(name, "userData");
          return userDataDir;
        },
        getVersion: () => "1.5.19",
        isPackaged: true,
        setPath: (name: string, value: string) => {
          setPathCalls.push({ name, path: value });
        },
      } as never,
      appDisplayName: "Conductor Studio",
      dialog: {
        showMessageBox: async () => ({ response: 0 }),
      } as never,
      getDialogWindow: () => null,
      getUpdateTempDir: () => updateTempDir,
      isWindowsStorePackage: false,
      localize: (key, vars) => vars ? `${key}:${JSON.stringify(vars)}` : key,
      log: () => undefined,
      onStatusChange: status => statuses.push(status),
      packageJsonPath: "package.json",
      warn: () => undefined,
    });

    const serviceState = service as unknown as {
      autoUpdater: TestAutoUpdater;
    };
    serviceState.autoUpdater = updater;

    try {
      const result = await service.applySpecificUpdate(packagePath);
      const feedDir = path.join(userDataDir, "update-debug-feed");
      const updateCacheDirName = `conductor-desktop-${process.arch}`;
      const updateCachePath = path.join(updateTempDir, updateCacheDirName);
      const runtimeUpdateConfig = await fs.promises.readFile(path.join(updateCachePath, "app-update.yml"), "utf8");
      const latestYml = await fs.promises.readFile(path.join(feedDir, "latest.yml"), "utf8");
      const copiedPackagePath = path.join(feedDir, path.basename(packagePath));

      assert.deepStrictEqual({
        autoDownload: updater.autoDownload,
        autoInstallOnAppQuit: updater.autoInstallOnAppQuit,
        appUpdatePath: setPathCalls,
        autoUpdaterBaseCachePath: updater.app.baseCachePath,
        checkCalls: updater.checkCalls,
        copiedPackageExists: fs.existsSync(copiedPackagePath),
        disableDifferentialDownload: updater.disableDifferentialDownload,
        feedUrlIsLocalhost: updater.feedUrl?.startsWith("http://127.0.0.1:"),
        latestYmlHasPackage: latestYml.includes(`url: ${JSON.stringify(path.basename(packagePath))}`),
        latestYmlHasVersion: latestYml.includes("version: 1.5.20"),
        result,
        runtimeUpdateConfigHasCacheName: runtimeUpdateConfig.includes(`updaterCacheDirName: ${updateCacheDirName}`),
        runtimeUpdateConfigPath: updater.updateConfigPath,
        statusSummary: statuses.map(status => ({
          status: status.status,
          version: status.version,
          channel: status.channel,
          message: status.message,
          progressPercent: status.progressPercent,
        })),
      }, {
        autoDownload: true,
        autoInstallOnAppQuit: true,
        appUpdatePath: [
          {
            name: "appUpdate",
            path: updateCachePath,
          },
        ],
        autoUpdaterBaseCachePath: updateTempDir,
        checkCalls: 1,
        copiedPackageExists: true,
        disableDifferentialDownload: true,
        feedUrlIsLocalhost: true,
        latestYmlHasPackage: true,
        latestYmlHasVersion: true,
        result: true,
        runtimeUpdateConfigHasCacheName: true,
        runtimeUpdateConfigPath: path.join(updateCachePath, "app-update.yml"),
        statusSummary: [
          {
            status: "checking",
            version: null,
            channel: "generic",
            message: `update.localPackageFeedMessage:${JSON.stringify({ path: packagePath })}`,
            progressPercent: null,
          },
          {
            status: "checking",
            version: "1.5.20",
            channel: "generic",
            message: `update.localPackageFeedMessage:${JSON.stringify({ path: packagePath })}`,
            progressPercent: null,
          },
          {
            status: "checking",
            version: "1.5.20",
            channel: "generic",
            message: `update.localPackageFeedMessage:${JSON.stringify({ path: packagePath })}`,
            progressPercent: null,
          },
          {
            status: "available",
            version: "1.5.20",
            channel: "generic",
            message: `update.localPackageFeedMessage:${JSON.stringify({ path: packagePath })}`,
            progressPercent: null,
          },
        ],
      });
    } finally {
      service.stopPolling();
      await fs.promises.rm(tempDir, { force: true, recursive: true });
    }
  });
});

class TestAutoUpdater extends EventEmitter {
  public readonly app = {
    appUpdateConfigPath: path.join("missing", "app-update.yml"),
    baseCachePath: "default-cache",
  };
  public autoDownload = false;
  public autoInstallOnAppQuit = false;
  public checkCalls = 0;
  public disableDifferentialDownload = false;
  public downloadPromise: Promise<void> | null = Promise.resolve();
  public checkForUpdatesPromise: Promise<void> | null = Promise.resolve();
  public feedUrl: string | null = null;
  public updateConfigPath: string | null = null;
  public updateInfoAndProvider: object | null = {};

  public setFeedURL(options: { readonly url: string }): void {
    this.feedUrl = options.url;
  }

  public checkForUpdates(): Promise<{ readonly isUpdateAvailable: boolean }> {
    this.checkCalls += 1;
    this.emit("checking-for-update");
    this.emit("update-available", { version: "1.5.20" });
    return Promise.resolve({ isUpdateAvailable: true });
  }
}
