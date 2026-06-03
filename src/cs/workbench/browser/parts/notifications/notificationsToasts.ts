import { TimeoutTimer } from "src/cs/base/common/async";
import type { IAction } from "src/cs/base/common/actions";
import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import type {
  NotificationToastOptions,
  NotificationToastPosition,
  NotificationToastType,
} from "src/cs/workbench/services/notification/common/notificationService";
import {
  DEFAULT_NOTIFICATION_TOAST_ID,
} from "src/cs/workbench/services/notification/common/notificationService";
import { runNotificationAction } from "src/cs/workbench/browser/parts/notifications/notificationsActions";
import { NotificationRenderer } from "src/cs/workbench/browser/parts/notifications/notificationsViewer";

import "src/cs/workbench/browser/parts/notifications/media/notificationsToasts.css";

const DEFAULT_TOAST_DURATION = 5000;
const TOAST_CLOSE_ANIMATION_MS = 300;

const notificationToasts = new Map<string, NotificationToast>();

const getExtraClassNames = (value: unknown): string[] =>
  typeof value === "string"
    ? value
        .split(/\s+/)
        .map(part => part.trim())
        .filter(Boolean)
    : [];

const getTypeClassName = (type: NotificationToastType): string =>
  `conductor-toast--${type}`;

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

const getNotificationToast = (id: string): NotificationToast => {
  let toast = notificationToasts.get(id);
  if (!toast) {
    toast = new NotificationToast();
    notificationToasts.set(id, toast);
  }
  return toast;
};

export class NotificationToast implements IDisposable {
  private readonly disposables = new DisposableStore();
  private readonly renderer: NotificationRenderer;
  private readonly root: HTMLDivElement;
  private readonly autoCloseTimer = new TimeoutTimer();
  private readonly closeTimer = new TimeoutTimer();
  private readonly hideTimer = new TimeoutTimer();
  private autoCloseRemainingMs = DEFAULT_TOAST_DURATION;
  private autoCloseStartedAt: number | null = null;
  private isAutoClosePaused = false;
  private isDisposed = false;
  private isVisible = false;
  private options: NotificationToastOptions | null = null;

  public constructor(private readonly host: HTMLElement = document.body) {
    this.renderer = this.disposables.add(new NotificationRenderer({
      onAction: this.handleAction,
      onClose: this.handleClose,
    }));
    this.root = this.renderer.element;

    this.disposables.add(addDisposableListener(
      this.root,
      EventType.MOUSE_ENTER,
      this.pauseAutoClose,
    ));
    this.disposables.add(addDisposableListener(
      this.root,
      EventType.MOUSE_LEAVE,
      this.resumeAutoClose,
    ));
    this.disposables.add(addDisposableListener(
      this.root,
      EventType.FOCUS_IN,
      this.pauseAutoClose,
    ));
    this.disposables.add(addDisposableListener(
      this.root,
      EventType.FOCUS_OUT,
      this.handleFocusOut,
    ));
    this.disposables.add(addDisposableListener(
      window,
      EventType.RESIZE,
      this.updatePosition,
    ));
    this.disposables.add(this.autoCloseTimer);
    this.disposables.add(this.closeTimer);
    this.disposables.add(this.hideTimer);
  }

  public show(options: NotificationToastOptions): void {
    if (this.isDisposed) return;

    this.options = options;
    this.isVisible = true;
    this.closeTimer.cancel();
    this.hideTimer.cancel();
    this.updateContent(options);
    this.updatePosition();

    if (!this.root.parentElement) {
      this.host.appendChild(this.root);
    }

    this.root.className = this.getClassName(options, false);
    this.root.dataset.state = "open";
    this.renderer.layout();
    this.startAutoClose(options.duration ?? DEFAULT_TOAST_DURATION);
  }

  public hide(): void {
    if (this.isDisposed || !this.root.parentElement) {
      this.isVisible = false;
      return;
    }

    this.isVisible = false;
    this.autoCloseTimer.cancel();
    this.closeTimer.cancelAndSet(() => {
      if (!this.options) return;
      this.root.className = this.getClassName(this.options, true);
      this.root.dataset.state = "closing";
      this.hideTimer.cancelAndSet(() => {
        this.root.remove();
        this.root.dataset.state = "closed";
      }, TOAST_CLOSE_ANIMATION_MS);
    }, 0);
  }

  public dispose(): void {
    this.isDisposed = true;
    this.root.remove();
    this.disposables.dispose();
  }

  private updateContent(options: NotificationToastOptions): void {
    const type = options.type ?? "success";
    const uiMarker =
      typeof options.dataUi === "string" && options.dataUi.trim()
        ? options.dataUi.trim()
        : undefined;
    const isUrgent = type === "error" || type === "warning";

    this.root.setAttribute("role", isUrgent ? "alert" : "status");
    this.root.setAttribute("aria-live", isUrgent ? "assertive" : "polite");
    this.root.setAttribute("aria-atomic", "true");
    this.root.setAttribute("data-style", "toast");
    this.root.setAttribute("data-type", type);

    if (uiMarker) {
      this.root.setAttribute("data-ui", uiMarker);
    } else {
      this.root.removeAttribute("data-ui");
    }

    this.renderer.render(options);
  }

  private getClassName(options: NotificationToastOptions, isClosing: boolean): string {
    const position = options.position ?? "absolute";
    const positionClass = position === "fixed"
      ? "conductor-toast-fixed"
      : "conductor-toast-absolute";
    const type = options.type ?? "success";

    return [
      "conductor-toast",
      isClosing ? "conductor-toast-closing" : "conductor-toast-opening",
      positionClass,
      getTypeClassName(type),
      ...getExtraClassNames(options.className),
    ].join(" ");
  }

  private readonly updatePosition = (): void => {
    if (!this.options) return;

    const position = this.options.position ?? "absolute";

    this.root.style.position = "";
    this.root.style.bottom = "";
    this.root.style.left = "";
    this.root.style.right = "";
    this.root.style.transform = "";

    if (position === "fixed") {
      this.root.style.position = "fixed";
      this.root.style.bottom = "32px";
      this.root.style.right = "32px";
    }
  };

  private startAutoClose(duration: number): void {
    this.autoCloseTimer.cancel();
    this.isAutoClosePaused = false;
    this.autoCloseStartedAt = null;
    this.autoCloseRemainingMs = duration;

    if (duration === Number.POSITIVE_INFINITY || duration <= 0) return;

    this.autoCloseStartedAt = Date.now();
    this.autoCloseTimer.cancelAndSet(() => {
      this.options?.onClose?.();
      this.hide();
    }, duration);
  }

  private readonly pauseAutoClose = (): void => {
    const duration = this.options?.duration ?? DEFAULT_TOAST_DURATION;
    if (
      !this.isVisible ||
      this.isAutoClosePaused ||
      duration === Number.POSITIVE_INFINITY
    ) {
      return;
    }

    this.isAutoClosePaused = true;
    if (this.autoCloseStartedAt != null) {
      const elapsed = Date.now() - this.autoCloseStartedAt;
      this.autoCloseRemainingMs = Math.max(0, this.autoCloseRemainingMs - elapsed);
    }
    this.autoCloseTimer.cancel();
  };

  private readonly resumeAutoClose = (): void => {
    const duration = this.options?.duration ?? DEFAULT_TOAST_DURATION;
    if (
      !this.isVisible ||
      !this.isAutoClosePaused ||
      duration === Number.POSITIVE_INFINITY
    ) {
      return;
    }

    this.isAutoClosePaused = false;
    if (this.autoCloseRemainingMs <= 0) return;
    this.autoCloseStartedAt = Date.now();
    this.autoCloseTimer.cancelAndSet(() => {
      this.options?.onClose?.();
      this.hide();
    }, this.autoCloseRemainingMs);
  };

  private readonly handleFocusOut = (event: FocusEvent): void => {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && this.root.contains(relatedTarget)) {
      return;
    }
    this.resumeAutoClose();
  };

  private readonly handleAction = (action: IAction): void => {
    void runNotificationAction(action, this.options);
  };

  private readonly handleClose = (): void => {
    this.options?.onClose?.();
    this.hide();
  };
}
