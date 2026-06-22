/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
  type DesktopUpdateStatus,
} from "src/cs/workbench/contrib/update/common/update";
import {
  workbenchIpcChannels,
} from "src/cs/workbench/common/ipcChannels";
import { WorkbenchUpdateService } from "src/cs/workbench/services/update/electron-browser/updateService";

suite("workbench/services/update/test/electron-browser/updateService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("normalizes desktop bridge status and delegates update operations", async () => {
    const listeners: Array<(status: unknown) => void> = [];
    const calls: string[] = [];
    let disposed = false;
    const restoreWindow = installDesktopWindow({
      desktopApp: {
        getAutoUpdateStatus: () => ({
          status: "downloaded",
          version: " 1.2.3 ",
          channel: "github",
          isStoreManaged: false,
          message: " Ready ",
        }),
        onAutoUpdateStatusChange: (listener: (status: unknown) => void) => {
          listeners.push(listener);
          return () => {
            disposed = true;
          };
        },
        checkForUpdates: async () => {
          calls.push("check");
          return "checked";
        },
        applySpecificUpdate: async (packagePath: string) => {
          calls.push(`apply:${packagePath}`);
          return true;
        },
        checkForUpdatesAndInstall: async () => {
          calls.push("checkAndInstall");
          return true;
        },
        installDownloadedUpdate: async () => {
          calls.push("install");
          return true;
        },
      },
    });

    const service = new WorkbenchUpdateService();
    const changes: DesktopUpdateStatus[] = [];
    const listener = service.onDidChangeStatus(status => changes.push(status));
    try {
      assert.deepStrictEqual(service.getStatus(), {
        status: "downloaded",
        version: "1.2.3",
        channel: "github",
        isStoreManaged: false,
        message: "Ready",
      });

      listeners[0]?.({
        status: "checking",
        version: "",
        channel: "invalid",
        isStoreManaged: false,
        message: "",
      });

      assert.deepStrictEqual(changes, [{
        status: "checking",
        version: null,
        channel: "github",
        isStoreManaged: false,
        message: null,
      }]);
      assert.strictEqual(await service.checkForUpdates(), "checked");
      assert.strictEqual(await service.applySpecificUpdate("C:\\updates\\setup.exe"), true);
      assert.strictEqual(await service.checkForUpdatesAndInstall(), true);
      assert.strictEqual(await service.installDownloadedUpdate(), true);
      assert.deepStrictEqual(calls, [
        "check",
        "apply:C:\\updates\\setup.exe",
        "checkAndInstall",
        "install",
      ]);
    } finally {
      listener.dispose();
      service.dispose();
      restoreWindow();
    }

    assert.strictEqual(disposed, true);
  });

  test("falls back to conductor IPC when desktopApp bridge is unavailable", async () => {
    const invokedCalls: Array<{ readonly channel: string; readonly args: readonly unknown[] }> = [];
    const restoreWindow = installDesktopWindow({
      conductor: {
        ipcRenderer: {
          sendSync: (channel: string) => {
            assert.strictEqual(channel, workbenchIpcChannels.desktopAutoUpdateStatusGet);
            return {
              status: "available",
              version: "1.3.0",
              channel: "generic",
              isStoreManaged: false,
              message: null,
            };
          },
          invoke: async (channel: string, ...args: unknown[]) => {
            invokedCalls.push({ channel, args });
            return { channel, args };
          },
        },
      },
    });

    const service = new WorkbenchUpdateService();
    try {
      assert.deepStrictEqual(service.getStatus(), {
        status: "available",
        version: "1.3.0",
        channel: "generic",
        isStoreManaged: false,
        message: null,
      });

      await service.checkForUpdates();
      await service.checkForUpdatesAndInstall();
      await service.installDownloadedUpdate();
      await service.applySpecificUpdate("C:\\updates\\setup.exe");

      assert.deepStrictEqual(invokedCalls, [
        { channel: workbenchIpcChannels.desktopAutoUpdateCheck, args: [] },
        { channel: workbenchIpcChannels.desktopAutoUpdateCheckAndInstall, args: [] },
        { channel: workbenchIpcChannels.desktopAutoUpdateInstallDownloaded, args: [] },
        {
          channel: workbenchIpcChannels.desktopAutoUpdateApplySpecific,
          args: ["C:\\updates\\setup.exe"],
        },
      ]);
    } finally {
      service.dispose();
      restoreWindow();
    }
  });

});

function installDesktopWindow(value: unknown): () => void {
  const globals = globalThis as unknown as { window?: unknown };
  const hadWindow = Object.prototype.hasOwnProperty.call(globals, "window");
  const previousWindow = globals.window;
  Object.defineProperty(globals, "window", {
    configurable: true,
    value,
    writable: true,
  });

  return () => {
    if (hadWindow) {
      Object.defineProperty(globals, "window", {
        configurable: true,
        value: previousWindow,
        writable: true,
      });
      return;
    }

    delete globals.window;
  };
}
