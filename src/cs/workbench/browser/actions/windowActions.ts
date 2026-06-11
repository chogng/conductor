import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import {
  INativeHostService,
  type INativeHostService as INativeHostServiceType,
} from "src/cs/platform/native/common/native";
import { WindowCommandId } from "src/cs/workbench/browser/actions/windowCommands";

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

class MinimizeWindowAction extends Action2 {
  public constructor() {
    super({
      id: WindowCommandId.minimizeWindow,
      title: localize("menu_window_minimize", "Minimize Window"),
      f1: true,
      metadata: {
        description: localize("window.minimizeWindowDescription", "Minimize the current window."),
      },
    });
  }

  public run(accessor: ServicesAccessor): void {
    getNativeHostService(accessor)?.minimizeWindow();
  }
}

class ToggleMaximizeWindowAction extends Action2 {
  public constructor() {
    super({
      id: WindowCommandId.toggleMaximizeWindow,
      title: localize("menu_window_maximize", "Maximize / Restore"),
      f1: true,
      metadata: {
        description: localize("window.toggleMaximizeWindowDescription", "Maximize or restore the current window."),
      },
    });
  }

  public async run(accessor: ServicesAccessor): Promise<void> {
    const nativeHostService = getNativeHostService(accessor);
    if (!nativeHostService) {
      return;
    }

    if (await nativeHostService.isMaximized()) {
      nativeHostService.unmaximizeWindow();
      return;
    }

    nativeHostService.maximizeWindow();
  }
}

class CloseWindowAction extends Action2 {
  public constructor() {
    super({
      id: WindowCommandId.closeWindow,
      title: localize("menu_window_close", "Close Window"),
      f1: true,
      metadata: {
        description: localize("window.closeWindowDescription", "Close the current window."),
      },
    });
  }

  public run(accessor: ServicesAccessor): void {
    getNativeHostService(accessor)?.closeWindow();
  }
}

registerAction2(MinimizeWindowAction);
registerAction2(ToggleMaximizeWindowAction);
registerAction2(CloseWindowAction);
