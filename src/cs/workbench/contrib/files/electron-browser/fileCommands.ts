import { URI } from "src/cs/base/common/uri";
import type { INativeHostService } from "src/cs/platform/native/common/native";

export const revealResourcesInOS = (
  resources: readonly URI[],
  nativeHostService: INativeHostService,
): void => {
  for (const resource of resources) {
    if (resource.scheme !== "file") {
      continue;
    }

    nativeHostService.showItemInFolder(resource.fsPath);
  }
};
