/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { BrowserUpdateService } from "src/cs/workbench/services/update/browser/updateService";

suite("workbench/services/update/test/browser/updateService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("reports unsupported update state in browser workbench", async () => {
    const service = new BrowserUpdateService();
    try {
      assert.strictEqual(service.canCheckForUpdates(), false);
      assert.deepStrictEqual(service.getStatus(), {
        status: "unsupported",
        version: null,
        channel: "unsupported",
        isStoreManaged: false,
        message: null,
      });
      assert.strictEqual(await service.checkForUpdates(), undefined);
      assert.strictEqual(await service.checkForUpdatesAndInstall(), undefined);
      assert.strictEqual(await service.installDownloadedUpdate(), undefined);
      assert.strictEqual(await service.applySpecificUpdate("C:\\updates\\setup.exe"), undefined);
    } finally {
      service.dispose();
    }
  });

});
