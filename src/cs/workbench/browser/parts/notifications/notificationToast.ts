import { TimeoutTimer } from "src/cs/base/common/async";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import {
  normalizeLxIconSvgMarkup,
  type LxIconDefinition,
} from "src/cs/base/browser/ui/lxicon/lxicon";
import { LxIcon } from "src/cs/base/common/lxicon";
import type {
  NotificationToastOptions,
  NotificationToastPosition,
  NotificationToastType,
} from "src/cs/workbench/services/notification/common/notificationService";
import {
  getPrimaryNotificationAction,
  runNotificationAction,
} from "src/cs/workbench/browser/parts/notifications/notificationsActions";

import "src/cs/workbench/browser/parts/notifications/media/notificationToast.css";

const DEFAULT_TOAST_DURATION = 5000;
const TOAST_CLOSE_ANIMATION_MS = 300;

const appendIcon = (
  container: HTMLElement,
  icon: LxIconDefinition,
  size: number,
) => {
  const iconElement = document.createElement("span");
  iconElement.className = "ui-lxicon";
  iconElement.style.width = `${size}px`;
  iconElement.style.height = `${size}px`;
  iconElement.innerHTML = normalizeLxIconSvgMarkup(icon);
  container.appendChild(iconElement);
};

const getToastIcon = (type: NotificationToastType): LxIconDefinition => {
  if (type === "success") return LxIcon.checkCircle;
  if (type === "info") return LxIcon.infoCircle;
  return LxIcon.alertCircle;
};

const getExtraClassNames = (value: unknown): string[] =>
  typeof value === "string"
    ? value
        .split(/\s+/)
        .map(part => part.trim())
        .filter(Boolean)
    : [];

const getTypeClassName = (type: NotificationToastType): string =>
  `conductor-toast--${type}`;

export class NotificationToast implements IDisposable {
  private readonly disposables = new DisposableStore();
  private readonly root: HTMLDivElement;
  private readonly iconContainer: HTMLDivElement;
  private readonly messageElement: HTMLSpanElement;
  private readonly controls: HTMLDivElement;
  private readonly actionButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
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
    this.root = document.createElement("div");
    this.iconContainer = document.createElement("div");
    this.messageElement = document.createElement("span");
    this.controls = document.createElement("div");
    this.actionButton = document.createElement("button");
    this.closeButton = document.createElement("button");

    this.iconContainer.className = "conductor-toast-icon";
    this.messageElement.className = "conductor-toast-message";
    this.controls.className = "conductor-toast-controls";
    this.actionButton.type = "button";
    this.actionButton.className = "conductor-toast-action";
    this.closeButton.type = "button";
    this.closeButton.className = "conductor-toast-close";
    this.closeButton.setAttribute("aria-label", "Close toast");
    appendIcon(this.closeButton, LxIcon.close, 16);

    this.controls.append(this.actionButton, this.closeButton);
    this.root.append(this.iconContainer, this.messageElement, this.controls);

    this.root.addEventListener("mouseenter", this.pauseAutoClose);
    this.root.addEventListener("mouseleave", this.resumeAutoClose);
    this.root.addEventListener("focusin", this.pauseAutoClose);
    this.root.addEventListener("focusout", this.handleFocusOut);
    this.actionButton.addEventListener("click", this.handleAction);
    this.closeButton.addEventListener("click", this.handleClose);
    window.addEventListener("resize", this.updatePosition);

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
    this.root.removeEventListener("mouseenter", this.pauseAutoClose);
    this.root.removeEventListener("mouseleave", this.resumeAutoClose);
    this.root.removeEventListener("focusin", this.pauseAutoClose);
    this.root.removeEventListener("focusout", this.handleFocusOut);
    this.actionButton.removeEventListener("click", this.handleAction);
    this.closeButton.removeEventListener("click", this.handleClose);
    window.removeEventListener("resize", this.updatePosition);
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
      this.closeButton.setAttribute("data-ui", `${uiMarker}-close`);
    } else {
      this.root.removeAttribute("data-ui");
      this.closeButton.removeAttribute("data-ui");
    }

    this.iconContainer.replaceChildren();
    appendIcon(this.iconContainer, getToastIcon(type), 20);
    this.messageElement.textContent = options.message;
    if (options.message.includes("\n")) {
      this.messageElement.tabIndex = 0;
    } else {
      this.messageElement.removeAttribute("tabindex");
    }

    const action = getPrimaryNotificationAction(options.actions);
    if (action) {
      this.actionButton.hidden = false;
      this.actionButton.textContent = action.label;
      if (uiMarker) {
        this.actionButton.setAttribute("data-ui", `${uiMarker}-action`);
      } else {
        this.actionButton.removeAttribute("data-ui");
      }
    } else {
      this.actionButton.hidden = true;
      this.actionButton.textContent = "";
      this.actionButton.removeAttribute("data-ui");
    }
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
    this.root.style.transform = "";

    if (position === "fixed") {
      this.root.style.position = "fixed";
      this.root.style.bottom = "32px";
      this.root.style.left = "50%";
      this.root.style.transform = "translateX(-50%)";
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

  private readonly handleAction = (): void => {
    const action = getPrimaryNotificationAction(this.options?.actions);
    if (!action) {
      return;
    }

    void runNotificationAction(action, this.options);
  };

  private readonly handleClose = (): void => {
    this.options?.onClose?.();
    this.hide();
  };
}

export default NotificationToast;
