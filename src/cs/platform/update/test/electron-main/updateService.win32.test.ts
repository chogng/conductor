/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

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
});
