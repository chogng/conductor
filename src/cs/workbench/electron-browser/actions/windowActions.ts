import { Disposable } from "src/cs/base/common/lifecycle";
import { INativeHostService, type INativeHostService as INativeHostServiceType } from "src/cs/platform/native/common/native";
import {
  registerWorkbenchContribution2,
  WorkbenchPhase,
  type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
  ICommandService,
  type ICommandService as ICommandServiceType,
} from "src/cs/workbench/services/commands/common/commands";
import { WindowCommandIds } from "src/cs/workbench/common/windowCommands";

export class WindowActionsContribution extends Disposable implements IWorkbenchContribution {
  constructor(
    @ICommandService commandService: ICommandServiceType,
    @INativeHostService nativeHostService: INativeHostServiceType,
  ) {
    super();

    this._register(commandService.registerCommand(WindowCommandIds.toggleDevTools, () => nativeHostService.toggleDevTools()));
    this._register(commandService.registerCommand(WindowCommandIds.reloadWindow, () => nativeHostService.reloadWindow()));
    this._register(commandService.registerCommand(WindowCommandIds.closeWindow, () => nativeHostService.closeWindow()));
    this._register(commandService.registerCommand(WindowCommandIds.minimizeWindow, () => nativeHostService.minimizeWindow()));
    this._register(commandService.registerCommand(WindowCommandIds.toggleWindowMaximized, () => nativeHostService.toggleWindowMaximized()));
    this._register({ dispose: installDeveloperKeybindings(commandService) });
  }
}

function installDeveloperKeybindings(commandService: ICommandServiceType): () => void {
  const listener = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.metaKey) return;

    const key = String(event.key || "").toLowerCase();
    const shouldToggleDevTools =
      key === "f12" || (event.ctrlKey && event.shiftKey && key === "i");

    if (!shouldToggleDevTools) return;

    event.preventDefault();
    commandService.executeCommand(WindowCommandIds.toggleDevTools);
  };

  window.addEventListener("keydown", listener);
  return () => window.removeEventListener("keydown", listener);
}

registerWorkbenchContribution2(
  "workbench.electronBrowser.windowActions",
  WindowActionsContribution,
  WorkbenchPhase.BlockStartup,
);
