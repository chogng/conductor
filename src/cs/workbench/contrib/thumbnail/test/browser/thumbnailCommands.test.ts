import assert from "assert";

import type { ServicesAccessor, ServiceIdentifier } from "src/cs/platform/instantiation/common/instantiation";
import { ExplorerService } from "src/cs/workbench/contrib/files/browser/explorerService";
import { IExplorerService } from "src/cs/workbench/contrib/files/common/explorer";
import { toggleThumbnailViewHandler } from "src/cs/workbench/contrib/thumbnail/browser/thumbnailCommands";

suite("workbench/contrib/thumbnail/test/browser/thumbnailCommands", () => {
  test("thumbnail command toggles explorer layout state", () => {
    const explorerService = new ExplorerService();
    const accessor = createAccessor([
      [IExplorerService, explorerService],
    ]);

    toggleThumbnailViewHandler(accessor);

    assert.equal(explorerService.viewLayout, "thumbnail");
  });
});

function createAccessor(
  services: readonly (readonly [ServiceIdentifier<unknown>, unknown])[],
): ServicesAccessor {
  const values = new Map<ServiceIdentifier<unknown>, unknown>(services);
  return {
    get: <T>(id: ServiceIdentifier<T>): T =>
      values.get(id as ServiceIdentifier<unknown>) as T,
  };
}
