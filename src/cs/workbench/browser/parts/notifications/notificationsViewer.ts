import type { IAction } from "src/cs/base/common/actions";
import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { Scrollbar } from "src/cs/base/browser/ui/scrollbar/scrollableElement";
import { LxIcon } from "src/cs/base/common/lxicon";
import type {
  NotificationToastOptions,
  NotificationToastType,
} from "src/cs/workbench/common/notifications";
import { getNotificationActions } from "src/cs/workbench/browser/parts/notifications/notificationsActions";
import { localize } from "src/cs/nls";

export type NotificationRendererOptions = {
  readonly onAction: (action: IAction) => void;
  readonly onClose: () => void;
};

const appendIcon = (
  container: HTMLElement,
  icon: LxIcon,
  size: number,
): void => {
  container.appendChild(createLxIcon({ icon, size }));
};

export class NotificationRenderer implements IDisposable {
  public readonly element: HTMLDivElement;

  private readonly disposables = new DisposableStore();
  private readonly icon: HTMLDivElement;
  private readonly messageScroll: Scrollbar;
  private readonly message: HTMLSpanElement;
  private readonly content: HTMLDivElement;
  private readonly controls: HTMLDivElement;
  private readonly actions: HTMLDivElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly actionDisposables = this.disposables.add(new DisposableStore());

  public constructor(private readonly options: NotificationRendererOptions) {
    this.element = document.createElement("div");
    this.icon = document.createElement("div");
    this.messageScroll = this.disposables.add(new Scrollbar({
      className: "conductor-toast-message-scroll",
      viewportClassName: "conductor-toast-message-viewport",
    }));
    this.message = document.createElement("span");
    this.content = document.createElement("div");
    this.controls = document.createElement("div");
    this.actions = document.createElement("div");
    this.closeButton = document.createElement("button");

    this.icon.className = "conductor-toast-icon";
    this.content.className = "conductor-toast-content";
    this.message.className = "conductor-toast-message";
    this.controls.className = "conductor-toast-controls";
    this.actions.className = "conductor-toast-actions";
    this.closeButton.type = "button";
    this.closeButton.className = "conductor-toast-close";
    this.closeButton.setAttribute("aria-label", localize("notifications.closeToast", "Close toast"));
    appendIcon(this.closeButton, LxIcon.close, 16);

    this.messageScroll.viewport.append(this.message);
    this.content.append(this.messageScroll.element, this.actions);
    this.controls.append(this.closeButton);
    this.element.append(this.icon, this.content, this.controls);
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
    this.actionDisposables.clear();
    this.actions.replaceChildren();

    for (const action of getNotificationActions(options.actions)) {
      const actionButton = document.createElement("button");
      actionButton.type = "button";
      actionButton.className = "conductor-toast-action";
      actionButton.textContent = action.label;
      if (uiMarker) {
        actionButton.setAttribute("data-ui", `${uiMarker}-action`);
      }
      this.actionDisposables.add(addDisposableListener(
        actionButton,
        EventType.CLICK,
        () => this.options.onAction(action),
      ));
      this.actions.appendChild(actionButton);
    }
  }

  private renderUiMarker(uiMarker: string | undefined): void {
    if (uiMarker) {
      this.closeButton.setAttribute("data-ui", `${uiMarker}-close`);
    } else {
      this.closeButton.removeAttribute("data-ui");
    }
  }

  private toSeverityIcon(type: NotificationToastType): LxIcon {
    if (type === "success") return LxIcon.checkCircle;
    if (type === "info") return LxIcon.infoCircle;
    return LxIcon.alertCircle;
  }
}
