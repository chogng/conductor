import type { NotificationToastType } from "src/cs/workbench/services/notification/common/notificationService";

export type Feedback = {
  message: string;
  type: "idle" | "success" | "error";
};

export type NotificationToastState = {
  isVisible: boolean;
  message: string;
  type: NotificationToastType;
};

export const IDLE_FEEDBACK: Feedback = { type: "idle", message: "" };
