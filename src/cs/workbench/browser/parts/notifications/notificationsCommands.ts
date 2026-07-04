import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { CommandsRegistry, type ICommandService } from "src/cs/platform/commands/common/commands";
import { WorkbenchNotificationCommandIds } from "src/cs/workbench/common/notifications";

export interface INotificationsToastController {
  readonly isFocused: boolean;
  readonly isVisible: boolean;

  hide(): void;
  focus(): void;
  focusNext(): void;
  focusPrevious(): void;
  focusFirst(): void;
  focusLast(): void;
}

export function registerNotificationCommands(
  toasts: INotificationsToastController,
  commandService: ICommandService,
): IDisposable {
  const disposables = new DisposableStore();

  disposables.add(CommandsRegistry.registerCommand(WorkbenchNotificationCommandIds.hideToast, () => {
    toasts.hide();
  }));
  disposables.add(CommandsRegistry.registerCommand(WorkbenchNotificationCommandIds.focusToast, () => {
    toasts.focus();
  }));
  disposables.add(CommandsRegistry.registerCommand(WorkbenchNotificationCommandIds.focusNextToast, () => {
    toasts.focusNext();
  }));
  disposables.add(CommandsRegistry.registerCommand(WorkbenchNotificationCommandIds.focusPreviousToast, () => {
    toasts.focusPrevious();
  }));
  disposables.add(CommandsRegistry.registerCommand(WorkbenchNotificationCommandIds.focusFirstToast, () => {
    toasts.focusFirst();
  }));
  disposables.add(CommandsRegistry.registerCommand(WorkbenchNotificationCommandIds.focusLastToast, () => {
    toasts.focusLast();
  }));

  disposables.add(addDisposableListener(window, EventType.KEY_DOWN, event => {
    if (!toasts.isVisible) {
      return;
    }

    switch (event.key) {
      case "Escape":
        void commandService.executeCommand(WorkbenchNotificationCommandIds.hideToast);
        break;
      case "ArrowDown":
        if (!toasts.isFocused) return;
        void commandService.executeCommand(WorkbenchNotificationCommandIds.focusNextToast);
        break;
      case "ArrowUp":
        if (!toasts.isFocused) return;
        void commandService.executeCommand(WorkbenchNotificationCommandIds.focusPreviousToast);
        break;
      case "Home":
        if (!toasts.isFocused) return;
        void commandService.executeCommand(WorkbenchNotificationCommandIds.focusFirstToast);
        break;
      case "End":
        if (!toasts.isFocused) return;
        void commandService.executeCommand(WorkbenchNotificationCommandIds.focusLastToast);
        break;
      default:
        return;
    }

    event.preventDefault();
    event.stopPropagation();
  }));

  return disposables;
}
