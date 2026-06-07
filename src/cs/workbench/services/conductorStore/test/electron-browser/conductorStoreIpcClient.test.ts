import * as assert from "assert";

import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import { requestConductorStore } from "src/cs/workbench/services/conductorStore/electron-browser/conductorStoreIpcClient";

suite("workbench/services/conductorStore/electron-browser/conductorStoreIpcClient", () => {
  const originalWindow = globalThis.window;

  teardown(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
      writable: true,
    });
  });

  test("routes store requests through store channels", async () => {
    const calls: Array<{ readonly args: readonly unknown[]; readonly channel: string }> = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        conductor: {
          ipcRenderer: {
            invoke: async (channel: string, ...args: unknown[]) => {
              calls.push({ channel, args });
              return channel === workbenchIpcChannels.templatesGet ? [] : {};
            },
          },
        },
      },
      writable: true,
    });

    await requestConductorStore("/templates");
    await requestConductorStore("/templates", {
      body: JSON.stringify({ name: "Template" }),
      method: "POST",
    });
    await requestConductorStore("/settings", {
      body: JSON.stringify({ theme: "dark" }),
      method: "PATCH",
    });
    await requestConductorStore("/persistence-path", {
      body: JSON.stringify({ path: "C:\\Data" }),
      method: "PATCH",
    });

    assert.deepStrictEqual(calls, [
      { channel: workbenchIpcChannels.templatesGet, args: [] },
      { channel: workbenchIpcChannels.templatesCreate, args: [{ name: "Template" }] },
      { channel: workbenchIpcChannels.settingsPatch, args: [{ theme: "dark" }] },
      { channel: workbenchIpcChannels.persistencePathSet, args: [{ path: "C:\\Data" }] },
    ]);
  });

  test("returns non-configurable persistence path when desktop store is unavailable", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
      writable: true,
    });

    assert.deepStrictEqual(
      await requestConductorStore("/persistence-path"),
      { isConfigurable: false },
    );
  });
});
