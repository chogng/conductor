import type { IAction } from "src/cs/base/common/actions";
import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import {
  normalizeLxIconSvgMarkup,
  type LxIconDefinition,
} from "src/cs/base/browser/ui/lxicon/lxicon";
import { Scrollbar } from "src/cs/base/browser/ui/scrollbar/scrollbar";
import { LxIcon } from "src/cs/base/common/lxicon";
import type {
  NotificationToastOptions,
  NotificationToastType,
} from "src/cs/workbench/services/notification/common/notificationService";
import { getPrimaryNotificationAction } from "src/cs/workbench/browser/parts/notifications/notificationsActions";
import { localize } from "src/cs/nls";

export type NotificationRendererOptions = {
  readonly onAction: (action: IAction) => void;
  readonly onClose: () => void;
};

const appendIcon = (
  container: HTMLElement,
  icon: LxIconDefinition,
  size: number,
): void => {
  const iconElement = document.createElement("span");
  iconElement.className = "ui-lxicon";
  iconElement.style.width = `${size}px`;
  iconElement.style.height = `${size}px`;
  iconElement.innerHTML = normalizeLxIconSvgMarkup(icon);
  container.appendChild(iconElement);
};

export class NotificationRenderer implements IDisposable {
  public readonly element: HTMLDivElement;

  private readonly disposables = new DisposableStore();
  private readonly icon: HTMLDivElement;
  private readonly messageScroll: Scrollbar;
  private readonly message: HTMLSpanElement;
  private readonly controls: HTMLDivElement;
  private readonly actionButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private currentAction: IAction | undefined;

  public constructor(private readonly options: NotificationRendererOptions) {
    this.element = document.createElement("div");
    this.icon = document.createElement("div");
    this.messageScroll = this.disposables.add(new Scrollbar({
      className: "conductor-toast-message-scroll",
      viewportClassName: "conductor-toast-message-viewport",
    }));
    this.message = document.createElement("span");
    this.controls = document.createElement("div");
    this.actionButton = document.createElement("button");
    this.closeButton = document.createElement("button");

    this.icon.className = "conductor-toast-icon";
    this.message.className = "conductor-toast-message";
    this.controls.className = "conductor-toast-controls";
    this.actionButton.type = "button";
    this.actionButton.className = "conductor-toast-action";
    this.closeButton.type = "button";
    this.closeButton.className = "conductor-toast-close";
    this.closeButton.setAttribute("aria-label", localize("notifications.closeToast", "Close toast"));
    appendIcon(this.closeButton, LxIcon.close, 16);

    this.messageScroll.viewport.append(this.message);
    this.controls.append(this.actionButton, this.closeButton);
    this.element.append(this.icon, this.messageScroll.element, this.controls);

    this.disposables.add(addDisposableListener(
      this.actionButton,
      EventType.CLICK,
      () => {
        if (this.currentAction) {
          this.options.onAction(this.currentAction);
        }
      },
    ));
    this.disposables.add(addDisposableListener(
      this.closeButton,
      EventType.CLICK,
      () => this.options.onClose(),
    ));
  }

  public render(options: NotificationToastOptions): void {
    const type = options.type ?? "success";
    const uiMarker =
      typeof options.dataUi === "string" && options.dataUi.trim()
        ? options.dataUi.trim()
        : undefined;

    this.renderSeverity(type);
    this.renderMessage(options.message);
    this.renderAction(options, uiMarker);
    this.renderUiMarker(uiMarker);
  }

  public layout(): void {
    this.messageScroll.layout();
  }

  public dispose(): void {
    this.disposables.dispose();
  }

  private renderSeverity(type: NotificationToastType): void {
    this.icon.replaceChildren();
    appendIcon(this.icon, this.toSeverityIcon(type), 20);
  }

  private renderMessage(message: string): void {
    this.message.textContent = message;
    if (message.includes("\n")) {
      this.messageScroll.viewport.tabIndex = 0;
    } else {
      this.messageScroll.viewport.removeAttribute("tabindex");
    }
    this.messageScroll.layout();
  }

  private renderAction(
    options: NotificationToastOptions,
    uiMarker: string | undefined,
  ): void {
    this.currentAction = getPrimaryNotificationAction(options.actions);

    if (this.currentAction) {
      this.actionButton.hidden = false;
      this.actionButton.textContent = this.currentAction.label;
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

  private renderUiMarker(uiMarker: string | undefined): void {
    if (uiMarker) {
      this.closeButton.setAttribute("data-ui", `${uiMarker}-close`);
    } else {
      this.closeButton.removeAttribute("data-ui");
    }
  }

  private toSeverityIcon(type: NotificationToastType): LxIconDefinition {
    if (type === "success") return LxIcon.checkCircle;
    if (type === "info") return LxIcon.infoCircle;
    return LxIcon.alertCircle;
  }
}
