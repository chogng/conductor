import { NotificationToast } from "src/cs/workbench/browser/parts/notifications/notificationsToasts";
import {
  DEFAULT_NOTIFICATION_TOAST_ID,
  type NotificationToastOptions,
} from "src/cs/workbench/services/notification/common/notificationService";

const notificationToasts = new Map<string, NotificationToast>();

const getNotificationToast = (id: string): NotificationToast => {
  let toast = notificationToasts.get(id);
  if (!toast) {
    toast = new NotificationToast();
    notificationToasts.set(id, toast);
  }
  return toast;
};

export const showNotificationToast = (options: NotificationToastOptions): void => {
  getNotificationToast(options.id ?? DEFAULT_NOTIFICATION_TOAST_ID).show(options);
};

export const hideNotificationToast = (id = DEFAULT_NOTIFICATION_TOAST_ID): void => {
  notificationToasts.get(id)?.hide();
};

export const disposeNotificationToast = (id = DEFAULT_NOTIFICATION_TOAST_ID): void => {
  const toast = notificationToasts.get(id);
  if (!toast) {
    return;
  }

  toast.dispose();
  notificationToasts.delete(id);
};

export const disposeNotificationToasts = (): void => {
  for (const toast of notificationToasts.values()) {
    toast.dispose();
  }
  notificationToasts.clear();
};
