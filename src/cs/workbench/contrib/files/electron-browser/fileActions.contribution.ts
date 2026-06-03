import { isWindows } from "src/cs/base/common/platform";
import { URI } from "src/cs/base/common/uri";
import { localize } from "src/cs/nls";
import {
  INativeHostService,
  type INativeHostService as INativeHostServiceType,
} from "src/cs/platform/native/common/native";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { revealResourcesInOS } from "src/cs/workbench/contrib/files/electron-browser/fileCommands";

export const REVEAL_IN_OS_COMMAND_ID = "revealFileInOS";
export const REVEAL_IN_OS_LABEL = isWindows
  ? localize("files.revealInWindows", "Reveal in File Explorer")
  : localize("files.openContainingFolder", "Open Containing Folder");

export const revealInOSHandler = (
  accessor: ServicesAccessor,
  resources: readonly URI[],
): void => {
  const nativeHostService = accessor.get(INativeHostService) as INativeHostServiceType;
  revealResourcesInOS(resources, nativeHostService);
};
