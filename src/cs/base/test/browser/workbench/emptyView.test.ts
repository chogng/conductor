import assert from "assert";

import {
  createEmptyView,
} from "src/cs/workbench/contrib/files/browser/views/emptyView";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/files/browser/emptyView", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("open folder button does not use native title tooltip", () => {
    const view = createEmptyView({
      folderImportSupport: { reason: null, supported: true },
      onImportFiles: () => undefined,
    });

    try {
      const button = view.querySelector<HTMLButtonElement>(".file-list-empty-import-button");
      assert.ok(button);
      assert.equal(button.getAttribute("title"), null);
      assert.equal(button.getAttribute("aria-label"), "Open Folder");
    } finally {
      view.remove();
    }
  });
});
