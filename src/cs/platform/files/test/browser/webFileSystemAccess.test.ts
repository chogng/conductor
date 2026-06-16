import assert from "assert";

import {
  getFolderImportSupport,
} from "../../browser/webFileSystemAccess.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("platform/files/browser/webFileSystemAccess", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("supported when WebAssembly and a folder picker are available", () => {
    assert.deepEqual(
      getFolderImportSupport({ canPickFolder: true, hasWebAssembly: true }),
      { reason: null, supported: true },
    );
  });

  test("reports no-webassembly when wasm compilation is unavailable", () => {
    assert.deepEqual(
      getFolderImportSupport({ canPickFolder: true, hasWebAssembly: false }),
      { reason: "no-webassembly", supported: false },
    );
  });

  test("reports no-picker when neither File System Access nor input fallback exists", () => {
    assert.deepEqual(
      getFolderImportSupport({ canPickFolder: false, hasWebAssembly: true }),
      { reason: "no-picker", supported: false },
    );
  });

  test("WebAssembly failure takes precedence over a missing picker", () => {
    assert.deepEqual(
      getFolderImportSupport({ canPickFolder: false, hasWebAssembly: false }),
      { reason: "no-webassembly", supported: false },
    );
  });
});
