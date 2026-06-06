import * as assert from "assert";

import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import { requestAnalysisDesktopStore } from "src/cs/workbench/services/storage/electron-sandbox/storageService";

suite("workbench/services/storage/electron-sandbox/storageService", () => {
  const originalWindow = globalThis.window;

  teardown(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
      writable: true,
    });
  });

  test("routes analysis requests through analysis channels", async () => {
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

    await requestAnalysisDesktopStore("/analysis/templates");
    await requestAnalysisDesktopStore("/analysis/templates", {
      body: JSON.stringify({ name: "Template" }),
      method: "POST",
    });
    await requestAnalysisDesktopStore("/analysis/settings", {
      body: JSON.stringify({ theme: "dark" }),
      method: "PATCH",
    });
    await requestAnalysisDesktopStore("/analysis/persistence-path", {
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
      await requestAnalysisDesktopStore("/analysis/persistence-path"),
      { isConfigurable: false },
    );
  });
});
