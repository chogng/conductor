/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Emitter, type Event as EventType } from "src/cs/base/common/event";
import type { IChannel } from "src/cs/base/parts/ipc/common/ipc";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { DesktopUpdateStatus } from "src/cs/platform/update/common/update";
import { UpdateChannelClient } from "src/cs/platform/update/common/updateIpc";

suite("workbench/services/update/test/electron-browser/updateService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("uses the typed main-process update channel", async () => {
    const statusChanges = new Emitter<DesktopUpdateStatus>();
    const calls: Array<{ readonly command: string; readonly arg: unknown }> = [];
    const channel: IChannel = {
      call: async <T>(command: string, arg?: unknown) => {
        calls.push({ command, arg });
        if (command === "getStatus") {
          return {
            status: "downloaded",
            version: " 1.2.3 ",
            channel: "github",
            isStoreManaged: false,
            message: " Ready ",
            progressPercent: 100,
          } as T;
        }
        return command as T;
      },
      listen: <T>() => statusChanges.event as EventType<T>,
    };
    const service = new UpdateChannelClient(channel);
    const changes: DesktopUpdateStatus[] = [];
    const listener = service.onDidChangeStatus(status => changes.push(status));

    try {
      await Promise.resolve();
      assert.deepStrictEqual(service.getStatus(), {
        status: "downloaded",
        version: "1.2.3",
        channel: "github",
        isStoreManaged: false,
        message: "Ready",
        progressPercent: 100,
      });

      statusChanges.fire({
        status: "checking",
        version: null,
        channel: "generic",
        isStoreManaged: false,
        message: null,
        progressPercent: 42,
      });
      assert.deepStrictEqual(changes.at(-1), {
        status: "checking",
        version: null,
        channel: "generic",
        isStoreManaged: false,
        message: null,
        progressPercent: 42,
      });

      assert.strictEqual(await service.checkForUpdates({ manual: true }), "checkForUpdates");
      assert.strictEqual(await service.checkForUpdatesAndInstall(), "checkForUpdatesAndInstall");
      assert.strictEqual(await service.installDownloadedUpdate(), "installDownloadedUpdate");
      assert.strictEqual(
        await service.applySpecificUpdate("C:\\updates\\setup.exe"),
        "applySpecificUpdate",
      );
      assert.deepStrictEqual(calls.slice(1), [
        { command: "checkForUpdates", arg: { manual: true } },
        { command: "checkForUpdatesAndInstall", arg: undefined },
        { command: "installDownloadedUpdate", arg: undefined },
        {
          command: "applySpecificUpdate",
          arg: "C:\\updates\\setup.exe",
        },
      ]);
    } finally {
      listener.dispose();
      service.dispose();
      statusChanges.dispose();
    }
  });
});
