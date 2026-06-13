import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import {
  INativeHostService,
  type INativeHostService as INativeHostServiceType,
} from "src/cs/platform/native/common/native";

const getNativeHostService = (
  accessor: ServicesAccessor,
): INativeHostServiceType | undefined =>
  accessor.get(INativeHostService) as INativeHostServiceType | undefined;

export const installWindowDeveloperKeybindings = (
  toggleDevTools: () => void,
): (() => void) => {
  const listener = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.metaKey) return;

    const key = String(event.key || "").toLowerCase();
    if (key !== "f12" && !(event.ctrlKey && event.shiftKey && key === "i")) {
      return;
    }

    event.preventDefault();
    toggleDevTools();
  };

  window.addEventListener("keydown", listener);
  return () => window.removeEventListener("keydown", listener);
};

class CloseWindowAction extends Action2 {
  public static readonly ID = "workbench.action.closeWindow";

  public constructor() {
    super({
      id: CloseWindowAction.ID,
      title: localize("menu.window.close", "Close Window"),
      f1: true,
      metadata: {
        description: localize("window.closeWindowDescription", "Close the current window."),
      },
    });
  }

  public async run(accessor: ServicesAccessor): Promise<void> {
    await getNativeHostService(accessor)?.closeWindow();
  }
}

registerAction2(CloseWindowAction);
