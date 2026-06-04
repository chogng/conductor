import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { CommandsRegistry, type ICommandService } from "src/cs/platform/commands/common/commands";

export const HIDE_NOTIFICATION_TOAST = "notifications.hideToasts";
export const FOCUS_NOTIFICATION_TOAST = "notifications.focusToasts";
export const FOCUS_NEXT_NOTIFICATION_TOAST = "notifications.focusNextToast";
export const FOCUS_PREVIOUS_NOTIFICATION_TOAST = "notifications.focusPreviousToast";
export const FOCUS_FIRST_NOTIFICATION_TOAST = "notifications.focusFirstToast";
export const FOCUS_LAST_NOTIFICATION_TOAST = "notifications.focusLastToast";

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

  disposables.add(CommandsRegistry.registerCommand(HIDE_NOTIFICATION_TOAST, () => {
    toasts.hide();
  }));
  disposables.add(CommandsRegistry.registerCommand(FOCUS_NOTIFICATION_TOAST, () => {
    toasts.focus();
  }));
  disposables.add(CommandsRegistry.registerCommand(FOCUS_NEXT_NOTIFICATION_TOAST, () => {
    toasts.focusNext();
  }));
  disposables.add(CommandsRegistry.registerCommand(FOCUS_PREVIOUS_NOTIFICATION_TOAST, () => {
    toasts.focusPrevious();
  }));
  disposables.add(CommandsRegistry.registerCommand(FOCUS_FIRST_NOTIFICATION_TOAST, () => {
    toasts.focusFirst();
  }));
  disposables.add(CommandsRegistry.registerCommand(FOCUS_LAST_NOTIFICATION_TOAST, () => {
    toasts.focusLast();
  }));

  disposables.add(addDisposableListener(window, EventType.KEY_DOWN, event => {
    if (!toasts.isVisible) {
      return;
    }

    switch (event.key) {
      case "Escape":
        void commandService.executeCommand(HIDE_NOTIFICATION_TOAST);
        break;
      case "ArrowDown":
        if (!toasts.isFocused) return;
        void commandService.executeCommand(FOCUS_NEXT_NOTIFICATION_TOAST);
        break;
      case "ArrowUp":
        if (!toasts.isFocused) return;
        void commandService.executeCommand(FOCUS_PREVIOUS_NOTIFICATION_TOAST);
        break;
      case "Home":
        if (!toasts.isFocused) return;
        void commandService.executeCommand(FOCUS_FIRST_NOTIFICATION_TOAST);
        break;
      case "End":
        if (!toasts.isFocused) return;
        void commandService.executeCommand(FOCUS_LAST_NOTIFICATION_TOAST);
        break;
      default:
        return;
    }

    event.preventDefault();
    event.stopPropagation();
  }));

  return disposables;
}
