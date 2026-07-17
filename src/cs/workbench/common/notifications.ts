import type { IAction } from "src/cs/base/common/actions";
import type { IStatusMessageOptions } from "src/cs/platform/notification/common/notification";

export const DEFAULT_NOTIFICATION_TOAST_ID = "workbench.notificationToast";

export const HIDE_NOTIFICATION_TOAST_COMMAND_ID = "notifications.hideToasts";
export const FOCUS_NOTIFICATION_TOAST_COMMAND_ID = "notifications.focusToasts";
export const FOCUS_NEXT_NOTIFICATION_TOAST_COMMAND_ID = "notifications.focusNextToast";
export const FOCUS_PREVIOUS_NOTIFICATION_TOAST_COMMAND_ID = "notifications.focusPreviousToast";
export const FOCUS_FIRST_NOTIFICATION_TOAST_COMMAND_ID = "notifications.focusFirstToast";
export const FOCUS_LAST_NOTIFICATION_TOAST_COMMAND_ID = "notifications.focusLastToast";

export type NotificationToastType = "success" | "error" | "warning" | "info";
export type NotificationToastPosition = "absolute" | "fixed";

export type NotificationToastOptions = {
  readonly actions?: readonly IAction[];
  readonly className?: string;
  readonly dataUi?: string;
  readonly duration?: number;
  readonly id?: string;
  readonly message: string;
  readonly onClose?: () => void;
  readonly position?: NotificationToastPosition;
  readonly type?: NotificationToastType;
};

export type NotificationToastEvent =
  | { readonly kind: "show"; readonly options: NotificationToastOptions }
  | { readonly kind: "hide"; readonly id?: string }
  | { readonly kind: "dispose"; readonly id?: string }
  | { readonly kind: "disposeAll" };

export type NotificationStatusMessage = {
  readonly message: string;
  readonly options?: IStatusMessageOptions;
};

export type NotificationStatusMessageEvent =
  | { readonly kind: "add"; readonly item: NotificationStatusMessage }
  | { readonly kind: "remove"; readonly item: NotificationStatusMessage };
