import assert from "assert";

import { DelayedDragHandler, DataTransfers } from "../../browser/dnd.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/browser/dnd", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("DataTransfers exposes drag data mime keys", () => {
    assert.equal(DataTransfers.RESOURCES, "ResourceURLs");
    assert.equal(DataTransfers.DOWNLOAD_URL, "DownloadURL");
    assert.equal(DataTransfers.FILES, "Files");
    assert.equal(DataTransfers.TEXT, "text/plain");
    assert.equal(DataTransfers.INTERNAL_URI_LIST, "application/vnd.code.uri-list");
  });

  test("DelayedDragHandler schedules once and clears on dragleave", () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const scheduled: Array<() => void> = [];
    const cleared: unknown[] = [];
    globalThis.setTimeout = ((callback: () => void) => {
      scheduled.push(callback);
      return scheduled.length as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
    globalThis.clearTimeout = ((handle: unknown) => {
      cleared.push(handle);
    }) as typeof clearTimeout;

    try {
      const target = new EventTarget();
      let calls = 0;
      const handler = new DelayedDragHandler(target as unknown as HTMLElement, () => {
        calls++;
      });

      target.dispatchEvent(new Event("dragover", { cancelable: true }));
      target.dispatchEvent(new Event("dragover", { cancelable: true }));
      assert.equal(scheduled.length, 1);

      target.dispatchEvent(new Event("dragleave"));
      assert.deepEqual(cleared, [1]);

      scheduled[0]();
      assert.equal(calls, 1);

      handler.dispose();
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });
});
