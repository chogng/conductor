import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { NotificationStatusMessage } from "src/cs/workbench/common/notifications";

export class NotificationStatus implements IDisposable {
  public readonly element = document.createElement("div");

  private readonly message = document.createElement("span");
  private currentItem: NotificationStatusMessage | undefined;
  private isDisposed = false;

  public constructor() {
    this.element.className = "workbench_notifications_status";
    this.element.hidden = true;
    this.element.setAttribute("role", "status");
    this.element.setAttribute("aria-live", "polite");
    this.element.setAttribute("aria-atomic", "true");
    this.message.className = "workbench_notifications_status_message";
    this.element.append(this.message);
  }

  public show(item: NotificationStatusMessage): void {
    if (this.isDisposed) {
      return;
    }

    this.currentItem = item;
    this.message.textContent = item.message;
    this.element.hidden = false;
  }

  public hide(item?: NotificationStatusMessage): void {
    if (item && this.currentItem !== item) {
      return;
    }

    this.currentItem = undefined;
    this.message.textContent = "";
    this.element.hidden = true;
  }

  public dispose(): void {
    this.isDisposed = true;
    this.element.remove();
  }
}
