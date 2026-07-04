import type { IAction } from "src/cs/base/common/actions";
import { Emitter, Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  INotificationService as PlatformNotificationService,
  NoOpProgress,
  Severity,
  type INotificationService,
  type INotification,
  type INotificationActions,
  type INotificationHandle,
  type INotificationProgress,
  type INotificationSource,
  type INotificationSourceFilter,
  type IPromptChoice,
  type IPromptChoiceWithMenu,
  type IPromptOptions,
  type IStatusHandle,
  type IStatusMessageOptions,
  type INotificationPresentationOptions,
  type NotificationMessage,
  type NotificationsFilter,
} from "src/cs/platform/notification/common/notification";
import {
  DEFAULT_NOTIFICATION_TOAST_ID,
  type NotificationStatusMessage,
  type NotificationStatusMessageEvent,
  type NotificationToastEvent,
  type NotificationToastOptions,
  type NotificationToastType,
} from "src/cs/workbench/common/notifications";

export {
  INotificationService,
  NoOpNotification,
  NoOpProgress,
  NotificationPriority,
  NotificationsFilter,
  Severity,
  isNotificationSource,
  withSeverityPrefix,
  type INotification,
  type INotificationActions,
  type INotificationHandle,
  type INotificationProgress,
  type INotificationProgressProperties,
  type INotificationProperties,
  type INotificationPresentationOptions,
  type INotificationSource,
  type INotificationSourceFilter,
  type IPromptChoice,
  type IPromptChoiceWithMenu,
  type IPromptOptions,
  type IStatusHandle,
  type IStatusMessageOptions,
  NeverShowAgainScope,
  type NotificationMessage,
} from "src/cs/platform/notification/common/notification";

class ToastNotificationHandle implements INotificationHandle {
  private readonly onDidCloseEmitter = new Emitter<void>();
  private readonly onDidChangeVisibilityEmitter = new Emitter<boolean>();
  private isClosed = false;

  public readonly onDidClose = this.onDidCloseEmitter.event;
  public readonly onDidChangeVisibility = this.onDidChangeVisibilityEmitter.event;
  public readonly progress: INotificationProgress = new NoOpProgress();

  public constructor(
    private readonly service: NotificationService,
    private readonly id: string,
    private notification: INotification,
  ) {}

  public updateSeverity(severity: Severity): void {
    if (this.isClosed) return;
    this.notification = { ...this.notification, severity };
    this.service.showNotification(this.id, this.notification, () => this.close());
  }

  public updateMessage(message: NotificationMessage): void {
    if (this.isClosed) return;
    this.notification = { ...this.notification, message };
    this.service.showNotification(this.id, this.notification, () => this.close());
  }

  public updateActions(actions?: INotificationActions): void {
    if (this.isClosed) return;
    this.notification = { ...this.notification, actions };
    this.service.showNotification(this.id, this.notification, () => this.close());
  }

  public close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.service.closeNotification(this.id);
    this.onDidChangeVisibilityEmitter.fire(false);
    this.onDidCloseEmitter.fire();
    this.onDidCloseEmitter.dispose();
    this.onDidChangeVisibilityEmitter.dispose();
  }
}

export class NotificationService extends Disposable implements INotificationService {
  public declare readonly _serviceBrand: undefined;

  public readonly onDidChangeFilter = Event.None as Event<void>;
  private readonly onDidChangeToastEmitter = this._register(new Emitter<NotificationToastEvent>());
  private readonly onDidChangeStatusMessageEmitter = this._register(new Emitter<NotificationStatusMessageEvent>());
  private readonly toastOptions = new Map<string, NotificationToastOptions>();
  private currentStatusMessage: NotificationStatusMessage | undefined;

  public get toasts(): readonly NotificationToastOptions[] {
    return [...this.toastOptions.values()];
  }

  public readonly onDidChangeToast = this.onDidChangeToastEmitter.event;
  public readonly onDidChangeStatusMessage = this.onDidChangeStatusMessageEmitter.event;

  public get statusMessage(): NotificationStatusMessage | undefined {
    return this.currentStatusMessage;
  }

  public setFilter(): void {}

  public getFilter(): NotificationsFilter {
    return 0;
  }

  public getFilters(): INotificationSourceFilter[] {
    return [];
  }

  public removeFilter(): void {}

  public notify(notification: INotification): INotificationHandle {
    const id = notification.id ?? DEFAULT_NOTIFICATION_TOAST_ID;
    const handle = new ToastNotificationHandle(this, id, notification);
    this.showNotification(id, notification, () => handle.close());
    return handle;
  }

  public info(message: NotificationMessage | NotificationMessage[]): void {
    this.notifyMany(Severity.Info, message);
  }

  public warn(message: NotificationMessage | NotificationMessage[]): void {
    this.notifyMany(Severity.Warning, message);
  }

  public error(message: NotificationMessage | NotificationMessage[]): void {
    this.notifyMany(Severity.Error, message);
  }

  public prompt(
    severity: Severity,
    message: string,
    choices: readonly (IPromptChoice | IPromptChoiceWithMenu)[],
    options?: IPromptOptions,
  ): INotificationHandle {
    const primary: IAction[] = [];
    const secondary: IAction[] = [];

    for (const choice of choices) {
      const action = this.createPromptAction(choice);
      if (choice.isSecondary) {
        secondary.push(action);
      } else {
        primary.push(action);
      }
    }

    return this.notify({
      ...options,
      severity,
      message,
      actions: {
        primary,
        secondary,
      },
    });
  }

  public status(message: NotificationMessage, options?: IStatusMessageOptions): IStatusHandle {
    const item: NotificationStatusMessage = options
      ? { message: getNotificationMessage(message), options }
      : { message: getNotificationMessage(message) };
    let isClosed = false;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const close = (): void => {
      if (isClosed) return;
      isClosed = true;
      if (showTimer) clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
      this.removeStatusMessage(item);
    };
    this._register({ dispose: close });

    const show = (): void => {
      if (isClosed) return;
      this.currentStatusMessage = item;
      this.onDidChangeStatusMessageEmitter.fire({ kind: "add", item });
      if (typeof options?.hideAfter === "number") {
        hideTimer = setTimeout(close, options.hideAfter);
      }
    };

    if (typeof options?.showAfter === "number") {
      showTimer = setTimeout(show, options.showAfter);
    } else {
      show();
    }

    return { close };
  }

  private removeStatusMessage(item: NotificationStatusMessage): void {
    if (this.currentStatusMessage !== item) {
      return;
    }

    this.currentStatusMessage = undefined;
    this.onDidChangeStatusMessageEmitter.fire({ kind: "remove", item });
  }

  public closeNotification(id?: string): void {
    this.toastOptions.delete(id ?? DEFAULT_NOTIFICATION_TOAST_ID);
    this.onDidChangeToastEmitter.fire({ kind: "dispose", id });
  }

  public clearNotifications(): void {
    this.toastOptions.clear();
    this.onDidChangeToastEmitter.fire({ kind: "disposeAll" });
  }

  private showToast(options: NotificationToastOptions): void {
    this.toastOptions.set(options.id ?? DEFAULT_NOTIFICATION_TOAST_ID, options);
    this.onDidChangeToastEmitter.fire({ kind: "show", options });
  }

  public showNotification(id: string, notification: INotification, onClose?: () => void): void {
    const presentation = notification.presentation;
    this.showToast({
      ...presentation,
      id,
      actions: notification.actions?.primary,
      duration: notification.sticky ? Number.POSITIVE_INFINITY : presentation?.duration,
      message: getNotificationMessage(notification.message),
      onClose,
      type: getToastType(notification.severity, presentation),
    });
  }

  private notifyMany(
    severity: Severity,
    message: NotificationMessage | NotificationMessage[],
  ): void {
    const messages = Array.isArray(message) ? message : [message];
    for (const entry of messages) {
      this.notify({ severity, message: entry });
    }
  }

  private createPromptAction(choice: IPromptChoice | IPromptChoiceWithMenu): IAction {
    return {
      id: `notification.prompt.${choice.label}`,
      label: choice.label,
      tooltip: "",
      class: undefined,
      enabled: true,
      run: () => choice.run(),
    };
  }
}

const getNotificationMessage = (message: NotificationMessage): string =>
  typeof message === "string" ? message : message.message;

const getToastType = (
  severity: Severity,
  presentation?: INotificationPresentationOptions,
): NotificationToastType => {
  if (presentation?.type) return presentation.type;
  const type = Severity.toString(severity);
  if (type === "error" || type === "warning" || type === "info") return type;
  return "info";
};

registerSingleton(PlatformNotificationService, NotificationService, InstantiationType.Delayed);
