import type { NotificationPresentationType } from "src/cs/workbench/services/notification/common/notificationService";

export type Feedback = {
  message: string;
  type: "idle" | "success" | "error";
};

export type NotificationFeedbackState = {
  isVisible: boolean;
  message: string;
  type: NotificationPresentationType;
};

export const IDLE_FEEDBACK: Feedback = { type: "idle", message: "" };
