import { isMacintosh, isWindows } from "src/cs/base/common/platform";
import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import { INativeHostService } from "src/cs/platform/native/common/native";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { REVEAL_IN_OS_COMMAND_ID } from "src/cs/workbench/contrib/files/common/files";
import { revealResourcesInOS, resolveRevealResources } from "src/cs/workbench/contrib/files/electron-browser/fileCommands";

export const REVEAL_IN_OS_LABEL = isWindows
  ? localize("files.revealInWindows", "Reveal in File Explorer")
  : isMacintosh
    ? localize("files.revealInMac", "Reveal in Finder")
  : localize("files.openContainingFolder", "Open Containing Folder");

export const revealInOSHandler = (
  accessor: ServicesAccessor,
  target?: unknown,
): Promise<void> => {
  const nativeHostService = accessor.get(INativeHostService);
  const resources = resolveRevealResources(accessor, target);
  return revealResourcesInOS(resources, nativeHostService);
};

class RevealInOSAction extends Action2 {
  public constructor() {
    super({
      category: localize("files.category", "Files"),
      f1: true,
      id: REVEAL_IN_OS_COMMAND_ID,
      title: REVEAL_IN_OS_LABEL,
      metadata: {
        description: localize("files.revealInOS.description", "Reveal the selected imported file in the operating system file manager."),
      },
    });
  }

  public run(accessor: ServicesAccessor, target?: unknown): Promise<void> {
    return revealInOSHandler(accessor, target);
  }
}

registerAction2(RevealInOSAction);
